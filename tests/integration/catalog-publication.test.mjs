import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as w from "../../src/server/catalog/drafts.mjs";
import * as s from "../../src/server/db/schema.mjs";
import { createCatalogWorkflow } from "../../src/server/catalog/workflow.mjs";
import { getPublishedCatalog } from "../../src/server/catalog/published.mjs";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { workflowTables } from "../../scripts/lib/test-migration-plan.mjs";
import { verifyCatalogProtection } from "../../scripts/lib/catalog-protection.mjs";
import { applyReviewedMigration } from "../../scripts/lib/apply-reviewed-migration.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";

const owner = db => createCatalogWorkflow({ db, resolveActor: async () => ({ subject: "qa-owner-subject", role: "owner" }) });
const staff = db => createCatalogWorkflow({ db, resolveActor: async () => ({ subject: "qa-staff-subject", role: "staff" }) });
const code = expected => error => error instanceof w.CatalogDraftError && error.code === expected;
const token = row => ({ revisionId: row.revisionId, expectedVersion: row.version, expectedHash: row.contentHash });
const sourceToken = fixture => ({ revisionId: fixture.revision.id, expectedVersion: fixture.version });
const rollback = new Error("rollback synthetic publication fixture");
const root = async (db, id) => (await db.select().from(s.catalogRevisions).where(sql`id = ${id}::uuid`))[0];

const complete = async (db, track = () => {}) => {
  const revision = await w.createCatalogDraft(db);
  track("revision", revision.id);
  let version = 1;
  const category = await w.createCatalogCategory(db, { revisionId: revision.id, expectedVersion: version++,
    slug: "qa-publication-cat-" + randomUUID(), sortOrder: 0 });
  track("category", category.categoryId);
  const product = await w.createCatalogProduct(db, { revisionId: revision.id, expectedVersion: version++,
    categoryId: category.categoryId, slug: "qa-publication-product-" + randomUUID(), sortOrder: 0 });
  track("product", product.productId);
  const scope = { revisionId: revision.id, productId: product.productId };
  const variant = await w.createProductVariant(db, { ...scope, expectedVersion: version++, code: "standard", basePrice: 250000, sortOrder: 0 });
  const group = await w.createModifierGroup(db, { ...scope, expectedVersion: version++, code: "toppings",
    selectionType: "single", minSelections: 1, maxSelections: 1, sortOrder: 0 });
  const option = await w.createModifierOption(db, { ...scope, groupId: group.groupId, expectedVersion: version++,
    code: "qa-option", priceDelta: 150000, sortOrder: 0 });
  for (const locale of ["id", "en"]) {
    for (const [save, fields] of [
      [w.saveCategoryTranslation, { revisionId: revision.id, categoryId: category.categoryId }],
      [w.saveProductTranslation, scope],
      [w.saveVariantTranslation, { ...scope, variantId: variant.variantId }],
      [w.saveModifierGroupTranslation, { ...scope, groupId: group.groupId }],
      [w.saveModifierOptionTranslation, { ...scope, groupId: group.groupId, optionId: option.optionId }],
    ]) await save(db, { ...fields, expectedVersion: version++, locale, title: "QA synthetic " + locale, description: "" });
  }
  return { revision, category, product, variant, group, option, version };
};

const withRollback = async run => {
  const client = await connectTestOwner();
  try {
    try {
      await drizzle(client).transaction(async tx => {
        await run(tx, client);
        throw rollback;
      });
      assert.fail("Fixture transaction must roll back.");
    } catch (error) { if (error !== rollback) throw error; }
  } finally { await client.end(); }
};

const rejectSql = async (db, statement, values = []) => {
  await assert.rejects(db.transaction(tx => tx.execute(sql.raw(statement.replace(/\$(\d+)/g,
    (_, n) => "'" + String(values[Number(n) - 1]).replaceAll("'", "''") + "'")))),
  error => error.code === "23514" || error.cause?.code === "23514");
};

test("published reader is empty until an approved revision is explicitly published", () => withRollback(async db => {
  assert.equal(await getPublishedCatalog(db), null);
  const fixture = await complete(db);
  assert.equal(await getPublishedCatalog(db), null);
  const submitted = await staff(db).submit(sourceToken(fixture));
  assert.equal(await getPublishedCatalog(db), null);
  const approved = await owner(db).approve(token(submitted));
  assert.equal(await getPublishedCatalog(db), null);
  const published = await owner(db).publish(token(approved));
  const graph = await getPublishedCatalog(db);
  assert.equal(graph.revision.id, fixture.revision.id);
  assert.equal(graph.productVariants[0].basePrice, 250000);
  assert.equal(graph.modifierOptions[0].priceDelta, 150000);
  assert.deepEqual(Object.keys(graph.revision).sort(), ["id", "version"]);
  assert.ok(!JSON.stringify(graph).includes("qa-owner-subject"));
  assert.deepEqual(await owner(db).publish(token(published)), published);
  assert.equal((await db.select().from(s.catalogWorkflowEvents)).length, 3);
}));

test("incomplete and stale drafts cannot submit and leave no submission or audit", () => withRollback(async db => {
  const empty = await w.createCatalogDraft(db);
  await assert.rejects(staff(db).submit({ revisionId: empty.id, expectedVersion: 1 }), code("NOT_READY"));
  const fixture = await complete(db);
  await assert.rejects(staff(db).submit({ revisionId: fixture.revision.id, expectedVersion: fixture.version - 1 }), code("REVISION_CONFLICT"));
  assert.equal((await root(db, empty.id)).status, "draft");
  assert.equal((await db.select().from(s.catalogSubmissions)).length, 0);
  assert.equal((await db.select().from(s.catalogWorkflowEvents)).length, 0);
}));

test("staff and unwired auth cannot act as Owner; exact submission hash is required", () => withRollback(async db => {
  const fixture = await complete(db), submitted = await staff(db).submit(sourceToken(fixture));
  for (const action of ["approve", "reject", "publish", "archive"]) {
    await assert.rejects(staff(db)[action]({ ...token(submitted), role: "owner", actorId: "forged" }), code("FORBIDDEN"));
    await assert.rejects(createCatalogWorkflow({ db })[action](token(submitted)), code("AUTH_REQUIRED"));
  }
  await assert.rejects(owner(db).approve({ ...token(submitted), expectedHash: "a".repeat(64) }), code("HASH_CONFLICT"));
  await assert.rejects(owner(db).publish(token(submitted)), code("REVISION_CONFLICT"));
  assert.equal((await root(db, fixture.revision.id)).status, "review");
  assert.equal((await db.select().from(s.catalogApprovals)).length, 0);
}));

test("all ten frozen child tables reject direct inserts, updates and deletes", () => withRollback(async db => {
  const fixture = await complete(db);
  await owner(db).submit(sourceToken(fixture));
  const id = fixture.revision.id;
  for (const table of ["category_entries", "category_translations", "product_entries", "product_translations",
    "product_variants", "variant_translations", "modifier_groups", "modifier_group_translations",
    "modifier_options", "modifier_option_translations"]) {
    await rejectSql(db, `INSERT INTO public.${table} SELECT * FROM public.${table} WHERE revision_id=$1`, [id]);
    await rejectSql(db, `UPDATE public.${table} SET revision_id=revision_id WHERE revision_id=$1`, [id]);
    await rejectSql(db, `DELETE FROM public.${table} WHERE revision_id=$1`, [id]);
  }
  await assert.rejects(w.updateVariantPrice(db, { ...sourceToken(fixture), productId: fixture.product.productId,
    variantId: fixture.variant.variantId, basePrice: 1 }), code("REVISION_CONFLICT"));
}));

test("frozen root and shared identities reject mutation; clone creates an unapproved draft", () => withRollback(async db => {
  const fixture = await complete(db), submitted = await owner(db).submit(sourceToken(fixture));
  for (const statement of [
    "UPDATE catalog_revisions SET version=version+1 WHERE id=$1",
    "UPDATE catalog_revisions SET content_hash=repeat('b',64) WHERE id=$1",
    "UPDATE catalog_revisions SET status='draft',content_hash=NULL WHERE id=$1",
    "DELETE FROM catalog_revisions WHERE id=$1",
  ]) await rejectSql(db, statement, [fixture.revision.id]);
  for (const [table, id] of [["categories", fixture.category.categoryId], ["products", fixture.product.productId]]) {
    await rejectSql(db, `UPDATE ${table} SET slug=slug WHERE id=$1`, [id]);
    await rejectSql(db, `DELETE FROM ${table} WHERE id=$1`, [id]);
  }
  const original = await root(db, fixture.revision.id);
  const clone = await w.cloneCatalogDraft(db, { sourceRevisionId: fixture.revision.id, expectedSourceVersion: fixture.version });
  assert.equal(clone.status, "draft"); assert.equal(clone.contentHash, null); assert.equal(clone.version, 1);
  await w.updateVariantPrice(db, { revisionId: clone.id, expectedVersion: 1, productId: fixture.product.productId,
    variantId: fixture.variant.variantId, basePrice: 999999 });
  assert.deepEqual(await root(db, fixture.revision.id), original);
  assert.equal((await db.select().from(s.productVariants).where(sql`revision_id = ${fixture.revision.id}::uuid`))[0].basePrice, 250000);
  await owner(db).approve(token(submitted));
}));

test("rejection freezes the source; a cloned revision must submit and obtain its own approval", () => withRollback(async db => {
  const fixture = await complete(db), submitted = await staff(db).submit(sourceToken(fixture));
  const rejected = await owner(db).reject(token(submitted));
  await assert.rejects(owner(db).approve(token(rejected)), code("REVISION_CONFLICT"));
  await assert.rejects(owner(db).publish(token(rejected)), code("REVISION_CONFLICT"));
  const clone = await w.cloneCatalogDraft(db, { sourceRevisionId: fixture.revision.id, expectedSourceVersion: fixture.version });
  const replacement = await staff(db).submit({ revisionId: clone.id, expectedVersion: 1 });
  assert.notEqual(replacement.contentHash, submitted.contentHash);
  await assert.rejects(owner(db).approve({ ...token(replacement), expectedHash: submitted.contentHash }), code("HASH_CONFLICT"));
  await owner(db).approve(token(replacement));
  await owner(db).archive(token(rejected));
}));

test("live catalog survives draft edits and approval, then switches atomically to its replacement", () => withRollback(async db => {
  const fixture = await complete(db), submitted = await owner(db).submit(sourceToken(fixture));
  const first = await owner(db).publish(token(await owner(db).approve(token(submitted))));
  await assert.rejects(owner(db).archive(token(first)), code("LIVE_REVISION"));
  await rejectSql(db, "DELETE FROM catalog_publication WHERE id=1");
  const clone = await w.cloneCatalogDraft(db, { sourceRevisionId: fixture.revision.id, expectedSourceVersion: fixture.version });
  await w.updateVariantPrice(db, { revisionId: clone.id, expectedVersion: 1, productId: fixture.product.productId,
    variantId: fixture.variant.variantId, basePrice: 500000 });
  assert.equal((await getPublishedCatalog(db)).productVariants[0].basePrice, 250000);
  const next = await owner(db).submit({ revisionId: clone.id, expectedVersion: 2 });
  const approved = await owner(db).approve(token(next));
  assert.equal((await getPublishedCatalog(db)).revision.id, fixture.revision.id);
  await owner(db).publish(token(approved));
  assert.equal((await getPublishedCatalog(db)).revision.id, clone.id);
  assert.equal((await getPublishedCatalog(db)).productVariants[0].basePrice, 500000);
  await assert.rejects(owner(db).publish(token(first)), code("REVISION_CONFLICT"));
  await owner(db).archive(token(first));
  assert.equal((await getPublishedCatalog(db)).revision.id, clone.id);
}));

test("submission, approval and audit records are append-only; deferred receipts require a completed transition", () => withRollback(async db => {
  const fixture = await complete(db), submitted = await owner(db).submit(sourceToken(fixture));
  await owner(db).approve(token(submitted));
  for (const table of ["catalog_submissions", "catalog_approvals", "catalog_workflow_events"]) {
    await rejectSql(db, `DELETE FROM ${table} WHERE revision_id=$1`, [fixture.revision.id]);
    await rejectSql(db, `UPDATE ${table} SET revision_id=revision_id WHERE revision_id=$1`, [fixture.revision.id]);
  }
  await db.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
  const empty = await w.createCatalogDraft(db);
  await assert.rejects(db.transaction(async tx => {
    await tx.insert(s.catalogSubmissions).values({ revisionId: empty.id, version: 1,
      contentHash: "a".repeat(64), submittedBy: "qa-orphan" });
  }), error => error.cause?.code === "23514" || error.code === "23514");
}));

test("real SQL failure after a transition rolls back its root, receipt and audit", () => withRollback(async db => {
  const fixture = await complete(db);
  const broken = {
    transaction: callback => db.transaction(tx => callback(new Proxy(tx, {
      get(target, key) {
        if (key === "insert") return table => {
          if (table === s.catalogWorkflowEvents) return { values: () => target.execute(sql`SELECT 1/0`) };
          return target.insert(table);
        };
        const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
      },
    }))),
  };
  await assert.rejects(owner(broken).submit(sourceToken(fixture)), code("PERSISTENCE_FAILED"));
  assert.equal((await root(db, fixture.revision.id)).status, "draft");
  assert.equal((await root(db, fixture.revision.id)).contentHash, null);
  assert.equal((await db.select().from(s.catalogSubmissions)).length, 0);
  assert.equal((await db.select().from(s.catalogWorkflowEvents)).length, 0);
  const submitted = await owner(db).submit(sourceToken(fixture));
  await assert.rejects(owner(broken).approve(token(submitted)), code("PERSISTENCE_FAILED"));
  assert.equal((await root(db, fixture.revision.id)).status, "review");
  assert.equal((await db.select().from(s.catalogApprovals)).length, 0);
  await assert.rejects(owner(broken).reject(token(submitted)), code("PERSISTENCE_FAILED"));
  assert.equal((await root(db, fixture.revision.id)).status, "review");
  const approved = await owner(db).approve(token(submitted));
  await assert.rejects(owner(broken).publish(token(approved)), code("PERSISTENCE_FAILED"));
  assert.equal((await root(db, fixture.revision.id)).status, "approved");
  assert.equal(await getPublishedCatalog(db), null);
  await assert.rejects(owner(broken).archive(token(approved)), code("PERSISTENCE_FAILED"));
  assert.equal((await root(db, fixture.revision.id)).status, "approved");
  assert.equal((await db.select().from(s.catalogWorkflowEvents)).length, 2);
}));

test("migration SQL errors and failed final verification roll back SQL and history together", async () => {
  const client = await connectTestOwner();
  try {
    const count = async () => Number((await client.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count);
    const before = await count();
    for (const failSql of [true, false]) {
      await assert.rejects(applyReviewedMigration(client, { sql: [
        "CREATE TEMP TABLE qa_migration_atomicity(value integer)",
        ...(failSql ? ["SELECT 1/0"] : []),
      ], hash: "qa-rollback-only", folderMillis: 1 }, async () => { throw new Error("qa-final-verification-failure"); }));
      assert.equal(await count(), before);
      assert.equal((await client.query("SELECT to_regclass('pg_temp.qa_migration_atomicity') AS name")).rows[0].name, null);
    }
  } finally { await client.end(); }
});

test("runtime roles keep no workflow grants and default auth cannot publish", async () => {
  const client = new pg.Client(getDatabaseConfig(process.env, "test"));
  try {
    await client.connect();
    for (const table of workflowTables) {
      assert.equal((await client.query("SELECT has_table_privilege(session_user,$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed",
        ["public." + table])).rows[0].allowed, false);
    }
    await assert.rejects(createCatalogWorkflow({ db: drizzle(client) }).publish({
      revisionId: randomUUID(), expectedVersion: 1, expectedHash: "a".repeat(64),
    }), code("AUTH_REQUIRED"));
    await assert.rejects(getPublishedCatalog(drizzle(client)), code("PERSISTENCE_FAILED"));
  } finally { await client.end(); }
});

// Only test DB owners can enter this maintenance path. No application bypass.
// Lock all affected tables, disable USER triggers transactionally, delete exact
// tracked IDs, reenable before commit; never truncate or touch dev data.
const cleanup = async (client, tracked) => {
  assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name, "tiny_osaka_test");
  await client.query("BEGIN");
  try {
    await client.query("LOCK TABLE " + workflowTables.map(t => "public." + t).join(",") + " IN ACCESS EXCLUSIVE MODE");
    for (const table of workflowTables) await client.query(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
    for (const table of ["catalog_publication", "catalog_workflow_events", "catalog_approvals", "catalog_submissions",
      "modifier_option_translations", "modifier_options", "modifier_group_translations", "modifier_groups",
      "variant_translations", "product_variants", "product_translations", "product_entries", "category_translations", "category_entries"]) {
      await client.query(`DELETE FROM public.${table} WHERE revision_id=ANY($1::uuid[])`, [tracked.revision]);
    }
    await client.query("DELETE FROM catalog_revisions WHERE id=ANY($1::uuid[])", [tracked.revision]);
    for (const [table, ids] of [["products", tracked.product], ["categories", tracked.category]]) {
      await client.query(`DELETE FROM ${table} WHERE id=ANY($1::uuid[])`, [ids]);
    }
    for (const table of workflowTables) await client.query(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);
    await verifyCatalogProtection(client, "tiny_osaka_test_owner");
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    throw new Error("Inspect owned publication fixture IDs: " + JSON.stringify(tracked));
  }
};

const blocked = async (client, pids) => {
  for (let i = 0; i < 80; i++) {
    const { rows: [row] } = await client.query("SELECT count(*)::integer AS total FROM unnest($1::integer[]) AS w(pid) WHERE cardinality(pg_blocking_pids(w.pid))>0", [pids]);
    if (row.total === pids.length) return;
    await delay(25);
  }
  assert.fail("Workers did not reach actual database lock contention.");
};

test("concurrent submit versus editor and approve versus reject have one atomic winner", async () => {
  const client = await connectTestOwner(), a = await connectTestOwner(), b = await connectTestOwner();
  const tracked = { revision: [], category: [], product: [] };
  let pending = [];
  try {
    const fixture = await drizzle(client).transaction(tx => complete(tx, (type, id) => tracked[type].push(id)));
    const pids = [(await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid, (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid];
    await client.query("BEGIN");
    await client.query("SELECT id FROM catalog_revisions WHERE id=$1 FOR UPDATE", [fixture.revision.id]);
    pending = [
      staff(drizzle(a)).submit(sourceToken(fixture)),
      w.updateVariantPrice(drizzle(b), { ...sourceToken(fixture), productId: fixture.product.productId,
        variantId: fixture.variant.variantId, basePrice: 350000 }),
    ].map(promise => promise.then(value => ({ value }), error => ({ error })));
    await blocked(client, pids);
    await client.query("ROLLBACK");
    const results = await Promise.all(pending); pending = [];
    assert.equal(results.filter(r => r.value).length, 1);
    assert.equal(results.filter(r => r.error?.code === "REVISION_CONFLICT").length, 1);
    const current = await root(drizzle(client), fixture.revision.id);
    const submitted = current.status === "review" ? results[0].value :
      await staff(drizzle(client)).submit({ revisionId: current.id, expectedVersion: current.version });
    await client.query("BEGIN");
    await client.query("SELECT id FROM catalog_revisions WHERE id=$1 FOR UPDATE", [fixture.revision.id]);
    pending = [owner(drizzle(a)).approve(token(submitted)), owner(drizzle(b)).reject(token(submitted))]
      .map(promise => promise.then(value => ({ value }), error => ({ error })));
    await blocked(client, pids);
    await client.query("ROLLBACK");
    const decision = await Promise.all(pending); pending = [];
    assert.equal(decision.filter(r => r.value).length, 1);
    assert.equal(decision.filter(r => r.error?.code === "REVISION_CONFLICT").length, 1);
    assert.equal((await drizzle(client).select().from(s.catalogWorkflowEvents)).length, 2);
  } finally {
    await client.query("ROLLBACK");
    await Promise.all(pending);
    await a.end(); await b.end();
    try { await cleanup(client, tracked); } finally { await client.end(); }
  }
});

test("simultaneous first publication serializes and exposes one complete approved snapshot", async () => {
  const client = await connectTestOwner(), a = await connectTestOwner(), b = await connectTestOwner();
  const tracked = { revision: [], category: [], product: [] };
  let pending = [];
  try {
    const approved = [];
    for (let i = 0; i < 2; i++) {
      const fixture = await drizzle(client).transaction(tx => complete(tx, (type, id) => tracked[type].push(id)));
      const submitted = await owner(drizzle(client)).submit(sourceToken(fixture));
      approved.push(await owner(drizzle(client)).approve(token(submitted)));
    }
    const pids = [(await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid, (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid];
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(76210984)");
    pending = [owner(drizzle(a)).publish(token(approved[0])), owner(drizzle(b)).publish(token(approved[1]))]
      .map(promise => promise.then(value => ({ value }), error => ({ error })));
    await blocked(client, pids);
    assert.equal(await getPublishedCatalog(drizzle(client)), null);
    await client.query("ROLLBACK");
    const results = await Promise.all(pending); pending = [];
    assert.equal(results.filter(r => r.value).length, 2);
    const graph = await getPublishedCatalog(drizzle(client));
    assert.ok(approved.some(r => r.revisionId === graph.revision.id));
    assert.equal(graph.productEntries.length, 1);
    assert.equal(graph.productTranslations.length, 2);
    assert.equal((await drizzle(client).select().from(s.catalogPublication)).length, 1);
  } finally {
    await client.query("ROLLBACK"); await Promise.all(pending);
    await a.end(); await b.end();
    try { await cleanup(client, tracked); } finally { await client.end(); }
  }
});

test("all seventeen tables are empty and all protection functions/triggers remain intact", async () => {
  const client = await connectTestOwner();
  try {
    for (const table of workflowTables) assert.equal((await client.query(`SELECT count(*)::integer AS total FROM public.${table}`)).rows[0].total, 0);
    await verifyCatalogProtection(client, "tiny_osaka_test_owner");
    assert.equal(Number((await client.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count), 8);
  } finally { await client.end(); }
});

