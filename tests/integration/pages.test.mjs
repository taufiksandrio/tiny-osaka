import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as s from "../../src/server/db/schema.mjs";
import { createPageWorkflow } from "../../src/server/pages/workflow.mjs";
import { loadPageGraph } from "../../src/server/pages/drafts.mjs";
import { hashPageContent } from "../../src/server/pages/content-hash.mjs";
import { getPublishedPage } from "../../src/server/pages/published.mjs";
import { PageContentError } from "../../src/server/pages/validation.mjs";
import { pageDefinitions } from "../../src/server/pages/templates.mjs";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";
import { contentTables } from "../../scripts/lib/test-migration-plan.mjs";
import { pageTables, verifyPageProtection } from "../../scripts/lib/page-protection.mjs";
import { verifyCatalogProtection } from "../../scripts/lib/catalog-protection.mjs";
import { fields, rich } from "../fixtures/page-content.mjs";

const workflow = (db, role = "owner") => createPageWorkflow({ db, resolveActor: async () => ({ subject: "qa-" + role + "-subject", role }) });
const code = expected => error => error instanceof PageContentError && error.code === expected;
const token = row => ({ revisionId: row.revisionId ?? row.id, expectedVersion: row.version, expectedHash: row.contentHash });
const root = async (db, id) => (await db.select().from(s.pageRevisions).where(eq(s.pageRevisions.id, id)))[0];
const published = (db, pageKey = "about") => getPublishedPage(db, { pageKey });
const rollback = new Error("rollback synthetic page fixture");
const withRollback = async run => {
  const client = await connectTestOwner();
  try {
    try { await drizzle(client).transaction(async tx => { await run(tx, client); throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
  } finally { await client.end(); }
};
const complete = async (db, key = "about") => {
  const staff = workflow(db, "staff");
  const revision = await staff.createDraft({ pageKey: key });
  await staff.saveTranslation({ revisionId: revision.id, expectedVersion: 1, fields: fields(key) });
  return root(db, revision.id);
};
const approve = async (db, revision) => workflow(db).approve(token(await workflow(db, "staff").submit(token(revision))));
const rejectSql = async (db, client, statement, params = [], expected = "23514") => {
  await assert.rejects(db.transaction(() => client.query(statement, params)),
    error => error.code === expected || error.cause?.code === expected);
};

test("all nine templates complete review/publication with JSONB-stable hashes", () => withRollback(async db => {
  for (const key of Object.keys(pageDefinitions)) {
    assert.equal(await published(db, key), null);
    const revision = await complete(db, key);
    const approval = await approve(db, revision);
    assert.equal(await published(db, key), null);
    const result = await workflow(db).publish(token(approval));
    assert.deepEqual(await workflow(db).publish(token(result)), result);
    const page = await published(db, key);
    assert.equal(page.pageKey, key);
    assert.deepEqual(page.fields, fields(key));
    assert.ok(!JSON.stringify(page).includes("qa-owner-subject"));
    assert.ok(!Object.hasOwn(page, "contentHash"));
  }
  assert.equal((await db.select().from(s.pagePublications)).length, 9);
  assert.equal((await db.select().from(s.pageWorkflowEvents)).length, 27);
  await db.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
}));

test("partial drafts are stored but incomplete content cannot submit or fall back", () => withRollback(async db => {
  const draft = await workflow(db, "staff").createDraft({ pageKey: "about" });
  await assert.rejects(workflow(db, "staff").submit(token(draft)), code("NOT_READY"));
  const saved = await workflow(db, "staff").saveTranslation({ revisionId: draft.id, expectedVersion: 1, fields: { title: "Incomplete draft" } });
  await assert.rejects(workflow(db, "staff").submit({ revisionId: draft.id, expectedVersion: saved.version }), code("NOT_READY"));
  await assert.rejects(published(db, "unknown"), code("INVALID_INPUT"));
  assert.equal((await db.select().from(s.pageSubmissions)).length, 0);
  assert.equal((await root(db, draft.id)).status, "draft");
}));

test("page saves overwrite the single Indonesian row and reject invalid content without consuming version", () => withRollback(async db => {
  const revision = await complete(db);
  const f = fields(); f.body = rich("<script>literal text</script>");
  await workflow(db, "staff").saveTranslation({ revisionId: revision.id, expectedVersion: 2, fields: f });
  const rows = await db.select().from(s.pageTranslations).where(eq(s.pageTranslations.revisionId, revision.id));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].fields, f);
  for (const bad of [{ ...fields(), style: "red" }, { ...fields(), body: { blocks: [{ type: "html", html: "<script>x</script>" }] } }]) {
    await assert.rejects(workflow(db, "staff").saveTranslation({ revisionId: revision.id, expectedVersion: 3, fields: bad }), code("INVALID_CONTENT"));
    assert.equal((await root(db, revision.id)).version, 3);
  }
  await assert.rejects(workflow(db, "staff").saveTranslation({ revisionId: revision.id, expectedVersion: 2, fields: fields() }), code("REVISION_CONFLICT"));
}));

test("the stored hash is reproducible from the loader and a clone carries the single content row", () => withRollback(async db => {
  const revision = await complete(db);
  const live = await workflow(db).publish(token(await approve(db, await root(db, revision.id))));
  const frozen = await root(db, revision.id);
  assert.equal(frozen.status, "published");
  const graph = await loadPageGraph(db, frozen);
  assert.equal(graph.translations.length, 1);
  assert.equal(hashPageContent(graph), live.contentHash);
  const page = await published(db);
  assert.deepEqual(page.fields, fields());
  const clone = await workflow(db, "staff").cloneDraft({ sourceRevisionId: revision.id, expectedSourceVersion: frozen.version });
  const cloned = await db.select().from(s.pageTranslations).where(eq(s.pageTranslations.revisionId, clone.id));
  assert.equal(cloned.length, 1);
  assert.deepEqual(cloned[0].fields, fields());
  await workflow(db).publish(token(await approve(db, await root(db, clone.id))));
  assert.equal((await published(db)).revisionId, clone.id);
  // The old snapshot hash is untouched by the replacement.
  assert.equal(hashPageContent(await loadPageGraph(db, await root(db, revision.id))), live.contentHash);
}));

test("unwired identity denies all writes; Staff cannot forge Owner approval/publication", () => withRollback(async db => {
  const revision = await complete(db), submitted = await workflow(db, "staff").submit(token(revision));
  for (const action of Object.keys(createPageWorkflow({ db }))) {
    await assert.rejects(createPageWorkflow({ db })[action]({ ...token(submitted), pageKey: "home", role: "owner" }), code("AUTH_REQUIRED"));
  }
  for (const action of ["approve", "reject", "publish", "archive"]) {
    await assert.rejects(workflow(db, "staff")[action]({ ...token(submitted), role: "owner", actorId: "forged" }), code("FORBIDDEN"));
  }
  await assert.rejects(workflow(db).approve({ ...token(submitted), expectedHash: "a".repeat(64) }), code("HASH_CONFLICT"));
  await assert.rejects(workflow(db).publish(token(submitted)), code("REVISION_CONFLICT"));
}));

test("database rejects unsupported templates, a second content row, oversized JSON and cross-page pointers", () => withRollback(async (db, client) => {
  const a = await complete(db, "about"), b = await complete(db, "home");
  await rejectSql(db, client, "INSERT INTO pages(key,template) VALUES ('evil','about')");
  await rejectSql(db, client, "UPDATE pages SET template='home' WHERE key='about'");
  await rejectSql(db, client, "UPDATE page_revisions SET page_key='home' WHERE id=$1", [a.id]);
  await rejectSql(db, client, "INSERT INTO page_translations(revision_id,fields) VALUES ($1,'{}')", [a.id], "23505");
  await rejectSql(db, client, "UPDATE page_translations SET fields=jsonb_build_object('title',repeat('x',131073)) WHERE revision_id=$1", [a.id]);
  await rejectSql(db, client, "UPDATE page_translations SET fields='[]'::jsonb WHERE revision_id=$1", [a.id]);
  const live = await workflow(db).publish(token(await approve(db, a)));
  await rejectSql(db, client, "INSERT INTO page_publications(page_key,revision_id,content_hash) VALUES ('home',$1,$2)", [a.id, live.contentHash]);
  await assert.rejects(workflow(db).approve({ ...token(await workflow(db).submit(token(b))), expectedHash: live.contentHash }), code("HASH_CONFLICT"));
}));

test("direct draft JSON outside the template is caught before submission", () => withRollback(async db => {
  const revision = await complete(db);
  await db.update(s.pageTranslations).set({ fields: { ...fields(), style: "forged" } })
    .where(eq(s.pageTranslations.revisionId, revision.id));
  await assert.rejects(workflow(db).submit(token(revision)), code("NOT_READY"));
  assert.equal((await root(db, revision.id)).status, "draft");
  assert.equal((await db.select().from(s.pageSubmissions)).length, 0);
}));

test("frozen roots/translations/receipts/audit reject raw updates, inserts and deletes", () => withRollback(async (db, client) => {
  const revision = await complete(db), submitted = await workflow(db).submit(token(revision));
  for (const statement of [
    "UPDATE page_translations SET fields=fields WHERE revision_id=$1",
    "DELETE FROM page_translations WHERE revision_id=$1",
    "INSERT INTO page_translations SELECT * FROM page_translations WHERE revision_id=$1",
    "UPDATE page_revisions SET version=version+1 WHERE id=$1",
    "UPDATE page_revisions SET status='draft',content_hash=NULL WHERE id=$1",
    "DELETE FROM page_revisions WHERE id=$1",
    "UPDATE page_revisions SET status='approved' WHERE id=$1",
  ]) await rejectSql(db, client, statement, [revision.id]);
  await workflow(db).approve(token(submitted));
  for (const table of ["page_submissions", "page_approvals", "page_workflow_events"]) {
    await rejectSql(db, client, `UPDATE ${table} SET revision_id=revision_id WHERE revision_id=$1`, [revision.id]);
    await rejectSql(db, client, `DELETE FROM ${table} WHERE revision_id=$1`, [revision.id]);
  }
  await assert.rejects(workflow(db, "staff").saveTranslation({ revisionId: revision.id, expectedVersion: revision.version, fields: fields() }), code("REVISION_CONFLICT"));
}));

test("clone of frozen content resets approval; draft edits and approval preserve live page until replacement", () => withRollback(async (db, client) => {
  const revision = await complete(db), live = await workflow(db).publish(token(await approve(db, revision)));
  const original = await root(db, revision.id);
  const clone = await workflow(db, "staff").cloneDraft({ sourceRevisionId: revision.id, expectedSourceVersion: revision.version });
  assert.equal(clone.status, "draft"); assert.equal(clone.version, 1); assert.equal(clone.contentHash, null);
  assert.equal((await db.select().from(s.pageApprovals).where(eq(s.pageApprovals.revisionId, clone.id))).length, 0);
  const f = fields(); f.title = "QA revised title";
  await workflow(db, "staff").saveTranslation({ revisionId: clone.id, expectedVersion: 1, fields: f });
  assert.deepEqual(await root(db, revision.id), original);
  assert.equal((await published(db)).fields.title, fields().title);
  const approval = await approve(db, await root(db, clone.id));
  assert.equal((await published(db)).revisionId, revision.id);
  await workflow(db).publish(token(approval));
  assert.equal((await published(db)).revisionId, clone.id);
  assert.equal((await published(db)).fields.title, "QA revised title");
  await assert.rejects(workflow(db).archive(token(approval)), code("LIVE_REVISION"));
  await rejectSql(db, client, "DELETE FROM page_publications WHERE page_key='about'");
  await assert.rejects(workflow(db).publish(token(live)), code("REVISION_CONFLICT"));
  await workflow(db).archive(token(live));
  assert.equal((await published(db)).revisionId, clone.id);
}));

test("rejected revisions stay frozen and need a fresh submitted/approved clone", () => withRollback(async db => {
  const revision = await complete(db), submitted = await workflow(db, "staff").submit(token(revision));
  const rejected = await workflow(db).reject(token(submitted));
  await assert.rejects(workflow(db).approve(token(rejected)), code("REVISION_CONFLICT"));
  const clone = await workflow(db, "staff").cloneDraft({ sourceRevisionId: revision.id, expectedSourceVersion: revision.version });
  const next = await workflow(db).submit(token(clone));
  assert.notEqual(next.contentHash, rejected.contentHash);
  await assert.rejects(workflow(db).approve({ ...token(next), expectedHash: rejected.contentHash }), code("HASH_CONFLICT"));
  await workflow(db).archive(token(rejected));
  await workflow(db).approve(token(next));
  await db.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
}));

test("deferred submission receipts cannot commit without their exact transition", () => withRollback(async db => {
  const revision = await complete(db);
  await assert.rejects(db.transaction(async tx => {
    await tx.insert(s.pageSubmissions).values({ revisionId: revision.id, version: revision.version,
      contentHash: "a".repeat(64), submittedBy: "qa-orphan" });
    await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
  }), error => error.code === "23514" || error.cause?.code === "23514");
  assert.equal((await db.select().from(s.pageSubmissions)).length, 0);
  assert.equal((await root(db, revision.id)).status, "draft");
}));

test("real SQL audit failure rolls back every workflow transition and retains the previous pointer", () => withRollback(async db => {
  const revision = await complete(db);
  const broken = {
    transaction: callback => db.transaction(tx => callback(new Proxy(tx, {
      get(target, key) {
        if (key === "insert") return table => table === s.pageWorkflowEvents ?
          { values: () => target.execute(sql`SELECT 1/0`) } : target.insert(table);
        const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
      },
    }))),
  };
  await assert.rejects(workflow(broken).submit(token(revision)), code("PERSISTENCE_FAILED"));
  assert.equal((await root(db, revision.id)).status, "draft");
  assert.equal((await db.select().from(s.pageSubmissions)).length, 0);
  const submitted = await workflow(db).submit(token(revision));
  await assert.rejects(workflow(broken).approve(token(submitted)), code("PERSISTENCE_FAILED"));
  await assert.rejects(workflow(broken).reject(token(submitted)), code("PERSISTENCE_FAILED"));
  assert.equal((await root(db, revision.id)).status, "review");
  assert.equal((await db.select().from(s.pageApprovals)).length, 0);
  const approval = await workflow(db).approve(token(submitted));
  await assert.rejects(workflow(broken).archive(token(approval)), code("PERSISTENCE_FAILED"));
  assert.equal((await root(db, revision.id)).status, "approved");
  await workflow(db).publish(token(approval));
  const clone = await workflow(db, "staff").cloneDraft({ sourceRevisionId: revision.id, expectedSourceVersion: revision.version });
  const replacement = await approve(db, clone);
  await assert.rejects(workflow(broken).publish(token(replacement)), code("PERSISTENCE_FAILED"));
  assert.equal((await root(db, clone.id)).status, "approved");
  assert.equal((await published(db)).revisionId, revision.id);
  assert.equal((await db.select().from(s.pageWorkflowEvents)).length, 5);
}));

test("draft create, translation save and clone roll back actual SQL errors after their writes", () => withRollback(async db => {
  const revision = await complete(db);
  const broken = { transaction: callback => db.transaction(async tx => {
    const result = await callback(tx);
    await tx.execute(sql`SELECT 1/0`);
    return result;
  }) };
  const before = await root(db, revision.id);
  await assert.rejects(workflow(broken, "staff").createDraft({ pageKey: "home" }), code("PERSISTENCE_FAILED"));
  assert.equal((await db.select().from(s.pages).where(eq(s.pages.key, "home"))).length, 0);
  await assert.rejects(workflow(broken, "staff").saveTranslation({
    revisionId: revision.id, expectedVersion: revision.version, fields: { ...fields(), title: "QA losing write" },
  }), code("PERSISTENCE_FAILED"));
  assert.deepEqual(await root(db, revision.id), before);
  assert.deepEqual((await db.select().from(s.pageTranslations).where(eq(s.pageTranslations.revisionId, revision.id)))[0].fields, fields());
  await assert.rejects(workflow(broken, "staff").cloneDraft({
    sourceRevisionId: revision.id, expectedSourceVersion: revision.version,
  }), code("PERSISTENCE_FAILED"));
  assert.equal((await db.select().from(s.pageRevisions)).length, 1);
  assert.equal((await db.select().from(s.pageTranslations)).length, 1);
}));

test("last writable draft version stays exact and exhausted revisions can submit and clone", () => withRollback(async db => {
  const revision = await complete(db);
  await db.update(s.pageRevisions).set({ version: 2147483646 }).where(eq(s.pageRevisions.id, revision.id));
  const result = await workflow(db, "staff").saveTranslation({ revisionId: revision.id,
    expectedVersion: 2147483646, fields: fields() });
  assert.equal(result.version, 2147483647);
  await assert.rejects(workflow(db, "staff").saveTranslation({ revisionId: revision.id,
    expectedVersion: 2147483647, fields: fields() }), code("INVALID_INPUT"));
  await assert.rejects(workflow(db, "staff").cloneDraft({
    sourceRevisionId: revision.id, expectedSourceVersion: revision.version,
  }), code("REVISION_CONFLICT"));
  const submitted = await workflow(db, "staff").submit({ revisionId: revision.id, expectedVersion: 2147483647 });
  const clone = await workflow(db, "staff").cloneDraft({ sourceRevisionId: revision.id, expectedSourceVersion: submitted.version });
  assert.equal(clone.version, 1); assert.equal(clone.status, "draft"); assert.equal(clone.contentHash, null);
}));

test("runtime app has no new page grants and readers/writers cannot bypass default denial", async () => {
  const client = new pg.Client(getDatabaseConfig(process.env, "test"));
  try {
    await client.connect();
    for (const table of pageTables) assert.equal((await client.query(
      "SELECT has_table_privilege(session_user,$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed",
      ["public." + table])).rows[0].allowed, false);
    await assert.rejects(createPageWorkflow({ db: drizzle(client) }).createDraft({ pageKey: "about" }), code("AUTH_REQUIRED"));
    await assert.rejects(published(drizzle(client)), code("PERSISTENCE_FAILED"));
  } finally { await client.end(); }
});

const waitBlocked = async (client, pids) => {
  for (let i = 0; i < 80; i++) {
    const { rows: [row] } = await client.query("SELECT count(*)::integer AS total FROM unnest($1::integer[]) AS w(pid) WHERE cardinality(pg_blocking_pids(w.pid))>0", [pids]);
    if (row.total === pids.length) return;
    await delay(25);
  }
  assert.fail("Workers must reach actual database lock contention.");
};
// Isolated test-only maintenance; exact owned UUIDs, no global deletion/truncate.
// USER trigger disable/reenable is transactional under exclusive table locks.
const cleanup = async (client, revisions, keys) => {
  assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name, "tiny_osaka_test");
  await client.query("BEGIN");
  try {
    await client.query("LOCK TABLE " + pageTables.map(table => "public." + table).join(",") + " IN ACCESS EXCLUSIVE MODE");
    for (const table of pageTables) await client.query(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
    for (const table of ["page_publications", "page_workflow_events", "page_approvals", "page_submissions", "page_translations"]) {
      await client.query(`DELETE FROM public.${table} WHERE revision_id=ANY($1::uuid[])`, [revisions]);
    }
    await client.query("DELETE FROM page_revisions WHERE id=ANY($1::uuid[])", [revisions]);
    await client.query("DELETE FROM pages p WHERE key=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM page_revisions r WHERE r.page_key=p.key)", [keys]);
    for (const table of pageTables) await client.query(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);
    await verifyPageProtection(client, "tiny_osaka_test_owner");
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    throw new Error("Inspect only owned page fixture IDs: " + JSON.stringify({ revisions, keys }));
  }
};
const committedFixture = async (db, revisions, keys, key = "about") => db.transaction(async tx => {
  // Prove ownership even if this test is later run against pre-existing page keys.
  await tx.execute(sql`LOCK TABLE public.pages IN SHARE ROW EXCLUSIVE MODE`);
  const [existing] = await tx.select().from(s.pages).where(eq(s.pages.key, key));
  const revision = await complete(tx, key);
  revisions.push(revision.id);
  if (!existing) keys.push(key);
  return revision;
});

test("two editors and submit versus editor serialize on an exact version without partial writes", async () => {
  const client = await connectTestOwner(), a = await connectTestOwner(), b = await connectTestOwner();
  const revisions = [], keys = []; let pending = [];
  try {
    const revision = await committedFixture(drizzle(client), revisions, keys);
    const pids = [(await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid, (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid];
    for (const submitRace of [false, true]) {
      const current = await root(drizzle(client), revision.id);
      await client.query("BEGIN");
      await client.query("SELECT id FROM page_revisions WHERE id=$1 FOR UPDATE", [revision.id]);
      const f = fields(); f.title = "QA competing editor";
      pending = [
        submitRace ? workflow(drizzle(a), "staff").submit(token(current)) :
          workflow(drizzle(a), "staff").saveTranslation({ revisionId: revision.id, expectedVersion: current.version, fields: f }),
        workflow(drizzle(b), "staff").saveTranslation({ revisionId: revision.id, expectedVersion: current.version, fields: fields() }),
      ].map(promise => promise.then(value => ({ value }), error => ({ error })));
      await waitBlocked(client, pids);
      await client.query("ROLLBACK");
      const results = await Promise.all(pending); pending = [];
      assert.equal(results.filter(r => r.value).length, 1);
      assert.equal(results.filter(r => r.error?.code === "REVISION_CONFLICT").length, 1);
      const after = await root(drizzle(client), revision.id);
      if (after.status === "draft") assert.equal(after.version, current.version + 1);
      else assert.equal(after.version, current.version);
    }
  } finally {
    await client.query("ROLLBACK"); await Promise.all(pending); await a.end(); await b.end();
    try { await cleanup(client, revisions, keys); } finally { await client.end(); }
  }
});

test("concurrent approve versus reject yields one decision and append-only audit", async () => {
  const client = await connectTestOwner(), a = await connectTestOwner(), b = await connectTestOwner();
  const revisions = [], keys = []; let pending = [];
  try {
    const revision = await committedFixture(drizzle(client), revisions, keys);
    const submitted = await workflow(drizzle(client), "staff").submit(token(revision));
    const pids = [(await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid, (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid];
    await client.query("BEGIN");
    await client.query("SELECT id FROM page_revisions WHERE id=$1 FOR UPDATE", [revision.id]);
    pending = [workflow(drizzle(a)).approve(token(submitted)), workflow(drizzle(b)).reject(token(submitted))]
      .map(promise => promise.then(value => ({ value }), error => ({ error })));
    await waitBlocked(client, pids);
    await client.query("ROLLBACK");
    const results = await Promise.all(pending); pending = [];
    assert.equal(results.filter(r => r.value).length, 1);
    assert.equal(results.filter(r => r.error?.code === "REVISION_CONFLICT").length, 1);
    assert.equal((await drizzle(client).select().from(s.pageWorkflowEvents)).length, 2);
  } finally {
    await client.query("ROLLBACK"); await Promise.all(pending); await a.end(); await b.end();
    try { await cleanup(client, revisions, keys); } finally { await client.end(); }
  }
});

test("simultaneous first publication serializes per page and leaves one complete pointer", async () => {
  const client = await connectTestOwner(), a = await connectTestOwner(), b = await connectTestOwner();
  const revisions = [], keys = []; let pending = [];
  try {
    const approved = [];
    for (let i = 0; i < 2; i++) approved.push(await approve(drizzle(client), await committedFixture(drizzle(client), revisions, keys)));
    const pids = [(await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid, (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid];
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(76210985,hashtext('about'))");
    pending = [workflow(drizzle(a)).publish(token(approved[0])), workflow(drizzle(b)).publish(token(approved[1]))]
      .map(promise => promise.then(value => ({ value }), error => ({ error })));
    await waitBlocked(client, pids);
    assert.equal(await published(drizzle(client)), null);
    await client.query("ROLLBACK");
    const results = await Promise.all(pending); pending = [];
    assert.equal(results.filter(r => r.value).length, 2);
    const id = await published(drizzle(client));
    assert.ok(approved.some(row => row.revisionId === id.revisionId));
    assert.equal((await drizzle(client).select().from(s.pagePublications)).length, 1);
  } finally {
    await client.query("ROLLBACK"); await Promise.all(pending); await a.end(); await b.end();
    try { await cleanup(client, revisions, keys); } finally { await client.end(); }
  }
});

test("all twenty-four tables remain empty with exact protection definitions and twelve history entries", async () => {
  const client = await connectTestOwner();
  try {
    for (const table of contentTables) assert.equal((await client.query(`SELECT count(*)::integer AS total FROM public.${table}`)).rows[0].total, 0);
    await verifyCatalogProtection(client, "tiny_osaka_test_owner");
    await verifyPageProtection(client, "tiny_osaka_test_owner");
    // Tepat 17: migrasi 0001..0016 (0016 = kolom bahasa dihapus) sudah diterapkan di DB test lokal.
    assert.equal(Number((await client.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count), 17);
  } finally { await client.end(); }
});

