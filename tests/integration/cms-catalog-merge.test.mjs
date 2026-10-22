import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { assertEmptyTestDatabase, cleanupPublicFixture, emptyTracking } from "../fixtures/published-data.mjs";
import { removeQaDeletionLog } from "../fixtures/catalog-cleanup.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";

// MCP Q-1: internal partial update (catalog.merge). Commits through real connections, then wipes exactly what exists.
let fixture, pool, jar, api;
before(async () => {
  fixture = await createAuthFixture();
  await fixture.owner.query("SELECT pg_advisory_lock(76210986)");
  await assertEmptyTestDatabase(fixture.owner);
  pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  const account = fixture.accounts[0], cookies = cookieJar();
  assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, cookies)).status, 200);
  jar = new Headers({ cookie: cookies.header() });
  api = createCmsCatalog({ db: drizzle(pool), authenticate: headers => fixture.service.authenticate(headers) });
});
after(async () => { await pool?.end(); await fixture?.cleanup(); });
const GRAB = "https://app.grab.com/grab/1", GO = "https://gofood.link/go/1";
const revisions = async () => Number((await fixture.owner.query("SELECT count(*) FROM public.catalog_revisions")).rows[0].count);
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
const seed = () => api.create(jar, { name: "QA Gabung", description: "deskripsi awal", price: 1000, grabfoodUrl: GRAB, gofoodUrl: GO }).then(row => row.product);

test("merge: absent keys keep stored values; price-only update leaves name, description and links identical (AC-1, AC-2, AC-5)", isolated(async () => {
  const card = await seed();
  const { product } = await api.merge(jar, card.slug, { price: 2000 });
  assert.deepEqual({ ...product, version: 0, price: 0 }, { ...card, version: 0, price: 0 });
  assert.equal(product.price, 2000); assert.notEqual(product.version, card.version);
  assert.equal((await api.merge(jar, card.slug, { name: "QA Gabung Baru" })).product.description, "deskripsi awal");
  assert.equal((await api.merge(jar, card.slug, { description: "" })).product.description, "", "explicit empty string clears");
  assert.equal((await api.merge(jar, card.slug, { description: "isi baru" })).product.description, "isi baru");
  const [final] = (await api.list(jar)).products;
  assert.deepEqual([final.name, final.price, final.grabfoodUrl, final.gofoodUrl], ["QA Gabung Baru", 2000, GRAB, GO]);
}));

test("merge: no change creates no revision; stale expectedVersion is PRODUCT_CONFLICT; empty change is INVALID_INPUT; unknown slug NOT_FOUND (AC-6)", isolated(async () => {
  const card = await seed();
  const before = await revisions();
  const same = (await api.merge(jar, card.slug, { price: 1000, description: "deskripsi awal", expectedVersion: card.version })).product;
  assert.equal(same.version, card.version); assert.equal(await revisions(), before);
  await assert.rejects(api.merge(jar, card.slug, { price: 5, expectedVersion: "0".repeat(64) }), { code: "PRODUCT_CONFLICT", status: 409 });
  await assert.rejects(api.merge(jar, card.slug, {}), { code: "INVALID_INPUT" });
  await assert.rejects(api.merge(jar, card.slug, { expectedVersion: card.version }), { code: "INVALID_INPUT" });
  await assert.rejects(api.merge(jar, "tidak-ada", { price: 5 }), { code: "NOT_FOUND" });
  assert.equal(await revisions(), before);
}));

test("merge: two concurrent merges of different fields on one slug both survive (AC-3)", isolated(async () => {
  const card = await seed();
  const results = await Promise.allSettled([api.merge(jar, card.slug, { price: 7777 }), api.merge(jar, card.slug, { description: "dari B" })]);
  assert.deepEqual(results.map(result => result.status), ["fulfilled", "fulfilled"], results.map(result => result.reason?.code).join());
  const [final] = (await api.list(jar)).products;
  assert.deepEqual([final.name, final.price, final.description, final.grabfoodUrl], ["QA Gabung", 7777, "dari B", GRAB]);
}));
