import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { getPublishedCatalog } from "../../src/server/catalog/published.mjs";

// Catalog card CRUD (ADR-037). Create/update need only the existing schema; hard delete is in
// catalog-delete.test.mjs because it requires migration 0014. Every test rolls back.
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
const [OWNER, STAFF] = [0, 1];
const input = (name, price = 25000, description = "") => ({ name, description, price });
const rows = async (tx, table) => (await tx.execute(`SELECT * FROM public.${table}`)).rows;

test("anonymous callers cannot list, create, update or delete", () => check(async api => {
  const anon = new Headers();
  for (const run of [() => api.list(anon), () => api.create(anon, input("QA")), () => api.update(anon, "qa", { ...input("QA"), expectedVersion: "a".repeat(64) }), () => api.remove(anon, "qa")]) {
    await assert.rejects(run(), { code: "AUTH_REQUIRED" });
  }
}));
test("Staff creates a card that is live immediately, newest first, with the real actor on every receipt", () => check(async (api, tx) => {
  assert.deepEqual((await api.list(jars[STAFF])).products, []);
  const first = (await api.create(jars[STAFF], input("QA Takoyaki", 25000, "Isi gurita"))).product;
  assert.equal(first.slug, "qa-takoyaki"); assert.equal(first.price, 25000); assert.equal(first.description, "Isi gurita"); assert.equal(first.image, null);
  assert.match(first.version, /^[0-9a-f]{64}$/);
  const second = (await api.create(jars[OWNER], input("QA Okonomiyaki", 30000))).product;
  const list = await api.list(jars[STAFF]);
  assert.deepEqual(list.products.map(row => row.slug), [second.slug, first.slug]);
  assert.equal(list.role, "staff"); assert.ok(list.updatedAt);
  assert.ok(list.products.every(row => !("id" in row) && !("categoryId" in row) && !("variants" in row)));
  // The public reader (hash + approval verified) sees both cards at the stored price.
  const published = await getPublishedCatalog(tx);
  assert.deepEqual(published.products.map(row => row.slug).sort(), ["qa-okonomiyaki", "qa-takoyaki"]);
  assert.deepEqual(published.productVariants.map(row => row.basePrice).sort(), [25000, 30000]);
  const approvals = await rows(tx, "catalog_approvals");
  assert.deepEqual(approvals.map(row => row.approved_by).sort(), [fixture.accounts[OWNER].id, fixture.accounts[STAFF].id].sort());
  const events = await rows(tx, "catalog_workflow_events");
  assert.ok(events.every(row => [fixture.accounts[OWNER].id, fixture.accounts[STAFF].id].includes(row.actor_id)));
  assert.equal(events.filter(row => row.action === "create").length, 2);
}));
test("slugs are automatic, collide to -2/-3, ignore later renames and reject empty slugs", () => check(async api => {
  const slugs = [];
  for (let n = 0; n < 3; n++) slugs.push((await api.create(jars[STAFF], input("QA Ramen"))).product.slug);
  assert.deepEqual(slugs, ["qa-ramen", "qa-ramen-2", "qa-ramen-3"]);
  const [target] = (await api.list(jars[STAFF])).products.filter(row => row.slug === "qa-ramen");
  const renamed = (await api.update(jars[STAFF], "qa-ramen", { ...input("QA Nama Baru"), expectedVersion: target.version })).product;
  assert.equal(renamed.slug, "qa-ramen"); assert.equal(renamed.name, "QA Nama Baru");
  for (const name of ["!!!", "たこ焼き"]) await assert.rejects(api.create(jars[STAFF], input(name)), { code: "INVALID_SLUG" });
}));
test("invalid input is rejected and leaves the live catalog and tables unchanged", () => check(async (api, tx) => {
  await api.create(jars[STAFF], input("QA Stabil"));
  const before = await Promise.all(["catalog_revisions", "catalog_workflow_events", "products"].map(async table => (await rows(tx, table)).length));
  const bad = [[{ ...input("QA"), categoryId: "x" }, "INVALID_INPUT"], [{ ...input("QA"), variants: [] }, "INVALID_INPUT"], [{ ...input("QA"), modifiers: [] }, "INVALID_INPUT"],
    [{ ...input("QA"), image: "x" }, "INVALID_INPUT"], [input("", 1), "INVALID_NAME"], [input("QA", -1), "INVALID_PRICE"], [input("QA", 1.5), "INVALID_PRICE"],
    [input("QA", 2 ** 53), "INVALID_PRICE"], [input("<b>QA</b>", 1), "INVALID_NAME"], [{ name: "QA", description: "<i>x</i>", price: 1 }, "INVALID_DESCRIPTION"]];
  for (const [body, code] of bad) await assert.rejects(api.create(jars[STAFF], body), { code });
  assert.deepEqual(await Promise.all(["catalog_revisions", "catalog_workflow_events", "products"].map(async table => (await rows(tx, table)).length)), before);
  assert.deepEqual((await api.list(jars[STAFF])).products.map(row => row.slug), ["qa-stabil"]);
}));
test("update replaces only that card, rejects stale versions and treats an identical save as a no-op", () => check(async (api, tx) => {
  const a = (await api.create(jars[STAFF], input("QA Kartu A", 10000))).product;
  const b = (await api.create(jars[STAFF], input("QA Kartu B", 20000))).product;
  const updated = (await api.update(jars[OWNER], a.slug, { ...input("QA Kartu A", 12000, "Baru"), expectedVersion: a.version })).product;
  assert.equal(updated.price, 12000); assert.equal(updated.description, "Baru"); assert.notEqual(updated.version, a.version);
  // A second session still holding the old token cannot overwrite the newer save.
  await assert.rejects(api.update(jars[STAFF], a.slug, { ...input("QA Timpa", 1), expectedVersion: a.version }), { code: "PRODUCT_CONFLICT" });
  const list = (await api.list(jars[STAFF])).products;
  assert.equal(list.find(row => row.slug === a.slug).name, "QA Kartu A");
  assert.equal(list.find(row => row.slug === b.slug).version, b.version); // unrelated card untouched
  const revisions = (await rows(tx, "catalog_revisions")).length;
  const same = (await api.update(jars[STAFF], a.slug, { ...input("QA Kartu A", 12000, "Baru"), expectedVersion: updated.version })).product;
  assert.equal(same.version, updated.version); assert.equal((await rows(tx, "catalog_revisions")).length, revisions);
  await assert.rejects(api.update(jars[STAFF], "tidak-ada", { ...input("QA"), expectedVersion: "a".repeat(64) }), { code: "NOT_FOUND" });
  await assert.rejects(api.update(jars[STAFF], "../x", { ...input("QA"), expectedVersion: "a".repeat(64) }), { code: "NOT_FOUND" });
  const published = await getPublishedCatalog(tx);
  assert.equal(published.productVariants.find(row => row.basePrice === 12000).code, "standard");
}));
test("a failed publication rolls back the replacement snapshot and keeps the previous live catalog", () => check(async (api, tx) => {
  const first = (await api.create(jars[STAFF], input("QA Awal", 1000))).product;
  const revisions = (await rows(tx, "catalog_revisions")).length;
  await assert.rejects(api.update(jars[STAFF], first.slug, { ...input("QA Gagal", 2000), expectedVersion: "b".repeat(64) }), { code: "PRODUCT_CONFLICT" });
  assert.equal((await rows(tx, "catalog_revisions")).length, revisions);
  assert.equal((await getPublishedCatalog(tx)).productVariants[0].basePrice, 1000);
}));
test("Staff cannot delete; the Owner-only check precedes any lookup or write", () => check(async (api, tx) => {
  const card = (await api.create(jars[STAFF], input("QA Tetap"))).product;
  const revisions = (await rows(tx, "catalog_revisions")).length;
  await assert.rejects(api.remove(jars[STAFF], card.slug), { code: "FORBIDDEN" });
  await assert.rejects(api.remove(jars[STAFF], "tidak-ada"), { code: "FORBIDDEN" });
  assert.equal((await rows(tx, "catalog_revisions")).length, revisions);
  assert.equal((await api.list(jars[STAFF])).products.length, 1);
}));
test("a disabled membership is denied even with a trusted-looking resolver", async () => {
  const subject = fixture.accounts[STAFF].id;
  await fixture.owner.query("UPDATE cms_auth.roles SET enabled=false WHERE user_id=$1", [subject]);
  try {
    const api = createCmsCatalog({ db: drizzle(pool), authenticate: async () => ({ subject, role: "owner" }) });
    await assert.rejects(api.list(null), { code: "AUTH_REQUIRED" });
    await assert.rejects(api.create(null, input("QA")), { code: "AUTH_REQUIRED" });
    await assert.rejects(api.remove(null, "qa"), { code: "AUTH_REQUIRED" });
  } finally { await fixture.owner.query("UPDATE cms_auth.roles SET enabled=true WHERE user_id=$1", [subject]); }
});
test("saving never touches publication jobs or any merchant-facing table", () => check(async (api, tx) => {
  const before = (await rows(tx, "publication_jobs")).length + (await rows(tx, "publication_events")).length;
  const card = (await api.create(jars[STAFF], input("QA Tanpa Sync"))).product;
  await api.update(jars[OWNER], card.slug, { ...input("QA Tanpa Sync", 99), expectedVersion: card.version });
  assert.equal((await rows(tx, "publication_jobs")).length + (await rows(tx, "publication_events")).length, before);
}));
