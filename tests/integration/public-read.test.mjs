import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { getPublicDatabaseConfig } from "../../src/server/public/config.mjs";
import { readPublicCatalog, readPublicPage } from "../../src/server/public/data.mjs";
import { createPublicFixture, cleanupPublicFixture, emptyTracking, token, catalogWorkflow, pageWorkflow, assertEmptyTestDatabase } from "../fixtures/published-data.mjs";
import { productPrice, listedProducts, featuredProducts, newestFirst } from "../../src/server/public/view-models.mjs";
import { createProduct } from "../../src/server/catalog/products.mjs";
import { fields } from "../fixtures/page-content.mjs";

test("application reader exposes exact published content with no table or draft privileges", async () => {
  const owner = await connectTestOwner();
  const app = new pg.Client(getPublicDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  const tracked = emptyTracking();
  try {
    await app.connect();
    assert.equal(await readPublicCatalog(app, "id"), null);
    assert.equal(await readPublicPage(app, "about", "id"), null);
    const fixture = await createPublicFixture(owner, tracked);
    assert.equal(await readPublicCatalog(app, "id"), null, "approved catalog remains private");
    await assert.rejects(app.query("SELECT * FROM public.page_revisions"), error => error.code === "42501");
    await assert.rejects(app.query("UPDATE public.catalog_publication SET content_hash='x'"), error => error.code === "42501");
    await assert.rejects(app.query("SET ROLE tiny_osaka_test_owner"), error => error.code === "42501");
    await catalogWorkflow(drizzle(owner)).publish(token(fixture.approved));
    await app.query("SET search_path=pg_temp");
    for (const locale of ["id"]) {
      const catalog = await readPublicCatalog(app, locale);
      assert.equal(catalog.products[0].title, `QA Product ${locale}`);
      assert.equal(catalog.categories[0].title, `QA Category ${locale}`);
      assert.equal(productPrice(catalog.products[0]), 250000, "public price is the one stored standard price");
      assert.equal(catalog.media[0].alt, locale === "id" ? "QA gambar" : "QA image");
      // Stage 1 card model: the modifier option (+150000) must never leak into the displayed price.
      const [listed] = listedProducts(catalog);
      assert.equal(listed.price, 250000);
      assert.notEqual(listed.price, 250000 + 150000);
      assert.ok(!/modifier/i.test(JSON.stringify(catalog)), "public catalog payload never mentions modifiers");
      assert.deepEqual(Object.keys(listed).filter(key => /modifier|option/i.test(key)), []);
      const page = await readPublicPage(app, "about", locale);
      assert.equal(page.fields.title, `QA about ${locale}`);
      assert.equal(page.media[0].asset.kind, "youtube");
      assert.equal(page.media[0].poster.kind, "image");
      for (const secret of ["contentHash", "storageKey", "checksum", "approvedBy", "qa-public-owner"]) {
        assert.ok(!JSON.stringify({ catalog, page }).includes(secret));
      }
    }
    // Five newer cards with distinct prices go live through the real card service (owner connection, test DB only).
    const actor = { subject: "qa-public-owner", role: "owner" };
    const prices = [10000, 20000, 30000, 40000, 50000];
    for (const [index, price] of prices.entries()) {
      await drizzle(owner).transaction(tx => createProduct(tx, actor, { name: `QA Kartu ${index + 1}`, description: "", price }));
    }
    tracked.revisions = (await owner.query("SELECT id FROM public.catalog_revisions")).rows.map(row => row.id);
    tracked.products = (await owner.query("SELECT id FROM public.products")).rows.map(row => row.id);
    tracked.categories = (await owner.query("SELECT id FROM public.categories")).rows.map(row => row.id);
    const grown = await readPublicCatalog(app, "id");
    assert.equal(grown.products.length, 6);
    const ordered = newestFirst(grown.products);
    assert.deepEqual(ordered.map(product => product.title), ["QA Kartu 5", "QA Kartu 4", "QA Kartu 3", "QA Kartu 2", "QA Kartu 1", "QA Product id"], "newest first");
    assert.deepEqual(listedProducts(grown).map(product => product.price), [50000, 40000, 30000, 20000, 10000, 250000], "each card keeps its own single price");
    for (const product of grown.products) assert.equal(productPrice(product), listedProducts(grown).find(row => row.id === product.id).price);
    assert.equal(featuredProducts(grown).length, 4, "home page shows at most 4");
    assert.deepEqual(featuredProducts(grown).map(product => product.title), ["QA Kartu 5", "QA Kartu 4", "QA Kartu 3", "QA Kartu 2"]);
    assert.equal(featuredProducts({ products: grown.products.slice(0, 2) }).length, 2);
    assert.ok(!/modifier/i.test(JSON.stringify(grown)));
    assert.equal(await readPublicCatalog(app, "en"), null);
    assert.equal(await readPublicPage(app, "about", "en"), null);
    const wf = pageWorkflow(drizzle(owner));
    const draft = await wf.createDraft({ pageKey: "about" }); tracked.pageRevisions.push(draft.id);
    let saved;
    for (const [i, locale] of ["id", "en"].entries()) saved = await wf.saveTranslation({ revisionId: draft.id, expectedVersion: i + 1, locale,
      fields: { ...fields("about"), title: `Replacement ${locale}` } });
    const approved = await wf.approve(token(await wf.submit({ revisionId: draft.id, expectedVersion: saved.version })));
    assert.equal((await readPublicPage(app, "about", "id")).fields.title, "QA about id");
    await wf.publish(token(approved));
    assert.equal((await readPublicPage(app, "about", "id")).fields.title, "Replacement id", "fresh query sees replacement");
    assert.equal(await readPublicCatalog(app, "xx"), null);
    assert.equal(await readPublicPage(app, "about');DROP TABLE pages;--", "id"), null);
    assert.equal((await app.query("SELECT public.public_read_page($1,$2) AS value", ["unknown", "id"])).rows[0].value, null);
  } finally {
    await app.end();
    try { await cleanupPublicFixture(owner, tracked); await assertEmptyTestDatabase(owner); } finally { await owner.end(); }
  }
});
