import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { getPublishedCatalog } from "../../src/server/catalog/published.mjs";
import { verifyCmsProtection } from "../../scripts/lib/cms-protection.mjs";
import { verifyCatalogProtection } from "../../scripts/lib/catalog-protection.mjs";

// Hard delete (ADR-037, Opsi A1). REQUIRES migration 0014 on the isolated test database
// (npm run db:migrate:test, after explicit approval). Every test rolls back.
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
const input = (name, price = 25000) => ({ name, description: "", price });
const rows = async (tx, text) => (await tx.execute(text)).rows;
const count = async (tx, table) => Number((await rows(tx, `SELECT count(*) AS n FROM public.${table}`))[0].n);
// Drizzle wraps driver errors; the PostgreSQL message is on `cause`.
const pgError = pattern => error => pattern.test(error.cause?.message ?? error.message);
const productTables = ["products", "product_entries", "product_translations", "product_variants", "variant_translations", "catalog_media_refs"];

test("migration 0014 objects match the reviewed definitions and privileges", async () => {
  await verifyCatalogProtection(fixture.owner, "tiny_osaka_test_owner", 15);
  await verifyCmsProtection(fixture.owner, "tiny_osaka_test_owner", { deletion: true });
});
test("Owner deletes permanently: one snapshot left, no product rows anywhere, log written, slug reusable", () => check(async (api, tx) => {
  const keep = (await api.create(jars[STAFF], input("QA Simpan", 1000))).product;
  const gone = (await api.create(jars[STAFF], input("QA Hapus", 2000))).product;
  await api.update(jars[OWNER], gone.slug, { name: "QA Hapus", description: "ubah", price: 2500, expectedVersion: gone.version });
  assert.equal(await count(tx, "catalog_revisions"), 3); // two creates + one update
  const assets = await count(tx, "media_assets");
  const result = await api.remove(jars[OWNER], gone.slug);
  assert.deepEqual(result, { deleted: true, slug: "qa-hapus", name: "QA Hapus" });
  assert.deepEqual((await api.list(jars[STAFF])).products.map(row => row.slug), [keep.slug]);
  assert.equal(await count(tx, "catalog_revisions"), 1);
  assert.equal(await count(tx, "catalog_publication"), 1);
  for (const table of productTables) assert.equal((await rows(tx, `SELECT * FROM public.${table}`)).some(row => Object.values(row).includes("qa-hapus")), false, table);
  assert.equal((await rows(tx, "SELECT * FROM public.products")).length, 1);
  assert.equal(await count(tx, "catalog_submissions"), 1); assert.equal(await count(tx, "catalog_approvals"), 1);
  assert.equal(await count(tx, "media_assets"), assets);
  const log = await rows(tx, "SELECT * FROM public.catalog_deletion_log");
  assert.equal(log.length, 1); assert.equal(log[0].actor_id, fixture.accounts[OWNER].id); assert.equal(log[0].product_slug, "qa-hapus"); assert.equal(log[0].product_name, "QA Hapus");
  const published = await getPublishedCatalog(tx);
  assert.deepEqual(published.products.map(row => row.slug), ["qa-simpan"]);
  const events = await rows(tx, "SELECT action, actor_id FROM public.catalog_workflow_events");
  assert.ok(events.some(row => row.action === "delete" && row.actor_id === fixture.accounts[OWNER].id));
  // The slug is free immediately and gets a brand-new identity.
  const reused = (await api.create(jars[STAFF], input("QA Hapus", 3000))).product;
  assert.equal(reused.slug, "qa-hapus"); assert.equal(reused.price, 3000);
}));
test("deleting the last card leaves a valid empty live catalog", () => check(async (api, tx) => {
  const only = (await api.create(jars[OWNER], input("QA Satu"))).product;
  await api.remove(jars[OWNER], only.slug);
  assert.deepEqual((await api.list(jars[OWNER])).products, []);
  assert.deepEqual((await getPublishedCatalog(tx)).products, []);
  assert.equal(await count(tx, "catalog_revisions"), 1);
  await assert.rejects(api.remove(jars[OWNER], only.slug), { code: "NOT_FOUND" });
}));
test("Staff and anonymous callers cannot delete, and nothing changes", () => check(async (api, tx) => {
  const card = (await api.create(jars[STAFF], input("QA Aman"))).product;
  const before = [await count(tx, "catalog_revisions"), await count(tx, "catalog_deletion_log")];
  await assert.rejects(api.remove(jars[STAFF], card.slug), { code: "FORBIDDEN" });
  await assert.rejects(api.remove(new Headers(), card.slug), { code: "AUTH_REQUIRED" });
  assert.deepEqual([await count(tx, "catalog_revisions"), await count(tx, "catalog_deletion_log")], before);
}));
test("the purge function refuses a live catalog that still has the product and rolls back fully", () => check(async (api, tx) => {
  const card = (await api.create(jars[OWNER], input("QA Masih Ada"))).product;
  const [{ id }] = await rows(tx, `SELECT id FROM public.products WHERE slug='${card.slug}'`);
  const revisions = await count(tx, "catalog_revisions");
  await assert.rejects(tx.transaction(inner => inner.execute(sql`SELECT public.catalog_purge_product(${id}::uuid, ${fixture.accounts[OWNER].id}::text)`)), pgError(/still contains/));
  assert.equal(await count(tx, "catalog_revisions"), revisions);
  assert.equal(await count(tx, "catalog_deletion_log"), 0);
  assert.equal((await api.list(jars[OWNER])).products.length, 1);
}));
test("the purge function requires an enabled Owner actor and the CMS role only", async () => {
  const unknown = "00000000-0000-4000-8000-000000000000";
  await assert.rejects(pool.query("SELECT public.catalog_purge_product($1::uuid,$2::text)", [unknown, fixture.accounts[STAFF].id]), pgError(/Owner required/));
  await assert.rejects(pool.query("SELECT public.catalog_purge_product($1::uuid,$2::text)", [unknown, "   "]), pgError(/Invalid catalog purge input/));
  // The runtime application role has no EXECUTE and no table access to the log.
  await assert.rejects(fixture.pool.query("SELECT public.catalog_purge_product($1::uuid,$2::text)", [unknown, fixture.accounts[OWNER].id]), pgError(/permission denied/));
  await assert.rejects(fixture.pool.query("SELECT * FROM public.catalog_deletion_log"), pgError(/permission denied/));
});
test("the deletion log is append-only and cannot be written or altered by the CMS role", () => check(async (api, tx) => {
  const card = (await api.create(jars[OWNER], input("QA Log"))).product;
  await api.remove(jars[OWNER], card.slug);
  await assert.rejects(tx.transaction(inner => inner.execute(sql`INSERT INTO public.catalog_deletion_log(actor_id,product_slug,product_name) VALUES ('x','x','x')`)), pgError(/permission denied/));
  await assert.rejects(tx.transaction(inner => inner.execute(sql`UPDATE public.catalog_deletion_log SET product_name='y'`)), pgError(/permission denied/));
  await assert.rejects(tx.transaction(inner => inner.execute(sql`DELETE FROM public.catalog_deletion_log`)), pgError(/permission denied/));
}));
// Separate test: the owner connection must not contend with an open CMS transaction (TRUNCATE needs an exclusive lock).
test("the append-only trigger also blocks the owner role (own connection, rolled back)", async () => {
  for (const [statement, pattern] of [["UPDATE public.catalog_deletion_log SET product_name='y'", /Append-only/], ["DELETE FROM public.catalog_deletion_log", /Append-only/],
    ["TRUNCATE public.catalog_deletion_log", /prohibited/]]) {
    await fixture.owner.query("BEGIN");
    try {
      await fixture.owner.query("INSERT INTO public.catalog_deletion_log(actor_id,product_slug,product_name) VALUES ('qa','qa-log','QA Log')");
      await assert.rejects(fixture.owner.query(statement), pgError(pattern));
    } finally { await fixture.owner.query("ROLLBACK"); }
  }
});
test("regular CMS sessions still cannot delete frozen rows directly; guards are intact after a purge", () => check(async (api, tx) => {
  const card = (await api.create(jars[OWNER], input("QA Guard"))).product;
  await api.remove(jars[OWNER], card.slug);
  await assert.rejects(tx.transaction(inner => inner.execute(sql`DELETE FROM public.catalog_revisions`)), pgError(/permission denied/));
  const guarded = await rows(tx, `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE c.relname IN ('catalog_revisions','product_entries','products','catalog_media_refs','catalog_approvals') AND NOT t.tgisinternal AND t.tgenabled <> 'O'`);
  assert.equal(guarded[0].n, 0);
}));
