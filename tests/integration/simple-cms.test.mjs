import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { createCmsPages } from "../../src/server/cms/pages.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { addCatalogItem } from "../../src/features/cms/catalog/editor-state.mjs";
import { hashPageContent } from "../../src/server/pages/content-hash.mjs";
import { loadPageGraph } from "../../src/server/pages/drafts.mjs";
import { getPublishedPage } from "../../src/server/pages/published.mjs";
import { getPublishedCatalog } from "../../src/server/catalog/published.mjs";
import { cleanupPublicFixture, emptyTracking } from "../fixtures/published-data.mjs";
import { runNextPublication } from "../../src/server/publishing/worker.mjs";
import { validatePageReadiness } from "../../src/server/pages/validation.mjs";
let fixture, pool, headers;
before(async () => {
  fixture = await createAuthFixture(); pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" })); headers = [];
  for (const account of fixture.accounts) {
    const jar = cookieJar(); assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar)).status, 200);
    headers.push(new Headers({ cookie: jar.header() }));
  }
});
after(async () => { await pool?.end(); await fixture?.cleanup(); });
const stop = new Error("rollback synthetic QA");
const check = async callback => {
  try { await drizzle(pool).transaction(async db => {
    const context = { db, authenticate: input => fixture.service.authenticate(input) };
    await callback({ pages: createCmsPages(context), catalog: createCmsCatalog(context), db }); throw stop;
  }); } catch (error) { if (error !== stop) throw error; }
};
const fields = { title: "QA halaman Indonesia", body: { blocks: [{ type: "paragraph", content: [{ text: "QA isi" }] }] } };
const save = row => ({ revisionId: row.id, expectedVersion: row.version, operations: [{ action: "save", data: { locale: "id", fields } }] });
const token = row => ({ revisionId: row.id, expectedVersion: row.version, expectedHash: row.contentHash });
test("single save stores an Indonesian page ready for exact Owner approval without optional fields", () => check(async ({ pages, db }) => {
  let row = await pages.write(headers[1], "create", { pageKey: "about" }); row = await pages.batch(headers[1], save(row));
  assert.equal(row.translations.length, 1); assert.equal(row.translations[0].locale, "id");
  const graph = await loadPageGraph(db, row); const before = hashPageContent(graph); assert.equal(validatePageReadiness(graph), true); assert.equal(hashPageContent(graph), before);
  row = await pages.write(headers[1], "submit", { revisionId: row.id, expectedVersion: row.version });
  await assert.rejects(pages.write(headers[1], "approve", token(row)), { code: "FORBIDDEN" });
  row = await pages.write(headers[0], "approve", token(row)); assert.equal(row.status, "published");
  await assert.rejects(pages.batch(headers[0], save(row)), { code: "REVISION_CONFLICT" });
}));
test("a later failed operation rolls back earlier fields, version and audits", () => check(async ({ pages, db }) => {
  const row = await pages.write(headers[1], "create", { pageKey: "about" });
  await assert.rejects(pages.batch(headers[1], { ...save(row), operations: [...save(row).operations, { action: "save", data: { locale: "en", fields } }] }), { code: "INVALID_INPUT" });
  const after = await pages.read(headers[1], row.id); assert.equal(after.version, row.version); assert.equal(after.translations.length, 0);
  assert.equal((await db.execute("SELECT action FROM public.page_workflow_events")).rows.length, 1);
}));
test("batch cannot forge workflows, version or actor and anonymous requests fail", () => check(async ({ pages }) => {
  const row = await pages.write(headers[1], "create", { pageKey: "about" });
  await assert.rejects(pages.batch(new Headers(), save(row)), { code: "AUTH_REQUIRED" });
  for (const operation of [{ action: "approve", data: {} }, { action: "save", data: { locale: "id", fields, expectedVersion: 1 } }, null]) {
    await assert.rejects(pages.batch(headers[1], { ...save(row), operations: [operation] }), { code: "INVALID_INPUT" });
  }
  await assert.rejects(pages.batch(headers[1], { ...save(row), actor: "owner" }), { code: "INVALID_INPUT" });
  await pages.batch(headers[1], save(row)); await assert.rejects(pages.batch(headers[1], save(row)), { code: "REVISION_CONFLICT" });
}));
test("one catalog save resolves new local category/product/price identities without English entries", () => check(async ({ catalog }) => {
  const original = await catalog.write(headers[1], "create", {});
  const category = addCatalogItem(original, "categoryCreate", { title: "QA kategori", sortOrder: 0 });
  const product = addCatalogItem(category.graph, "productCreate", { title: "QA produk", categoryId: category.graph.categories[0].id, basePrice: 25000, sortOrder: 0 });
  let graph = await catalog.batch(headers[1], { revisionId: original.revision.id, expectedVersion: original.revision.version, operations: [...category.operations, ...product.operations] });
  assert.equal(graph.products.length, 1); assert.equal(graph.productVariants[0].basePrice, 25000); assert.equal(graph.productTranslations.length, 1);
  assert.equal((await catalog.write(headers[1], "readiness", { revisionId: graph.revision.id, expectedVersion: graph.revision.version })).ready, true);
  graph = await catalog.write(headers[1], "submit", { revisionId: graph.revision.id, expectedVersion: graph.revision.version });
  graph = await catalog.write(headers[0], "approve", token(graph.revision)); assert.equal(graph.revision.status, "published");
}));
test("failed catalog alias/reference leaves no new identities or audit and English API writes are denied", () => check(async ({ catalog, db }) => {
  const original = await catalog.write(headers[1], "create", {}), created = addCatalogItem(original, "categoryCreate", { title: "QA kategori", sortOrder: 0 });
  await assert.rejects(catalog.batch(headers[1], { revisionId: original.revision.id, expectedVersion: 1, operations: [...created.operations,
    { action: "productCreate", data: { categoryId: "$00000000-0000-0000-0000-000000000000", slug: "qa", sortOrder: 0 } }] }), { code: "INVALID_INPUT" });
  assert.equal((await catalog.read(headers[1], original.revision.id)).categories.length, 0);
  assert.equal((await db.execute("SELECT * FROM public.categories")).rows.length, 0);
}));


test("Owner approves a saved draft directly and public reads immediately replace the complete page", () => check(async ({ pages, db }) => {
  let row = await pages.write(headers[0], "create", { pageKey: "home" });
  row = await pages.batch(headers[0], save(row));
  row = await pages.write(headers[0], "approve", token(row));
  assert.equal(row.status, "published");
  const read = () => getPublishedPage(db, { pageKey: "home", locale: "id" });
  assert.equal((await read()).revisionId, row.id);
  let next = await pages.write(headers[0], "clone", { sourceRevisionId: row.id, expectedSourceVersion: row.version });
  next = await pages.batch(headers[0], { ...save(next), operations: [{ action: "save", data: { locale: "id", fields: { ...fields, title: "QA pengganti", summary: "Ringkasan pengganti", seoTitle: "SEO pengganti" } } }] });
  assert.equal((await read()).revisionId, row.id);
  next = await pages.write(headers[0], "approve", token(next));
  const live = await read();
  assert.equal(live.revisionId, next.id); assert.equal(live.fields.title, "QA pengganti"); assert.equal(live.fields.seoTitle, "SEO pengganti");
  assert.equal((await pages.read(headers[0], row.id)).isLive, false);
  assert.equal((await pages.read(headers[0], next.id)).isLive, true);
}));

test("Owner direct catalog approval replaces names and prices without a review or publish action", () => check(async ({ catalog, db }) => {
  const original = await catalog.write(headers[0], "create", {});
  const category = addCatalogItem(original, "categoryCreate", { title: "QA kategori", sortOrder: 0 });
  const product = addCatalogItem(category.graph, "productCreate", { title: "QA produk", categoryId: category.graph.categories[0].id, basePrice: 25000, sortOrder: 0 });
  let graph = await catalog.batch(headers[0], { revisionId: original.revision.id, expectedVersion: original.revision.version, operations: [...category.operations, ...product.operations] });
  graph = await catalog.write(headers[0], "approve", token(graph.revision));
  const read = () => getPublishedCatalog(db);
  assert.equal((await read()).revision.id, graph.revision.id);
  let next = await catalog.write(headers[0], "clone", { sourceRevisionId: graph.revision.id, expectedSourceVersion: graph.revision.version });
  next = await catalog.write(headers[0], "variantUpdate", { revisionId: next.revision.id, expectedVersion: next.revision.version, productId: next.products[0].id, variantId: next.productVariants[0].id, code: "standard", basePrice: 31000, sortOrder: 0 });
  assert.equal((await read()).productVariants[0].basePrice, 25000);
  next = await catalog.write(headers[0], "approve", token(next.revision));
  assert.equal((await read()).revision.id, next.revision.id); assert.equal((await read()).productVariants[0].basePrice, 31000);
}));

test("Staff cannot directly approve drafts, including a forged scheduled approval", () => check(async ({ pages, catalog }) => {
  const row = await pages.write(headers[1], "create", { pageKey: "about" });
  for (const extra of [{}, { dueAt: new Date(Date.now() + 60000).toISOString() }]) {
    await assert.rejects(pages.write(headers[1], "approve", { ...token(row), ...extra }), { code: "FORBIDDEN" });
  }
  const graph = await catalog.write(headers[1], "create", {});
  await assert.rejects(catalog.write(headers[1], "approve", token(graph.revision)), { code: "FORBIDDEN" });
}));

test("invalid schedule, stale version and hash failures roll back approval and leave live content untouched", () => check(async ({ pages, db }) => {
  let row = await pages.write(headers[0], "create", { pageKey: "about" }); row = await pages.batch(headers[0], save(row));
  const audits = async () => (await db.execute("SELECT action FROM public.page_workflow_events")).rows.length;
  const count = await audits();
  for (const [patch, code] of [[{ dueAt: new Date(Date.now() - 1000).toISOString() }, "INVALID_TIME"], [{ expectedVersion: row.version + 1 }, "REVISION_CONFLICT"], [{ expectedHash: "a".repeat(64) }, "HASH_CONFLICT"]]) {
    await assert.rejects(pages.write(headers[0], "approve", { ...token(row), ...patch }), { code });
    assert.equal((await pages.read(headers[0], row.id)).status, "draft"); assert.equal(await audits(), count);
    assert.equal((await db.execute("SELECT * FROM public.page_publications")).rows.length, 0);
  }
  const empty = await pages.write(headers[0], "create", { pageKey: "home" });
  await assert.rejects(pages.write(headers[0], "approve", token(empty)), { code: "NOT_READY" });
}));

test("scheduled approval keeps old content until the job runs and approval never bypasses an existing schedule", () => check(async ({ pages, db }) => {
  let live = await pages.write(headers[0], "create", { pageKey: "about" }); live = await pages.batch(headers[0], save(live)); live = await pages.write(headers[0], "approve", token(live));
  let next = await pages.write(headers[0], "clone", { sourceRevisionId: live.id, expectedSourceVersion: live.version });
  next = await pages.write(headers[0], "approve", { ...token(next), dueAt: new Date(Date.now() + 200).toISOString() });
  assert.equal(next.status, "approved");
  assert.equal((await db.execute("SELECT revision_id FROM public.page_publications")).rows[0].revision_id, live.id);
  next = await pages.write(headers[0], "approve", token(next)); assert.equal(next.status, "approved");
  const other = await pages.write(headers[0], "clone", { sourceRevisionId: live.id, expectedSourceVersion: live.version });
  await assert.rejects(pages.write(headers[0], "approve", token(other)), { code: "SCHEDULE_EXISTS" });
  assert.equal((await pages.read(headers[0], other.id)).status, "draft");
  await new Promise(resolve => setTimeout(resolve, 250));
  await runNextPublication(db);
  assert.equal((await db.execute("SELECT revision_id FROM public.page_publications")).rows[0].revision_id, next.id);
}));


test("concurrent direct approval has one winner, one conflict, and one exact publication audit", async () => {
  const pages = createCmsPages({ db: drizzle(pool), authenticate: input => fixture.service.authenticate(input) });
  const tracked = emptyTracking();
  try {
    let row = await pages.write(headers[0], "create", { pageKey: "about" });
    tracked.pageRevisions.push(row.id); tracked.pages.push("about");
    row = await pages.batch(headers[0], save(row));
    const results = await Promise.allSettled([pages.write(headers[0], "approve", token(row)), pages.write(headers[0], "approve", token(row))]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.code, "REVISION_CONFLICT");
    assert.equal((await pages.read(headers[0], row.id)).isLive, true);
    const audit = await fixture.owner.query("SELECT action FROM public.page_workflow_events WHERE revision_id=$1 AND action IN ('submit','approve','publish') ORDER BY created_at", [row.id]);
    assert.deepEqual(audit.rows.map(row => row.action), ["submit", "approve", "publish"]);
  } finally { await cleanupPublicFixture(fixture.owner, tracked); }
});
