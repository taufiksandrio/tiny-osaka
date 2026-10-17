import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { assertEmptyTestDatabase, cleanupPublicFixture, emptyTracking } from "../fixtures/published-data.mjs";
import { removeQaDeletionLog } from "../fixtures/catalog-cleanup.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { getPublishedCatalog } from "../../src/server/catalog/published.mjs";

// AC-13: concurrent edits. These tests COMMIT through two real connections (the CMS role pool allows 2),
// then the owner connection removes exactly what exists (the database is asserted empty first) and the
// QA rows of the append-only deletion log, and asserts the database is empty again.
let fixture, pool, jars, api;
before(async () => {
  fixture = await createAuthFixture();
  await fixture.owner.query("SELECT pg_advisory_lock(76210986)");
  await assertEmptyTestDatabase(fixture.owner);
  pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" })); jars = [];
  for (const account of fixture.accounts) {
    const jar = cookieJar(); assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar)).status, 200);
    jars.push(new Headers({ cookie: jar.header() }));
  }
  api = createCmsCatalog({ db: drizzle(pool), authenticate: headers => fixture.service.authenticate(headers) });
});
after(async () => { await pool?.end(); await fixture?.cleanup(); });
const [OWNER, STAFF] = [0, 1];
const input = (name, price = 25000, description = "") => ({ name, description, price });
const count = async table => Number((await fixture.owner.query(`SELECT count(*) FROM public.${table}`)).rows[0].count);
const wipe = async () => {
  const tracked = emptyTracking();
  tracked.revisions = (await fixture.owner.query("SELECT id FROM public.catalog_revisions")).rows.map(row => row.id);
  tracked.products = (await fixture.owner.query("SELECT id FROM public.products")).rows.map(row => row.id);
  tracked.categories = (await fixture.owner.query("SELECT id FROM public.categories")).rows.map(row => row.id);
  await cleanupPublicFixture(fixture.owner, tracked);
  await removeQaDeletionLog(fixture.owner);
  await assertEmptyTestDatabase(fixture.owner);
};
const isolated = body => async () => { try { await body(); } finally { await wipe(); } };
// The live pointer, its revision hash and approval must still agree (getPublishedCatalog throws otherwise).
const assertLiveCatalogValid = async () => {
  assert.equal(await count("catalog_publication"), 1);
  return getPublishedCatalog(drizzle(pool));
};

test("two parallel updates with the same expectedVersion: exactly one wins, the other is a version conflict, data is one complete value", isolated(async () => {
  const card = (await api.create(jars[STAFF], input("QA Paralel", 1000, "awal"))).product;
  const attempts = [
    { who: OWNER, body: { name: "QA Paralel A", description: "dari A", price: 2000 } },
    { who: STAFF, body: { name: "QA Paralel B", description: "dari B", price: 3000 } },
  ];
  const results = await Promise.allSettled(attempts.map(({ who, body }) => api.update(jars[who], card.slug, { ...body, expectedVersion: card.version })));
  const won = results.filter(result => result.status === "fulfilled"), lost = results.filter(result => result.status === "rejected");
  assert.equal(won.length, 1); assert.equal(lost.length, 1);
  assert.equal(lost[0].reason.code, "PRODUCT_CONFLICT"); assert.equal(lost[0].reason.status, 409);
  const winner = attempts[results.indexOf(won[0])].body;
  const [final] = (await api.list(jars[OWNER])).products;
  assert.deepEqual([final.name, final.description, final.price], [winner.name, winner.description, winner.price], "no field mix of the two writers");
  const live = await assertLiveCatalogValid();
  assert.deepEqual(live.products.map(row => row.slug), [card.slug]);
  assert.deepEqual(live.productVariants.map(row => row.basePrice), [winner.price]);
}));

test("update racing a delete of the same card never leaves a half-deleted product and the live catalog stays valid", isolated(async () => {
  for (let round = 0; round < 6; round++) {
    const keep = (await api.create(jars[STAFF], input("QA Sisa " + round, 5000))).product;
    const target = (await api.create(jars[STAFF], input("QA Balapan " + round, 7000))).product;
    const [update, remove] = await Promise.allSettled([
      api.update(jars[round % 2], target.slug, { ...input("QA Balapan " + round, 9000, "diubah"), expectedVersion: target.version }),
      api.remove(jars[OWNER], target.slug),
    ]);
    assert.equal(remove.status, "fulfilled", "Owner delete always wins eventually: " + (remove.reason?.code ?? ""));
    if (update.status === "rejected") assert.equal(update.reason.code, "NOT_FOUND"); // delete committed first
    const live = await assertLiveCatalogValid();
    assert.ok(!live.products.some(row => row.slug === target.slug), "deleted card is gone from the live snapshot");
    assert.ok((await api.list(jars[STAFF])).products.every(row => row.slug !== target.slug));
    assert.equal(Number((await fixture.owner.query("SELECT count(*) FROM public.products WHERE slug=$1", [target.slug])).rows[0].count), 0, "no leftover identity row");
    assert.equal((await api.list(jars[STAFF])).products.find(row => row.slug === keep.slug).price, 5000, "unrelated card untouched");
    // Remove the survivor too so the next round starts from an empty catalog.
    await api.remove(jars[OWNER], keep.slug);
  }
  assert.equal(await count("catalog_deletion_log"), 12);
}));

test("two parallel creates with the same name get distinct slugs x and x-2 without an unhandled unique error", isolated(async () => {
  const results = await Promise.allSettled([api.create(jars[OWNER], input("QA Kembar", 1000)), api.create(jars[STAFF], input("QA Kembar", 2000))]);
  assert.deepEqual(results.map(result => result.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual(results.map(result => result.value.product.slug).sort(), ["qa-kembar", "qa-kembar-2"]);
  const list = (await api.list(jars[STAFF])).products;
  assert.deepEqual(list.map(row => row.slug).sort(), ["qa-kembar", "qa-kembar-2"]);
  assert.deepEqual(list.map(row => row.price).sort((a, b) => a - b), [1000, 2000]);
  assert.equal((await assertLiveCatalogValid()).products.length, 2);
}));
