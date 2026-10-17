import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { fields } from "../fixtures/page-content.mjs";
import { seedCmsCatalog } from "../fixtures/cms-catalog.mjs";
import { createCmsPages } from "../../src/server/cms/pages.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { createPublishing } from "../../src/server/publishing/service.mjs";
import { runNextPublication } from "../../src/server/publishing/worker.mjs";
import { createPageWorkflow } from "../../src/server/pages/workflow.mjs";
import { verifyPublishingProtection } from "../../scripts/lib/publishing-protection.mjs";
import { cleanupPublicFixture, emptyTracking } from "../fixtures/published-data.mjs";
let fixture, pool, jars;
before(async () => {
  fixture = await createAuthFixture(); pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" })); jars = [];
  for (const account of fixture.accounts) {
    const jar = cookieJar();
    assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar)).status, 200);
    jars.push(new Headers({ cookie: jar.header() }));
  }
});
after(async () => { await pool?.end(); await fixture?.cleanup(); });
const token = row => ({ revisionId: row.id, expectedVersion: row.version, expectedHash: row.contentHash });
const services = db => {
  const context = { db, authenticate: headers => fixture.service.authenticate(headers) };
  return { pages: createCmsPages(context), catalog: createCmsCatalog(context), publishing: createPublishing(context), db };
};
const approved = async api => {
  let row = await api.pages.write(jars[1], "create", { pageKey: "about" });
  for (const locale of ["id", "en"]) row = await api.pages.write(jars[1], "save", { revisionId: row.id, expectedVersion: row.version, locale, fields: fields() });
  row = await api.pages.write(jars[1], "submit", { revisionId: row.id, expectedVersion: row.version });
  return api.pages.write(jars[0], "approve", token(row));
};
const input = (row, delay = 2000, domain = "page") => ({ action: "schedule", domain, ...token(row), dueAt: new Date(Date.now() + delay).toISOString() });
const waitDue = async data => { await new Promise(resolve => setTimeout(resolve, Math.max(0, new Date(data.dueAt) - Date.now()) + 30)); };
const rollback = new Error("rollback publication QA");
const check = async (callback, owner = false) => {
  try { await drizzle(owner ? fixture.owner : pool).transaction(async tx => { await callback(services(tx)); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; }
};
test("publishing DB guards and append-only audit are installed", () => verifyPublishingProtection(fixture.owner, "tiny_osaka_test_owner"));
test("anonymous, Staff and forged roles cannot schedule or cancel", () => check(async api => {
  const row = await approved(api), data = input(row);
  await assert.rejects(api.publishing.list(new Headers()), { code: "AUTH_REQUIRED" });
  await assert.rejects(api.publishing.write(jars[1], data), { code: "FORBIDDEN" });
  const forged = createPublishing({ db: api.db, authenticate: async () => ({ subject: fixture.accounts[1].id, role: "owner" }) });
  await assert.rejects(forged.write(jars[1], data), { code: "FORBIDDEN" });
  const job = await api.publishing.write(jars[0], data);
  await assert.rejects(api.publishing.write(jars[1], { action: "cancel", jobId: job.id, expectedVersion: 1 }), { code: "FORBIDDEN" });
  assert.equal((await api.publishing.list(jars[1]))[0].status, "scheduled");
}));
test("requires exact approval, bounded future UTC and exact request fields", () => check(async api => {
  const row = await approved(api), data = input(row);
  for (const patch of [{ expectedVersion: row.version + 1 }, { expectedHash: "a".repeat(64) }]) await assert.rejects(api.publishing.write(jars[0], { ...data, ...patch }), { code: "REVISION_UNAVAILABLE" });
  for (const dueAt of [new Date(Date.now() - 1000).toISOString(), new Date(Date.now() + 366 * 86400000).toISOString(), "2026-01-01"]) await assert.rejects(api.publishing.write(jars[0], { ...data, dueAt }), { code: "INVALID_TIME" });
  await assert.rejects(api.publishing.write(jars[0], { ...data, role: "owner" }), { code: "INVALID_INPUT" });
  const draft = await api.pages.write(jars[1], "create", { pageKey: "home" });
  await assert.rejects(api.publishing.write(jars[0], { ...data, ...token(draft), expectedHash: "a".repeat(64) }), { code: "REVISION_UNAVAILABLE" });
}));
test("one active job per target; optimistic cancellation is audited and idempotent worker ignores cancelled jobs", () => check(async api => {
  const row = await approved(api), data = input(row), job = await api.publishing.write(jars[0], data);
  assert.equal((await api.publishing.list(jars[0])).find(row => row.id === job.id).due_at, data.dueAt);
  await assert.rejects(api.publishing.write(jars[0], data), { code: "SCHEDULE_EXISTS" });
  await assert.rejects(api.publishing.write(jars[0], { action: "cancel", jobId: job.id, expectedVersion: 2 }), { code: "SCHEDULE_CONFLICT" });
  await api.publishing.write(jars[0], { action: "cancel", jobId: job.id, expectedVersion: 1 });
  assert.equal(await runNextPublication(api.db), null);
  const events = (await api.db.execute(sql`SELECT action FROM public.publication_events WHERE job_id=${job.id}::uuid ORDER BY job_version`)).rows;
  assert.deepEqual(events.map(row => row.action), ["schedule", "cancel"]);
  const active = await api.publishing.write(jars[0], input(row));
  assert.equal((await api.publishing.list(jars[0]))[0].id, active.id, "Active jobs stay visible ahead of capped history");
}));
test("due page publishes once atomically using original enabled Owner; future job never runs early", () => check(async api => {
  const row = await approved(api), data = input(row), job = await api.publishing.write(jars[0], data);
  assert.equal(await runNextPublication(api.db), null);
  assert.equal((await api.db.execute("SELECT * FROM public.page_publications")).rows.length, 0);
  await waitDue(data);
  assert.equal((await runNextPublication(api.db)).status, "succeeded");
  assert.equal(await runNextPublication(api.db), null);
  const [live] = (await api.db.execute("SELECT revision_id FROM public.page_publications")).rows;
  assert.equal(live.revision_id, row.id);
  const events = (await api.db.execute(sql`SELECT action,actor_id,source FROM public.publication_events WHERE job_id=${job.id}::uuid ORDER BY job_version`)).rows;
  assert.deepEqual(events.map(event => event.action), ["schedule", "succeeded"]);
  assert.equal(events[1].actor_id, fixture.accounts[0].id); assert.equal(events[1].source, "worker");
}));
test("due catalog uses the same exact approval workflow", () => check(async api => {
  let graph = await seedCmsCatalog((action, data) => api.catalog.write(jars[1], action, data));
  graph = await api.catalog.write(jars[1], "submit", { revisionId: graph.revision.id, expectedVersion: graph.revision.version });
  graph = await api.catalog.write(jars[0], "approve", token(graph.revision));
  const data = input(graph.revision, 2000, "catalog"); await api.publishing.write(jars[0], data); await waitDue(data);
  assert.equal((await runNextPublication(api.db)).status, "succeeded");
  assert.equal((await api.db.execute("SELECT revision_id FROM public.catalog_publication")).rows[0].revision_id, graph.revision.id);
}));
test("manual publication and archive atomically cancel obsolete schedules", () => check(async api => {
  const row = await approved(api); await api.publishing.write(jars[0], input(row));
  await api.pages.write(jars[0], "publish", token(row));
  assert.equal((await api.publishing.list(jars[0]))[0].last_code, "MANUAL_PUBLICATION");
  const next = await approved(api); const scheduled = await api.publishing.write(jars[0], input(next));
  await api.pages.write(jars[0], "archive", token(next));
  assert.equal((await api.publishing.list(jars[0])).find(job => job.id === scheduled.id).last_code, "REVISION_UNAVAILABLE");
  assert.equal((await api.db.execute("SELECT revision_id FROM public.page_publications")).rows[0].revision_id, row.id);
}));
test("revoked Owner causes terminal failure and preserves live content", () => check(async api => {
  const row = await approved(api), data = input(row); await api.publishing.write(jars[0], data);
  await api.db.execute(sql`UPDATE cms_auth.roles SET enabled=false WHERE user_id=${fixture.accounts[0].id}`);
  await waitDue(data); assert.equal((await runNextPublication(api.db)).status, "failed");
  assert.equal((await api.db.execute("SELECT last_code FROM public.publication_jobs")).rows[0].last_code, "OWNER_UNAVAILABLE");
  assert.equal((await api.db.execute("SELECT * FROM public.page_publications")).rows.length, 0);
}, true));
test("changed live pointer fails stale schedule without overwriting newer publication", () => check(async api => {
  const row = await approved(api), data = input(row); const job = await api.publishing.write(jars[0], data);
  const replacement = await approved(api);
  // Simulate a trusted older publisher that did not cancel the pending job.
  await createPageWorkflow({ db: api.db, scheduledJobId: job.id,
    resolveActor: async () => ({ subject: fixture.accounts[0].id, role: "owner" }) }).publish(token(replacement));
  await waitDue(data); assert.equal((await runNextPublication(api.db)).status, "failed");
  assert.equal((await api.publishing.list(jars[0]))[0].last_code, "PUBLICATION_CHANGED");
  assert.equal((await api.db.execute("SELECT revision_id FROM public.page_publications")).rows[0].revision_id, replacement.id);
}));
test("transient publication rollback records durable retry; third failed attempt terminates", () => check(async api => {
  const row = await approved(api), data = input(row); const job = await api.publishing.write(jars[0], data);
  // Fault exists only in this test-owner transaction and rolls back after the test.
  await api.db.execute(sql`CREATE FUNCTION public.qa_publishing_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA transient fault'; END $$`);
  await api.db.execute(sql`CREATE TRIGGER qa_publishing_fault BEFORE UPDATE ON public.page_revisions FOR EACH ROW EXECUTE FUNCTION public.qa_publishing_fault()`);
  await waitDue(data); assert.equal((await runNextPublication(api.db)).status, "scheduled");
  let [stored] = (await api.db.execute(sql`SELECT * FROM public.publication_jobs WHERE id=${job.id}::uuid`)).rows;
  assert.equal(stored.attempts, 1); assert.equal(stored.last_code, "RETRY");
  assert.ok(new Date(stored.next_attempt_at) - new Date() > 25000);
  assert.equal(await runNextPublication(api.db), null);
  assert.equal((await api.db.execute("SELECT * FROM public.page_publications")).rows.length, 0);
  // Wait until first retry is due; use its actual persisted delay.
  await new Promise(resolve => setTimeout(resolve, Math.max(0, new Date(stored.next_attempt_at) - Date.now()) + 20));
  await api.db.execute(sql`UPDATE public.publication_jobs SET attempts=2,version=version+1,last_code='RETRY',next_attempt_at=clock_timestamp()+interval '100 milliseconds' WHERE id=${job.id}::uuid`);
  await api.db.execute(sql`INSERT INTO public.publication_events(job_id,job_version,action,actor_id,source) SELECT id,version,'retry',created_by,'worker' FROM public.publication_jobs WHERE id=${job.id}::uuid`);
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal((await runNextPublication(api.db)).status, "failed");
  [stored] = (await api.db.execute(sql`SELECT * FROM public.publication_jobs WHERE id=${job.id}::uuid`)).rows;
  assert.equal(stored.attempts, 3); assert.equal(stored.last_code, "PUBLISH_FAILED");
  assert.equal(await runNextPublication(api.db), null);
  assert.equal((await api.db.execute("SELECT * FROM public.page_publications")).rows.length, 0);
}, true));
test("database rejects mutation of sealed identity, early success and removal of jobs/audits", () => check(async api => {
  const row = await approved(api), job = await api.publishing.write(jars[0], input(row));
  for (const statement of [sql`UPDATE public.publication_jobs SET due_at=due_at+interval '1 day',version=version+1 WHERE id=${job.id}::uuid`,
    sql`UPDATE public.publication_jobs SET status='succeeded',attempts=1,version=2 WHERE id=${job.id}::uuid`,
    sql`DELETE FROM public.publication_jobs WHERE id=${job.id}::uuid`, sql`DELETE FROM public.publication_events WHERE job_id=${job.id}::uuid`]) {
    await assert.rejects(api.db.transaction(tx => tx.execute(statement)));
  }
}));
test("concurrent workers consume one due committed job only once", async () => {
  const api = services(drizzle(pool)), tracked = emptyTracking();
  try {
    const row = await approved(api); tracked.pages.push("about"); tracked.pageRevisions.push(row.id);
    const data = input(row); await api.publishing.write(jars[0], data); await waitDue(data);
    const results = await Promise.all([runNextPublication(drizzle(pool)), runNextPublication(drizzle(pool))]);
    assert.equal(results.filter(Boolean).length, 1); assert.equal(results.find(Boolean).status, "succeeded");
    assert.equal(Number((await fixture.owner.query("SELECT count(*) FROM public.page_workflow_events WHERE revision_id=$1 AND action='publish'", [row.id])).rows[0].count), 1);
  } finally { await cleanupPublicFixture(fixture.owner, tracked); }
});
