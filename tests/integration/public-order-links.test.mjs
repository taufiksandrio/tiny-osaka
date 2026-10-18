import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { getPublicDatabaseConfig } from "../../src/server/public/config.mjs";
import { readPublicCatalog } from "../../src/server/public/data.mjs";
import { OFFICIAL_ORDER_HOSTS } from "../../src/server/catalog/order-links.mjs";
import { createPublicFixture, cleanupPublicFixture, emptyTracking, token, catalogWorkflow, assertEmptyTestDatabase } from "../fixtures/published-data.mjs";

// Requires migration 0017 on the isolated TEST database. Fixture hosts are synthetic (.example); no real platform host
// is assumed and the allowlist is injected through the `hosts` parameter. Nothing here opens a connection to a platform.
const hosts = { grabfoodUrl: ["grab.fixture.example"], gofoodUrl: ["go.fixture.example"], shopeefoodUrl: ["shopee.fixture.example"] };
const GRAB = "https://grab.fixture.example/store/1?x=1", GO = "https://go.fixture.example/store/1", SHOPEE = "https://shopee.fixture.example/store/1";

const withPublishedProduct = async (orderLinks, run) => {
  const owner = await connectTestOwner();
  const app = new pg.Client(getPublicDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  const tracked = emptyTracking();
  const realFetch = globalThis.fetch; let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls++; throw new Error("unexpected outbound request"); };
  try {
    await app.connect();
    const fixture = await createPublicFixture(owner, tracked, { orderLinks });
    assert.equal(await readPublicCatalog(app), null, "approved catalog stays private");
    await catalogWorkflow(drizzle(owner)).publish(token(fixture.approved));
    await run(app, fixture);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = realFetch;
    await app.end();
    try { await cleanupPublicFixture(owner, tracked); await assertEmptyTestDatabase(owner); } finally { await owner.end(); }
  }
};

test("public read returns the stored links to the server only; the browser-bound shape holds validated orderLinks", () =>
  withPublishedProduct({ grabfoodUrl: GRAB, gofoodUrl: GO, shopeefoodUrl: SHOPEE }, async app => {
    const raw = (await app.query("SELECT public.public_read_catalog() AS content")).rows[0].content;
    assert.deepEqual([raw.products[0].grabfoodUrl, raw.products[0].gofoodUrl, raw.products[0].shopeefoodUrl], [GRAB, GO, SHOPEE]);
    const catalog = await readPublicCatalog(app, { hosts });
    const [product] = catalog.products;
    assert.deepEqual(product.orderLinks, [{ platform: "gofood", href: GO }, { platform: "grabfood", href: GRAB }, { platform: "shopeefood", href: SHOPEE }]);
    for (const key of ["grabfoodUrl", "gofoodUrl", "shopeefoodUrl"]) assert.equal(key in product, false, key);
    // Same keys as before plus orderLinks; no internal or audit field appears (AC-10).
    assert.deepEqual(Object.keys(product).sort(), ["categoryId", "description", "groups", "id", "orderLinks", "slug", "sortOrder", "title", "variants"]);
    assert.deepEqual(Object.keys(catalog).sort(), ["categories", "media", "products", "revision"]);
    assert.equal(JSON.stringify(catalog).includes("fixture.example/store/1?x=1"), true, "validated href is the stored link");
  }));

test("default allowlist is the shipped approved list: fixture hosts are not on it, so nothing is exposed", () =>
  withPublishedProduct({ grabfoodUrl: GRAB, gofoodUrl: GO }, async app => {
    assert.deepEqual(OFFICIAL_ORDER_HOSTS.grabfoodUrl, ["app.grab.com"]);
    assert.deepEqual(OFFICIAL_ORDER_HOSTS.gofoodUrl, ["gofood.link"]);
    const catalog = await readPublicCatalog(app);
    assert.deepEqual(catalog.products[0].orderLinks, []);
    assert.equal(JSON.stringify(catalog).includes("fixture.example"), false);
  }));

test("links with a host outside the allowlist, userinfo or a port are dropped; valid ones remain; empty ones are absent", () =>
  withPublishedProduct({ grabfoodUrl: "https://evil.example/x", gofoodUrl: GO, shopeefoodUrl: "https://u:p@shopee.fixture.example/x" }, async app => {
    const { products: [product] } = await readPublicCatalog(app, { hosts });
    assert.deepEqual(product.orderLinks, [{ platform: "gofood", href: GO }]);
    const text = JSON.stringify(await readPublicCatalog(app, { hosts }));
    assert.equal(text.includes("evil.example"), false);
    assert.equal(text.includes("u:p@"), false);
  }));

test("a product without links has an empty orderLinks array", () =>
  withPublishedProduct(null, async app => {
    const { products: [product] } = await readPublicCatalog(app, { hosts });
    assert.deepEqual(product.orderLinks, []);
  }));
