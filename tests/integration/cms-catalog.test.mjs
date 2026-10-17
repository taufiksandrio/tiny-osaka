import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { seedCmsCatalog } from "../fixtures/cms-catalog.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { getPublishedCatalog } from "../../src/server/catalog/published.mjs";
import { calculatePrice } from "../../src/server/catalog/pricing.mjs";
import { verifyCmsProtection } from "../../scripts/lib/cms-protection.mjs";
import { cleanupPublicFixture, emptyTracking } from "../fixtures/published-data.mjs";
let fixture, pool, jars;
before(async () => {
  fixture = await createAuthFixture(); pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" })); jars = [];
  for (const account of fixture.accounts) {
    const jar = cookieJar(); assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar)).status, 200);
    jars.push(new Headers({ cookie: jar.header() }));
  }
});
after(async () => { await pool?.end(); await fixture?.cleanup(); });
const rollback = new Error("rollback QA transaction");
const check = async callback => {
  try { await drizzle(pool).transaction(async tx => {
    await callback(createCmsCatalog({ db: tx, authenticate: headers => fixture.service.authenticate(headers) }), tx); throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
};
const token = graph => ({ revisionId: graph.revision.id, expectedVersion: graph.revision.version, expectedHash: graph.revision.contentHash });
const seed = api => seedCmsCatalog((action, data) => api.write(jars[1], action, data));
test("catalog CMS least privileges retain auth/media/public isolation", async () => verifyCmsProtection(fixture.owner, "tiny_osaka_test_owner"));
test("anonymous cannot access or mutate catalog", () => check(async api => {
  for (const run of [() => api.list(new Headers()), () => api.read(new Headers(), "invalid"), () => api.write(new Headers(), "create", {})]) await assert.rejects(run(), { code: "AUTH_REQUIRED" });
}));
test("Staff edits bilingual categories/products/prices/modifiers with atomic audits and readiness", () => check(async (api, tx) => {
  let graph = await seed(api);
  assert.equal((await api.write(jars[1], "readiness", { revisionId: graph.revision.id, expectedVersion: graph.revision.version })).ready, true);
  const productId = graph.products[0].id, groupId = graph.modifierGroups[0].id, variantId = graph.productVariants[0].id;
  const save = async (action, data) => { graph = await api.write(jars[1], action, { revisionId: graph.revision.id, expectedVersion: graph.revision.version, ...data }); };
  await save("categoryPlacement", { categoryId: graph.categories[0].id, sortOrder: 2 });
  await save("productPlacement", { productId, categoryId: graph.categories[0].id, sortOrder: 3 });
  await save("variantUpdate", { productId, variantId, code: "standard", basePrice: 27000, sortOrder: 0 });
  await save("groupUpdate", { productId, groupId, code: "extras", selectionType: "multiple", minSelections: 0, maxSelections: 1, sortOrder: 0 });
  await save("optionUpdate", { productId, groupId, optionId: graph.modifierOptions[0].id, code: "extra", priceDelta: 6000, sortOrder: 0 });
  const product = { revisionId: graph.revision.id, productId, variants: graph.productVariants, groups: [{ ...graph.modifierGroups[0], options: graph.modifierOptions }] };
  assert.equal(calculatePrice(product, { revisionId: graph.revision.id, productId, optionIds: [graph.modifierOptions[0].id] }), 33000);
  assert.throws(() => calculatePrice(product, { revisionId: graph.revision.id, productId, optionIds: ["foreign"] }));
  const count = Number((await tx.execute("SELECT count(*) FROM public.catalog_workflow_events")).rows[0].count);
  assert.equal(count, graph.revision.version); // One create event and one event per consuming edit.
  assert.equal((await api.read(jars[0], graph.revision.id)).productTranslations.length, 2);
}));
test("Staff cannot forge Owner transitions and database membership overrides resolver role", () => check(async (api, tx) => {
  let graph = await seed(api); graph = await api.write(jars[1], "submit", { revisionId: graph.revision.id, expectedVersion: graph.revision.version });
  for (const action of ["approve", "reject", "publish", "archive"]) await assert.rejects(api.write(jars[1], action, token(graph)), { code: "FORBIDDEN" });
  const forged = createCmsCatalog({ db: tx, authenticate: async () => ({ subject: fixture.accounts[1].id, role: "owner" }) });
  await assert.rejects(forged.write(jars[1], "approve", token(graph)), { code: "FORBIDDEN" });
  await assert.rejects(api.write(jars[1], "approve", { ...token(graph), role: "owner" }), { code: "INVALID_INPUT" });
}));
test("exact Owner approval publishes; frozen edits, wrong hashes and live archive fail; clone keeps live", () => check(async (api, tx) => {
  let graph = await seed(api); assert.equal(await getPublishedCatalog(tx), null);
  graph = await api.write(jars[1], "submit", { revisionId: graph.revision.id, expectedVersion: graph.revision.version });
  await assert.rejects(api.write(jars[1], "productTranslation", { revisionId: graph.revision.id, expectedVersion: graph.revision.version, productId: graph.products[0].id, locale: "id", title: "Changed", description: "" }), { code: "REVISION_CONFLICT" });
  graph = await api.write(jars[0], "approve", token(graph));
  await assert.rejects(api.write(jars[0], "publish", { ...token(graph), expectedHash: "a".repeat(64) }), { code: "HASH_CONFLICT" });
  graph = await api.write(jars[0], "publish", token(graph));
  await api.write(jars[0], "publish", token(graph));
  await assert.rejects(api.write(jars[0], "archive", token(graph)), { code: "LIVE_REVISION" });
  let clone = await api.write(jars[1], "clone", { sourceRevisionId: graph.revision.id, expectedSourceVersion: graph.revision.version });
  assert.equal(clone.revision.contentHash, null); assert.equal(clone.revision.status, "draft");
  clone = await api.write(jars[1], "productTranslation", { revisionId: clone.revision.id, expectedVersion: clone.revision.version, productId: clone.products[0].id, locale: "id", title: "Only draft", description: "" });
  assert.equal((await getPublishedCatalog(tx)).productTranslations.find(row => row.locale === "id").title, "QA product id");
  assert.equal((await api.read(jars[0], graph.revision.id)).isLive, true);
}));
test("incomplete, invalid bounded input, duplicate slug and foreign scope consume no losing version/audit", () => check(async api => {
  let graph = await api.write(jars[1], "create", {});
  await assert.rejects(api.write(jars[1], "submit", { revisionId: graph.revision.id, expectedVersion: 1 }), { code: "NOT_READY" });
  graph = await seed(api);
  const data = { revisionId: graph.revision.id, expectedVersion: graph.revision.version, productId: graph.products[0].id, locale: "id", title: "a".repeat(241), description: "" };
  await assert.rejects(api.write(jars[1], "productTranslation", data), { code: "INVALID_INPUT" });
  await assert.rejects(api.write(jars[1], "productTranslation", { ...data, title: "Valid", productId: "00000000-0000-0000-0000-000000000000" }), { code: "ENTRY_NOT_FOUND" });
  await assert.rejects(api.write(jars[1], "categoryCreate", { revisionId: graph.revision.id, expectedVersion: graph.revision.version, slug: graph.categories[0].slug, sortOrder: 0 }), { code: "SLUG_CONFLICT" });
  assert.equal((await api.read(jars[0], graph.revision.id)).revision.version, graph.revision.version);
}));
test("Owner rejection and archive retain audit", () => check(async (api, tx) => {
  let graph = await seed(api); graph = await api.write(jars[1], "submit", { revisionId: graph.revision.id, expectedVersion: graph.revision.version });
  graph = await api.write(jars[0], "reject", token(graph)); graph = await api.write(jars[0], "archive", token(graph));
  assert.equal(graph.revision.status, "archived");
  const actions = (await tx.execute("SELECT action FROM public.catalog_workflow_events")).rows.map(row => row.action);
  for (const action of ["create", "save", "submit", "reject", "archive"]) assert.ok(actions.includes(action));
}));
test("simultaneous real CMS connections retain one winner and no losing audit", async () => {
  const api = createCmsCatalog({ db: drizzle(pool), authenticate: headers => fixture.service.authenticate(headers) });
  const tracked = emptyTracking(); let graph;
  try {
    graph = await api.write(jars[1], "create", {}); tracked.revisions.push(graph.revision.id);
    graph = await api.write(jars[1], "categoryCreate", { revisionId: graph.revision.id, expectedVersion: 1, slug: "qa-race-" + graph.revision.id, sortOrder: 0 }); tracked.categories.push(graph.categories[0].id);
    const data = { revisionId: graph.revision.id, expectedVersion: graph.revision.version, categoryId: graph.categories[0].id, locale: "id", title: "QA race", description: "" };
    const results = await Promise.allSettled([api.write(jars[1], "categoryTranslation", data), api.write(jars[1], "categoryTranslation", data)]);
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    assert.equal(results.find(row => row.status === "rejected").reason.code, "REVISION_CONFLICT");
    assert.equal((await api.read(jars[0], graph.revision.id)).revision.version, 3);
    assert.equal(Number((await fixture.owner.query("SELECT count(*) FROM public.catalog_workflow_events WHERE revision_id=$1", [graph.revision.id])).rows[0].count), 3);
  } finally { await cleanupPublicFixture(fixture.owner, tracked); }
});
test("expired idle session denies catalog reads and mutations", async () => {
  await fixture.owner.query("UPDATE cms_auth.session_activity a SET last_active_at=clock_timestamp()-interval '61 minutes' FROM cms_auth.sessions s WHERE s.id=a.session_id AND s.user_id=$1", [fixture.accounts[1].id]);
  const api = createCmsCatalog({ db: drizzle(pool), authenticate: headers => fixture.service.authenticate(headers) });
  await assert.rejects(api.list(jars[1]), { code: "AUTH_REQUIRED" }); await assert.rejects(api.write(jars[1], "create", {}), { code: "AUTH_REQUIRED" });
});
