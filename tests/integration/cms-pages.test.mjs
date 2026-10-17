import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { fields, rich } from "../fixtures/page-content.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { createCmsPages } from "../../src/server/cms/pages.mjs";
import { getPublishedPage } from "../../src/server/pages/published.mjs";
import { verifyCmsProtection } from "../../scripts/lib/cms-protection.mjs";
import { cleanupPublicFixture, emptyTracking } from "../fixtures/published-data.mjs";
let fixture, pool, jars;
before(async () => {
  fixture = await createAuthFixture();
  pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  jars = [];
  for (const account of fixture.accounts) {
    const jar = cookieJar();
    const response = await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar);
    assert.equal(response.status, 200); jars.push(new Headers({ cookie: jar.header() }));
  }
});
after(async () => { await pool?.end(); await fixture?.cleanup(); });
const rollback = new Error("rollback QA transaction");
const check = async run => {
  try {
    await drizzle(pool).transaction(async tx => {
      const api = createCmsPages({ db: tx, authenticate: headers => fixture.service.authenticate(headers) });
      await run(api, tx); throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
};
const token = row => ({ revisionId: row.id, expectedVersion: row.version, expectedHash: row.contentHash });
const complete = async api => {
  let row = await api.write(jars[1], "create", { pageKey: "about" });
  for (const locale of ["id"]) row = await api.write(jars[1], "save", { revisionId: row.id, expectedVersion: row.version, locale, fields: fields() });
  return row;
};
test("dedicated CMS grants preserve public reader, catalog and auth isolation", async () => verifyCmsProtection(fixture.owner, "tiny_osaka_test_owner"));
test("anonymous cannot list, read or mutate CMS", () => check(async api => {
  for (const operation of [() => api.list(new Headers()), () => api.read(new Headers(), "invalid"), () => api.write(new Headers(), "create", { pageKey: "about" })]) {
    await assert.rejects(operation(), { code: "AUTH_REQUIRED" });
  }
}));
test("real Staff drafts bilingual content but cannot forge any Owner action", () => check(async api => {
  const row = await complete(api);
  const submitted = await api.write(jars[1], "submit", { revisionId: row.id, expectedVersion: row.version });
  for (const action of ["approve", "reject", "publish", "archive"]) await assert.rejects(api.write(jars[1], action, token(submitted)), { code: "FORBIDDEN" });
  await assert.rejects(api.write(jars[1], "approve", { ...token(submitted), role: "owner" }), { code: "INVALID_INPUT" });
  assert.equal((await api.read(jars[0], row.id)).status, "review");
}));
test("Owner publication is exact; clone edits never change the live revision", () => check(async (api, tx) => {
  let row = await complete(api);
  assert.equal(await getPublishedPage(tx, { pageKey: "about", locale: "id" }), null);
  row = await api.write(jars[1], "submit", { revisionId: row.id, expectedVersion: row.version });
  row = await api.write(jars[0], "approve", token(row));
  await assert.rejects(api.write(jars[0], "publish", { ...token(row), expectedHash: "a".repeat(64) }), { code: "HASH_CONFLICT" });
  row = await api.write(jars[0], "publish", token(row));
  await api.write(jars[0], "publish", token(row));
  await assert.rejects(api.write(jars[0], "archive", token(row)), { code: "LIVE_REVISION" });
  const clone = await api.write(jars[1], "clone", { sourceRevisionId: row.id, expectedSourceVersion: row.version });
  assert.equal(clone.status, "draft"); assert.equal(clone.contentHash, null);
  await api.write(jars[1], "save", { revisionId: clone.id, expectedVersion: clone.version, locale: "id", fields: { ...fields(), title: "Replacement only" } });
  assert.equal((await getPublishedPage(tx, { pageKey: "about", locale: "id" })).fields.title, fields().title);
  assert.equal((await api.read(jars[0], row.id)).isLive, true);
}));
test("stale edits, invalid rich content and incomplete locales fail without consuming version", () => check(async api => {
  const row = await api.write(jars[1], "create", { pageKey: "about" });
  await assert.rejects(api.write(jars[1], "submit", { revisionId: row.id, expectedVersion: 1 }), { code: "NOT_READY" });
  await assert.rejects(api.write(jars[1], "save", { revisionId: row.id, expectedVersion: 2, locale: "id", fields: fields() }), { code: "REVISION_CONFLICT" });
  const bad = fields(); bad.body = { blocks: [{ type: "html", html: "<script>bad</script>" }] };
  await assert.rejects(api.write(jars[1], "save", { revisionId: row.id, expectedVersion: 1, locale: "id", fields: bad }), { code: "INVALID_CONTENT" });
  const data = fields(); data.body = rich("<script>literal only</script>");
  const saved = await api.write(jars[1], "save", { revisionId: row.id, expectedVersion: 1, locale: "id", fields: data });
  assert.equal(saved.version, 2);
  assert.deepEqual((await api.read(jars[0], row.id)).translations[0].fields.body, data.body);
}));
test("rejection and archive preserve page action audit", () => check(async (api, tx) => {
  let row = await complete(api);
  row = await api.write(jars[1], "submit", { revisionId: row.id, expectedVersion: row.version });
  row = await api.write(jars[0], "reject", token(row));
  const archived = await api.write(jars[0], "archive", token(row)); assert.equal(archived.status, "archived");
  const events = (await tx.execute('SELECT action FROM public.page_workflow_events ORDER BY created_at')).rows.map(row => row.action);
  for (const action of ["create", "save", "submit", "reject", "archive"]) assert.ok(events.includes(action));
}));
test("database membership overrides a forged server role", () => check(async (_api, tx) => {
  const api = createCmsPages({ db: tx, authenticate: async () => ({ subject: fixture.accounts[1].id, role: "owner" }) });
  await assert.rejects(api.write(jars[1], "approve", { revisionId: "00000000-0000-0000-0000-000000000000", expectedVersion: 1, expectedHash: "a".repeat(64) }), { code: "FORBIDDEN" });
}));
test("simultaneous CMS transactions yield one save, one conflict and no losing audit", async () => {
  const api = createCmsPages({ db: drizzle(pool), authenticate: headers => fixture.service.authenticate(headers) });
  const tracked = emptyTracking();
  try {
    const row = await api.write(jars[1], "create", { pageKey: "about" });
    tracked.pageRevisions.push(row.id); tracked.pages.push("about");
    const results = await Promise.allSettled(["first", "second"].map(title => api.write(jars[1], "save", {
      revisionId: row.id, expectedVersion: 1, locale: "id", fields: { title },
    })));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.code, "REVISION_CONFLICT");
    assert.equal((await api.read(jars[0], row.id)).version, 2);
    assert.equal(Number((await fixture.owner.query("SELECT count(*) FROM public.page_workflow_events WHERE revision_id=$1", [row.id])).rows[0].count), 2);
  } finally { await cleanupPublicFixture(fixture.owner, tracked); }
});
test("expired idle session cannot read or mutate CMS through its real auth resolver", async () => {
  await fixture.owner.query("UPDATE cms_auth.session_activity a SET last_active_at=clock_timestamp()-interval '61 minutes' FROM cms_auth.sessions s WHERE s.id=a.session_id AND s.user_id=$1", [fixture.accounts[1].id]);
  const api = createCmsPages({ db: drizzle(pool), authenticate: headers => fixture.service.authenticate(headers) });
  await assert.rejects(api.list(jars[1]), { code: "AUTH_REQUIRED" });
  await assert.rejects(api.write(jars[1], "create", { pageKey: "about" }), { code: "AUTH_REQUIRED" });
});
