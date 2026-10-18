import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { createCmsPages } from "../../src/server/cms/pages.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { getPublishedPage } from "../../src/server/pages/published.mjs";
import { cleanupPublicFixture, emptyTracking } from "../fixtures/published-data.mjs";
let fixture, pool, headers;
before(async () => {
  fixture = await createAuthFixture(); pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" })); headers = [];
  for (const account of fixture.accounts) {
    const jar = cookieJar(); assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar)).status, 200);
    headers.push(new Headers({ cookie: jar.header() }));
  }
});
after(async () => { await pool?.end(); await fixture?.cleanup(); });
const rollback = new Error("rollback synthetic QA");
const check = async callback => {
  try { await drizzle(pool).transaction(async db => {
    await callback(createCmsPages({ db, authenticate: input => fixture.service.authenticate(input) }), db); throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
};
const fields = { title: "QA simpan langsung", body: { blocks: [{ type: "paragraph", content: [{ text: "QA konten Indonesia" }] }] } };
const input = row => ({ pageKey: row.pageKey, expectedRevisionId: row.id, expectedVersion: row.version, fields, mediaOperations: [] });

test("opening an empty editor never creates a persistent draft or audit", () => check(async (pages, db) => {
  const row = await pages.current(headers[1], "about"); assert.equal(row.id, null); assert.equal(row.version, 0);
  assert.equal((await db.execute("SELECT * FROM public.pages")).rows.length, 0);
  assert.equal((await db.execute("SELECT * FROM public.page_workflow_events")).rows.length, 0);
  await assert.rejects(pages.current(headers[1], "__proto__"), { code: "NOT_FOUND" });
}));
test("Staff saves and immediately replaces the public page under their own identity", () => check(async (pages, db) => {
  const empty = await pages.current(headers[1], "about");
  const first = await pages.saveCurrent(headers[1], input(empty));
  assert.equal(first.status, "published"); assert.equal(first.isLive, true); assert.ok(first.updatedAt);
  assert.equal((await getPublishedPage(db, { pageKey: "about" })).fields.title, fields.title);
  const next = await pages.saveCurrent(headers[1], { ...input(first), fields: { ...fields, title: "QA pengganti" } });
  assert.notEqual(next.id, first.id); assert.equal((await pages.current(headers[0], "about")).id, next.id);
  assert.equal((await getPublishedPage(db, { pageKey: "about" })).fields.title, "QA pengganti");
  const receipt = (await db.execute("SELECT approved_by FROM public.page_approvals")).rows;
  assert.equal(receipt.length, 2); assert.ok(receipt.every(row => row.approved_by === fixture.accounts[1].id));
  const list = await pages.list(headers[1]); assert.equal(list.find(row => row.key === "about").publishedRevisionId, next.id);
}));
test("Owner uses the same save action and stale saves cannot overwrite content", () => check(async pages => {
  const empty = await pages.current(headers[0], "about"); const first = await pages.saveCurrent(headers[0], input(empty));
  await assert.rejects(pages.saveCurrent(headers[1], input(empty)), { code: "REVISION_CONFLICT" });
  await pages.saveCurrent(headers[1], input(first));
  await assert.rejects(pages.saveCurrent(headers[0], input(first)), { code: "REVISION_CONFLICT" });
}));
test("invalid content and a late media failure roll back snapshots, receipts and the live pointer", () => check(async (pages, db) => {
  const first = await pages.saveCurrent(headers[1], input(await pages.current(headers[1], "about")));
  const count = async table => (await db.execute(`SELECT count(*)::int AS count FROM public.${table}`)).rows[0].count;
  const before = await Promise.all(["page_revisions", "page_workflow_events", "page_approvals"].map(count));
  for (const patch of [{ fields: { title: "Incomplete" } }, { mediaOperations: [{ action: "mediaRemove", data: { referenceId: "00000000-0000-0000-0000-000000000000" } }] }]) {
    await assert.rejects(pages.saveCurrent(headers[1], { ...input(first), ...patch }));
    assert.equal((await pages.current(headers[1], "about")).id, first.id);
    assert.deepEqual(await Promise.all(["page_revisions", "page_workflow_events", "page_approvals"].map(count)), before);
  }
}));
test("anonymous, forged actor/commands and schedule fields are denied; membership remains read-only", () => check(async (pages, db) => {
  const row = await pages.current(headers[1], "about");
  await assert.rejects(pages.saveCurrent(new Headers(), input(row)), { code: "AUTH_REQUIRED" });
  for (const patch of [{ role: "owner" }, { dueAt: new Date().toISOString() }, { mediaOperations: [{ action: "approve", data: {} }] }])
    await assert.rejects(pages.saveCurrent(headers[1], { ...input(row), ...patch }), { code: "INVALID_INPUT" });
  await assert.rejects(pages.saveCurrent(headers[1], { ...input(row), pageKey: "missing" }), { code: "INVALID_INPUT" });
  // The runtime role still has read-only membership access.
  await assert.rejects(db.execute("UPDATE cms_auth.roles SET enabled=false"));
}));
test("concurrent first and replacement saves have one winner each, with no abandoned draft", async () => {
  const pages = createCmsPages({ db: drizzle(pool), authenticate: input => fixture.service.authenticate(input) });
  const tracked = emptyTracking();
  try {
    const row = await pages.current(headers[1], "about");
    const results = await Promise.allSettled([pages.saveCurrent(headers[1], input(row)), pages.saveCurrent(headers[0], input(row))]);
    const live = await pages.current(headers[1], "about"); tracked.pages.push("about");
    tracked.pageRevisions = (await fixture.owner.query("SELECT id FROM public.page_revisions WHERE page_key='about'")).rows.map(row => row.id);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.code, "REVISION_CONFLICT");
    assert.equal(live.isLive, true); assert.equal(tracked.pageRevisions.length, 1);
    const replacements = await Promise.allSettled([pages.saveCurrent(headers[1], { ...input(live), fields: { ...fields, title: "QA Staff concurrent" } }),
      pages.saveCurrent(headers[0], { ...input(live), fields: { ...fields, title: "QA Owner concurrent" } })]);
    tracked.pageRevisions = (await fixture.owner.query("SELECT id FROM public.page_revisions WHERE page_key='about'")).rows.map(row => row.id);
    assert.equal(replacements.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(replacements.find(result => result.status === "rejected").reason.code, "REVISION_CONFLICT");
    assert.equal((await pages.current(headers[1], "about")).id, replacements.find(result => result.status === "fulfilled").value.id);
    assert.equal(tracked.pageRevisions.length, 2);
  } finally { await cleanupPublicFixture(fixture.owner, tracked); }
});
test("disabled database membership denies direct save even with a forged trusted resolver", async () => {
  const subject = fixture.accounts[1].id;
  await fixture.owner.query("UPDATE cms_auth.roles SET enabled=false WHERE user_id=$1", [subject]);
  try {
    const pages = createCmsPages({ db: drizzle(pool), authenticate: async () => ({ subject, role: "owner" }) });
    await assert.rejects(pages.current(null, "about"), { code: "AUTH_REQUIRED" });
    await assert.rejects(pages.saveCurrent(null, { pageKey: "about", expectedRevisionId: null, expectedVersion: 0, fields, mediaOperations: [] }), { code: "AUTH_REQUIRED" });
  } finally { await fixture.owner.query("UPDATE cms_auth.roles SET enabled=true WHERE user_id=$1", [subject]); }
});
