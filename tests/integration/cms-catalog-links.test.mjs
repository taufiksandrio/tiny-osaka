import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { loadCatalogGraph } from "../../src/server/catalog/review.mjs";
import { hashCatalogContent } from "../../src/server/catalog/content-hash.mjs";
import { getPublishedCatalog } from "../../src/server/catalog/published.mjs";
import { verifyCatalogProtection } from "../../scripts/lib/catalog-protection.mjs";

// Optional order links (spec section 19, AC-37..AC-44). REQUIRES migration 0015 on the isolated test
// database: the product_entries.*_url columns must exist. Every service test rolls back. Links are stored
// text only: nothing here (or in the service) may open a connection, so fetch is stubbed to fail loudly.
let fixture, pool, jars, realFetch, fetchCalls;
before(async () => {
  fixture = await createAuthFixture(); pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" })); jars = [];
  for (const account of fixture.accounts) {
    const jar = cookieJar(); assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar)).status, 200);
    jars.push(new Headers({ cookie: jar.header() }));
  }
  realFetch = globalThis.fetch; fetchCalls = 0;
  globalThis.fetch = (...args) => { fetchCalls++; throw new Error("unexpected outbound request: " + String(args[0])); };
});
after(async () => { globalThis.fetch = realFetch; await pool?.end(); await fixture?.cleanup(); });
const rollback = new Error("rollback QA transaction");
const check = async callback => {
  try { await drizzle(pool).transaction(async tx => {
    await callback(createCmsCatalog({ db: tx, authenticate: headers => fixture.service.authenticate(headers) }), tx); throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
};
const [OWNER, STAFF] = [0, 1];
const GRAB = "https://shop.example/grab/1", GO = "https://shop.example/go/1", SHOPEE = "https://shop.example/shopee/1";
const input = (name, price = 25000, extra = {}) => ({ name, description: "", price, ...extra });
const body = (card, extra) => ({ name: card.name, description: card.description, price: card.price, expectedVersion: card.version, ...extra });
const links = card => [card.grabfoodUrl, card.gofoodUrl, card.shopeefoodUrl];
const rows = async (tx, text) => (await tx.execute(text)).rows;
const count = async (tx, table) => Number((await rows(tx, `SELECT count(*) AS n FROM public.${table}`))[0].n);
const stored = (tx, slug) => rows(tx, `SELECT e.grabfood_url, e.gofood_url, e.shopeefood_url FROM public.product_entries e
  JOIN public.catalog_publication p ON p.revision_id = e.revision_id JOIN public.products pr ON pr.id = e.product_id WHERE pr.slug = '${slug}'`)
  .then(result => result.map(row => [row.grabfood_url, row.gofood_url, row.shopeefood_url])[0]);
const pgError = pattern => error => pattern.test(error.cause?.message ?? error.message);

test("migration 0015 columns and CHECK constraints match the reviewed definition", async () => {
  await verifyCatalogProtection(fixture.owner, "tiny_osaka_test_owner", 16);
});
test("create with and without links; GET returns all three fields (null when empty); trimming applies", () => check(async (api, tx) => {
  const plain = (await api.create(jars[STAFF], input("QA Polos"))).product;
  assert.deepEqual(links(plain), [null, null, null]);
  const full = (await api.create(jars[STAFF], input("QA Penuh", 1, { grabfoodUrl: ` ${GRAB} `, gofoodUrl: GO, shopeefoodUrl: SHOPEE }))).product;
  assert.deepEqual(links(full), [GRAB, GO, SHOPEE]);
  const partial = (await api.create(jars[OWNER], input("QA Sebagian", 1, { gofoodUrl: GO, grabfoodUrl: null, shopeefoodUrl: "   " }))).product;
  assert.deepEqual(links(partial), [null, GO, null]);
  const list = (await api.list(jars[OWNER])).products;
  assert.deepEqual(links(list.find(row => row.slug === full.slug)), [GRAB, GO, SHOPEE]);
  assert.deepEqual(links(list.find(row => row.slug === plain.slug)), [null, null, null]);
  assert.deepEqual(await stored(tx, full.slug), [GRAB, GO, SHOPEE]);
}));
test("invalid links are rejected with INVALID_ORDER_URL and nothing is written", () => check(async (api, tx) => {
  const before = [await count(tx, "catalog_revisions"), await count(tx, "products")];
  for (const extra of [{ grabfoodUrl: "http://shop.example/x" }, { gofoodUrl: "javascript:alert(1)" }, { shopeefoodUrl: "data:text/html,x" },
    { grabfoodUrl: "https://u:p@shop.example/x" }, { gofoodUrl: "https://shop.example:8443/x" }, { shopeefoodUrl: "https://shop.example/" + "x".repeat(2100) },
    { grabfoodUrl: 5 }, { gofoodUrl: {} }]) {
    await assert.rejects(api.create(jars[STAFF], input("QA Ditolak", 1, extra)), { code: "INVALID_ORDER_URL" }, JSON.stringify(extra).slice(0, 80));
  }
  await assert.rejects(api.create(jars[STAFF], input("QA Ditolak", 1, { tokopediaUrl: GRAB })), { code: "INVALID_INPUT" });
  assert.deepEqual([await count(tx, "catalog_revisions"), await count(tx, "products")], before);
}));
test("PATCH: absent key keeps, string sets or replaces, null and blank remove; keys are independent", () => check(async (api, tx) => {
  const created = (await api.create(jars[STAFF], input("QA Ubah", 1000, { grabfoodUrl: GRAB, gofoodUrl: GO }))).product;
  // Absent keys: nothing changes, no new snapshot.
  const revisions = await count(tx, "catalog_revisions");
  assert.equal((await api.update(jars[STAFF], created.slug, body(created))).product.version, created.version);
  assert.equal(await count(tx, "catalog_revisions"), revisions);
  // Set a third link: the others are untouched.
  const added = (await api.update(jars[STAFF], created.slug, body(created, { shopeefoodUrl: SHOPEE }))).product;
  assert.deepEqual(links(added), [GRAB, GO, SHOPEE]); assert.notEqual(added.version, created.version);
  // Replace one.
  const replaced = (await api.update(jars[OWNER], created.slug, body(added, { gofoodUrl: "https://shop.example/go/2" }))).product;
  assert.deepEqual(links(replaced), [GRAB, "https://shop.example/go/2", SHOPEE]);
  // Remove one with null, one with blank text.
  const cleared = (await api.update(jars[STAFF], created.slug, body(replaced, { grabfoodUrl: null, shopeefoodUrl: "  " }))).product;
  assert.deepEqual(links(cleared), [null, "https://shop.example/go/2", null]);
  assert.deepEqual(await stored(tx, created.slug), [null, "https://shop.example/go/2", null]);
  // Editing only the name keeps the links.
  const renamed = (await api.update(jars[OWNER], created.slug, { ...body(cleared), name: "QA Ubah Baru" })).product;
  assert.deepEqual(links(renamed), links(cleared));
  // Invalid value is rejected and leaves the stored value alone.
  await assert.rejects(api.update(jars[STAFF], created.slug, body(renamed, { gofoodUrl: "ftp://x.example" })), { code: "INVALID_ORDER_URL" });
  assert.deepEqual(links((await api.list(jars[STAFF])).products.find(row => row.slug === created.slug)), links(renamed));
}));
test("identical re-save and clearing an absent link are no-ops without a new snapshot", () => check(async (api, tx) => {
  const card = (await api.create(jars[OWNER], input("QA Sama", 1, { gofoodUrl: GO }))).product;
  const revisions = await count(tx, "catalog_revisions");
  for (const extra of [{ gofoodUrl: GO }, { gofoodUrl: `  ${GO}  ` }, { grabfoodUrl: null }, { shopeefoodUrl: "" }, { grabfoodUrl: null, gofoodUrl: GO, shopeefoodUrl: null }]) {
    assert.equal((await api.update(jars[STAFF], card.slug, body(card, extra))).product.version, card.version, JSON.stringify(extra));
  }
  assert.equal(await count(tx, "catalog_revisions"), revisions);
}));
test("the version token covers links: stale token is PRODUCT_CONFLICT and other cards keep their version", () => check(async (api) => {
  const card = (await api.create(jars[OWNER], input("QA Versi", 1, { grabfoodUrl: GRAB }))).product;
  const other = (await api.create(jars[OWNER], input("QA Versi Lain", 1, { grabfoodUrl: GRAB }))).product;
  await api.update(jars[OWNER], card.slug, body(card, { grabfoodUrl: "https://shop.example/grab/9" }));
  await assert.rejects(api.update(jars[STAFF], card.slug, body(card, { grabfoodUrl: "https://shop.example/grab/10" })), { code: "PRODUCT_CONFLICT" });
  assert.equal((await api.list(jars[STAFF])).products.find(row => row.slug === other.slug).version, other.version);
  assert.notEqual(card.version, (await api.list(jars[STAFF])).products.find(row => row.slug === card.slug).version);
}));
test("links survive clones (edit another product, delete another product, change the image) and are not shared between products", () => check(async (api, tx) => {
  const a = (await api.create(jars[STAFF], input("QA Tautan A", 1, { grabfoodUrl: GRAB, shopeefoodUrl: SHOPEE }))).product;
  const b = (await api.create(jars[STAFF], input("QA Tautan B", 1))).product;
  const c = (await api.create(jars[STAFF], input("QA Tautan C", 1, { gofoodUrl: GO }))).product;
  await api.update(jars[STAFF], b.slug, body(b, { name: "QA Tautan B2" }));
  await api.remove(jars[OWNER], c.slug);
  const list = (await api.list(jars[OWNER])).products;
  assert.deepEqual(links(list.find(row => row.slug === a.slug)), [GRAB, null, SHOPEE]);
  assert.deepEqual(links(list.find(row => row.slug === b.slug)), [null, null, null]);
  assert.equal(list.some(row => row.slug === c.slug), false);
  assert.deepEqual(await stored(tx, a.slug), [GRAB, null, SHOPEE]);
}));
test("deleting a product removes its links from every snapshot; a reused slug starts without links", () => check(async (api, tx) => {
  const gone = (await api.create(jars[STAFF], input("QA Hapus Tautan", 1, { grabfoodUrl: "https://shop.example/hapus/grab", gofoodUrl: "https://shop.example/hapus/go" }))).product;
  const keep = (await api.create(jars[STAFF], input("QA Tetap Tautan", 1, { shopeefoodUrl: SHOPEE }))).product;
  await api.update(jars[OWNER], gone.slug, body(gone, { shopeefoodUrl: "https://shop.example/hapus/shopee" }));
  assert.ok(await count(tx, "catalog_revisions") >= 3);
  await api.remove(jars[OWNER], gone.slug);
  const left = await rows(tx, "SELECT grabfood_url, gofood_url, shopeefood_url FROM public.product_entries");
  assert.equal(JSON.stringify(left).includes("hapus"), false);
  assert.deepEqual(left.map(row => row.shopeefood_url), [SHOPEE]);
  assert.deepEqual(links((await api.list(jars[OWNER])).products.find(row => row.slug === keep.slug)), [null, null, SHOPEE]);
  const reused = (await api.create(jars[STAFF], input("QA Hapus Tautan", 2))).product;
  assert.equal(reused.slug, gone.slug); assert.deepEqual(links(reused), [null, null, null]);
}));
test("frozen snapshots refuse link updates and the CHECK constraint rejects non-https text", () => check(async (api, tx) => {
  const card = (await api.create(jars[OWNER], input("QA Beku", 1, { gofoodUrl: GO }))).product;
  await assert.rejects(tx.transaction(inner => inner.execute(`UPDATE public.product_entries SET gofood_url = 'https://shop.example/ubah'
    WHERE product_id = (SELECT id FROM public.products WHERE slug = '${card.slug}')`)), pgError(/writable draft/i));
  assert.deepEqual(await stored(tx, card.slug), [null, GO, null]);
}));
test("stored content hashes of every existing snapshot still verify; a snapshot with links verifies too", () => check(async (api, tx) => {
  await api.create(jars[OWNER], input("QA Hash Polos"));
  await api.create(jars[OWNER], input("QA Hash Tautan", 1, { grabfoodUrl: GRAB, gofoodUrl: GO, shopeefoodUrl: SHOPEE }));
  const revisions = await rows(tx, "SELECT id FROM public.catalog_revisions WHERE content_hash IS NOT NULL");
  assert.ok(revisions.length >= 2);
  for (const { id } of revisions) {
    const [revision] = await rows(tx, `SELECT id, version, content_hash AS "contentHash" FROM public.catalog_revisions WHERE id = '${id}'`);
    const graph = await loadCatalogGraph(tx, revision);
    assert.equal(hashCatalogContent(graph), revision.contentHash, id);
  }
}));
test("links are stored only: no public exposure, no outbound request, RBAC and audit actor", () => check(async (api, tx) => {
  await assert.rejects(api.create(new Headers(), input("QA Anon", 1, { grabfoodUrl: GRAB })), { code: "AUTH_REQUIRED" });
  const card = (await api.create(jars[STAFF], input("QA Publik", 1, { grabfoodUrl: GRAB, gofoodUrl: GO, shopeefoodUrl: SHOPEE }))).product;
  const published = await getPublishedCatalog(tx);
  const text = JSON.stringify(published);
  assert.ok(text.includes(card.slug));
  for (const link of [GRAB, GO, SHOPEE]) assert.equal(text.includes(link), false);
  assert.equal(Object.keys(published.products[0]).some(key => /url$/i.test(key)), false);
  const events = await rows(tx, "SELECT action, actor_id FROM public.catalog_workflow_events");
  assert.ok(events.some(row => row.action === "create" && row.actor_id === fixture.accounts[STAFF].id));
  assert.equal(fetchCalls, 0);
}));
