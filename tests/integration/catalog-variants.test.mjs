import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { pricingTables } from "../../scripts/lib/test-migration-plan.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";
import { createCatalogDraft, updateVariantPrice, cloneCatalogDraft, saveProductTranslation, createProductVariant, updateProductVariant, saveVariantTranslation, CatalogDraftError } from "../../src/server/catalog/drafts.mjs";

// Committed synthetic fixtures permit real concurrent connections. Cleanup is
// limited to exact IDs created here, in dependency order; never reset the DB.
const withFixture = async (run, seed = true) => {
  const client = await connectTestOwner(); // fail closed before any write
  const db = drizzle(client);
  const ids = Object.fromEntries(["category", "product", "otherProduct", "variant", "otherVariant", "otherRevisionVariant"].map(key => [key, randomUUID()]));
  const revisions = [];
  try {
    const created = await db.transaction(async tx => {
      const rows = [];
      for (let i = 0; i < 2; i++) {
        const row = await createCatalogDraft(tx);
        revisions.push(row.id); // known before commit, including ambiguous failures
        rows.push(row);
      }
      return rows;
    });
    [ids.revision, ids.otherRevision] = revisions;
    if (seed) {
      await client.query("BEGIN");
      await client.query("INSERT INTO categories(id,slug) VALUES ($1,$2)", [ids.category, `qa-draft-${ids.category}`]);
      for (const product of [ids.product, ids.otherProduct]) {
        await client.query("INSERT INTO products(id,slug) VALUES ($1,$2)", [product, `qa-draft-${product}`]);
      }
      for (const revision of revisions) {
        await client.query("INSERT INTO category_entries(revision_id,category_id) VALUES ($1,$2)", [revision, ids.category]);
        await client.query("INSERT INTO category_translations(revision_id,category_id,locale,title,description) VALUES ($1,$2,'en','QA existing category EN','QA English description')", [revision, ids.category]);
        for (const product of [ids.product, ids.otherProduct]) {
          await client.query("INSERT INTO product_entries(revision_id,product_id,category_id) VALUES ($1,$2,$3)", [revision, product, ids.category]);
        }
        await client.query("INSERT INTO product_translations(revision_id,product_id,locale,title,description) VALUES ($1,$2,'en','QA existing product EN','QA English description')", [revision, ids.product]);
      }
      for (const [revision, product, variant] of [
        [ids.revision, ids.otherProduct, ids.otherVariant], [ids.otherRevision, ids.product, ids.otherRevisionVariant]]) {
        await client.query("INSERT INTO product_variants(revision_id,product_id,id,code,base_price) VALUES ($1,$2,$3,'standard',250000)", [revision, product, variant]);
      }
      await client.query("COMMIT");
    }
    await run({ client, db, ids, revisions, created });
  } finally {
    try {
      await client.query("ROLLBACK"); // clear any failed fixture transaction
      await client.query("BEGIN");
      await client.query("DELETE FROM variant_translations WHERE revision_id = ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM product_variants WHERE revision_id = ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM product_translations WHERE revision_id = ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM product_entries WHERE revision_id = ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM category_translations WHERE revision_id = ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM category_entries WHERE revision_id = ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM catalog_revisions WHERE id = ANY($1::uuid[])", [revisions]);
      for (const product of [ids.product, ids.otherProduct]) {
        await client.query("DELETE FROM products WHERE id=$1 AND slug=$2", [product, `qa-draft-${product}`]);
      }
      await client.query("DELETE FROM categories WHERE id=$1 AND slug=$2", [ids.category, `qa-draft-${ids.category}`]);
      await client.query("COMMIT");
      for (const table of pricingTables.filter(name => !["categories", "products"].includes(name))) {
        const key = table === "catalog_revisions" ? "id" : "revision_id";
        const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM ${table} WHERE ${key} = ANY($1::uuid[])`, [revisions]);
        assert.equal(row.count, 0, "Temporary draft rows must be removed.");
      }
      const { rows: [row] } = await client.query(`SELECT
        (SELECT count(*) FROM categories WHERE id=$1) +
        (SELECT count(*) FROM products WHERE id IN ($2,$3)) AS count`, [ids.category, ids.product, ids.otherProduct]);
      assert.equal(Number(row.count), 0);
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`Synthetic draft cleanup failed; inspect ONLY these fixture IDs: ${JSON.stringify({ ...ids, revisions })}`);
    } finally { await client.end(); }
  }
};

const variantInput = (ids, fields = {}) => ({ revisionId: ids.revision, productId: ids.product,
  expectedVersion: 1, code: "standard", basePrice: 250000, sortOrder: 2, ...fields });
const textInput = (ids, variantId, fields = {}) => ({ revisionId: ids.revision, productId: ids.product,
  variantId, expectedVersion: 2, locale: "id", title: "QA 日本語 varian", description: "QA description\nline two", ...fields });
const rejectCode = code => error => error instanceof CatalogDraftError && error.code === code;
const versionOf = async (client, ids) => (await client.query("SELECT version FROM catalog_revisions WHERE id=$1", [ids.revision])).rows[0].version;
const variantsOf = async (client, ids, revision = ids.revision) => (await client.query(
  "SELECT id,code,base_price,sort_order FROM product_variants WHERE revision_id=$1 AND product_id=$2 ORDER BY code", [revision, ids.product])).rows;
const textsOf = async (client, ids, variantId, revision = ids.revision) => (await client.query(
  "SELECT locale,title,description FROM variant_translations WHERE revision_id=$1 AND product_id=$2 AND variant_id=$3 ORDER BY locale", [revision, ids.product, variantId])).rows;

test("first/sole variant requires standard; IDs are generated and zero/safe-limit prices and int4 sort work", () => withFixture(async ({ client, db, ids }) => {
  await assert.rejects(createProductVariant(db, variantInput(ids, { code: "large" })), rejectCode("VARIANT_RULE_VIOLATION"));
  assert.equal(await versionOf(client, ids), 1);
  assert.deepEqual(await variantsOf(client, ids), []);
  const row = await createProductVariant(db, variantInput(ids, { basePrice: 0, variantId: ids.variant }));
  assert.notEqual(row.variantId, ids.variant);
  assert.equal(row.version, 2);
  assert.equal(row.basePrice, 0);
  await assert.rejects(updateProductVariant(db, variantInput(ids, { variantId: row.variantId, expectedVersion: 2, code: "renamed" })), rejectCode("VARIANT_RULE_VIOLATION"));
  assert.equal(await versionOf(client, ids), 2);
  const edited = await updateProductVariant(db, variantInput(ids, { variantId: row.variantId.toUpperCase(), expectedVersion: 2,
    basePrice: Number.MAX_SAFE_INTEGER, sortOrder: 2147483647 }));
  assert.equal(edited.version, 3);
  assert.equal(edited.basePrice, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(await variantsOf(client, ids), [{ id: row.variantId, code: "standard", base_price: "9007199254740991", sort_order: 2147483647 }]);
}));

test("adds and edits named variants without changing siblings, translations, slug or status", () => withFixture(async ({ client, db, ids }) => {
  const standard = await createProductVariant(db, variantInput(ids));
  const large = await createProductVariant(db, variantInput(ids, { expectedVersion: 2, code: "large", basePrice: 400000, sortOrder: 4 }));
  await saveVariantTranslation(db, textInput(ids, large.variantId, { expectedVersion: 3 }));
  const beforeText = await textsOf(client, ids, large.variantId);
  const edited = await updateProductVariant(db, variantInput(ids, { variantId: large.variantId, expectedVersion: 4,
    code: "premium", basePrice: 600000, sortOrder: 8, status: "published", slug: "ignored" }));
  assert.equal(edited.version, 5);
  assert.deepEqual(await textsOf(client, ids, large.variantId), beforeText);
  assert.deepEqual(await variantsOf(client, ids), [
    { id: large.variantId, code: "premium", base_price: "600000", sort_order: 8 },
    { id: standard.variantId, code: "standard", base_price: "250000", sort_order: 2 },
  ]);
  // When there are multiple variants, a named code may replace standard.
  await updateProductVariant(db, variantInput(ids, { variantId: standard.variantId, expectedVersion: 5, code: "small" }));
  assert.equal((await client.query("SELECT status FROM catalog_revisions WHERE id=$1", [ids.revision])).rows[0].status, "draft");
  assert.equal((await client.query("SELECT slug FROM products WHERE id=$1", [ids.product])).rows[0].slug, `qa-draft-${ids.product}`);
}));

test("duplicate codes on creation/edit roll back both variant data and root version", () => withFixture(async ({ client, db, ids }) => {
  await createProductVariant(db, variantInput(ids));
  const large = await createProductVariant(db, variantInput(ids, { expectedVersion: 2, code: "large" }));
  const before = await variantsOf(client, ids);
  await assert.rejects(createProductVariant(db, variantInput(ids, { expectedVersion: 3 })), rejectCode("VARIANT_CODE_CONFLICT"));
  await assert.rejects(updateProductVariant(db, variantInput(ids, { expectedVersion: 3, variantId: large.variantId })), rejectCode("VARIANT_CODE_CONFLICT"));
  assert.equal(await versionOf(client, ids), 3);
  assert.deepEqual(await variantsOf(client, ids), before);
}));

test("creation requires a product entry in the selected revision", () => withFixture(async ({ client, db, ids, revisions }) => {
  const empty = await db.transaction(async tx => { const row = await createCatalogDraft(tx); revisions.push(row.id); return row; });
  for (const fields of [{ productId: randomUUID() }, { revisionId: empty.id }]) {
    await assert.rejects(createProductVariant(db, variantInput(ids, fields)), rejectCode("ENTRY_NOT_FOUND"));
  }
  assert.equal(await versionOf(client, ids), 1);
  assert.equal((await client.query("SELECT version FROM catalog_revisions WHERE id=$1", [empty.id])).rows[0].version, 1);
  assert.deepEqual(await variantsOf(client, ids), []);
}));

test("edit/translation composite scope rejects foreign variants and rolls back the token", () => withFixture(async ({ client, db, ids }) => {
  const standard = await createProductVariant(db, variantInput(ids));
  const before = await variantsOf(client, ids);
  for (const fields of [{ variantId: randomUUID() }, { variantId: ids.otherVariant },
    { variantId: ids.otherRevisionVariant }, { productId: ids.otherProduct, variantId: standard.variantId }]) {
    await assert.rejects(updateProductVariant(db, variantInput(ids, { expectedVersion: 2, variantId: standard.variantId, ...fields })), rejectCode("VARIANT_NOT_FOUND"));
    await assert.rejects(saveVariantTranslation(db, textInput(ids, standard.variantId, fields)), rejectCode("VARIANT_NOT_FOUND"));
  }
  assert.equal(await versionOf(client, ids), 2);
  assert.deepEqual(await variantsOf(client, ids), before);
  assert.deepEqual(await textsOf(client, ids, standard.variantId), []);
}));

test("variant ID/EN upserts preserve other locale/revision and exact literal text", () => withFixture(async ({ client, db, ids }) => {
  const standard = await createProductVariant(db, variantInput(ids));
  await saveVariantTranslation(db, textInput(ids, standard.variantId));
  await saveVariantTranslation(db, textInput(ids, standard.variantId, { expectedVersion: 3, locale: "en", title: "QA standard EN", description: "QA English" }));
  const before = await textsOf(client, ids, standard.variantId);
  await saveVariantTranslation(db, textInput(ids, standard.variantId, { expectedVersion: 4, title: "  QA <literal> 日本語  ", description: "" }));
  assert.deepEqual(await textsOf(client, ids, standard.variantId), [before[0], { locale: "id", title: "  QA <literal> 日本語  ", description: "" }]);
  assert.deepEqual(await textsOf(client, ids, ids.otherRevisionVariant, ids.otherRevision), []);
  assert.equal(await versionOf(client, ids), 5);
}));

test("SQL failure after actual writes rolls back create, edit and translated text", () => withFixture(async ({ client, db, ids }) => {
  const failing = { transaction: run => db.transaction(async tx => { await run(tx); await tx.execute(sql`SELECT 1/0`); }) };
  await assert.rejects(createProductVariant(failing, variantInput(ids)), rejectCode("PERSISTENCE_FAILED"));
  assert.deepEqual(await variantsOf(client, ids), []);
  assert.equal(await versionOf(client, ids), 1);
  const standard = await createProductVariant(db, variantInput(ids));
  const before = await variantsOf(client, ids);
  await assert.rejects(updateProductVariant(failing, variantInput(ids, { variantId: standard.variantId, expectedVersion: 2, basePrice: 400000 })), rejectCode("PERSISTENCE_FAILED"));
  await assert.rejects(saveVariantTranslation(failing, textInput(ids, standard.variantId)), rejectCode("PERSISTENCE_FAILED"));
  assert.deepEqual(await variantsOf(client, ids), before);
  assert.deepEqual(await textsOf(client, ids, standard.variantId), []);
  assert.equal(await versionOf(client, ids), 2);
}));

test("all new writers reject stale/missing roots and guard version exhaustion", () => withFixture(async ({ client, db, ids }) => {
  const standard = await createProductVariant(db, variantInput(ids));
  const calls = fields => [
    () => createProductVariant(db, variantInput(ids, { code: "large", ...fields })),
    () => updateProductVariant(db, variantInput(ids, { variantId: standard.variantId, ...fields })),
    () => saveVariantTranslation(db, textInput(ids, standard.variantId, fields)),
  ];
  for (const fields of [{ expectedVersion: 1 }, { revisionId: randomUUID(), expectedVersion: 1 }]) {
    for (const run of calls(fields)) await assert.rejects(run(), rejectCode("REVISION_CONFLICT"));
  }
  await client.query("UPDATE catalog_revisions SET version=2147483646 WHERE id=$1", [ids.revision]);
  await updateProductVariant(db, variantInput(ids, { variantId: standard.variantId, expectedVersion: 2147483646 }));
  for (const run of calls({ expectedVersion: 2147483647 })) await assert.rejects(run(), rejectCode("INVALID_INPUT"));
  assert.equal(await versionOf(client, ids), 2147483647);
  assert.equal((await variantsOf(client, ids)).length, 1);
}));

test("new variants and labels survive cloning; clone edits leave source independent", () => withFixture(async ({ client, db, ids, revisions }) => {
  const standard = await createProductVariant(db, variantInput(ids));
  await saveVariantTranslation(db, textInput(ids, standard.variantId));
  const before = await variantsOf(client, ids);
  const labels = await textsOf(client, ids, standard.variantId);
  const clone = await db.transaction(async tx => {
    const row = await cloneCatalogDraft(tx, { sourceRevisionId: ids.revision, expectedSourceVersion: 3 }); revisions.push(row.id); return row;
  });
  assert.deepEqual(await variantsOf(client, ids, clone.id), before);
  assert.deepEqual(await textsOf(client, ids, standard.variantId, clone.id), labels);
  await updateProductVariant(db, variantInput(ids, { revisionId: clone.id, variantId: standard.variantId, basePrice: 400000, sortOrder: 8 }));
  await saveVariantTranslation(db, textInput(ids, standard.variantId, { revisionId: clone.id, title: "QA clone label" }));
  assert.deepEqual(await variantsOf(client, ids), before);
  assert.deepEqual(await textsOf(client, ids, standard.variantId), labels);
  assert.equal(await versionOf(client, ids), 3);
}));

const race = async (client, workers, revisionId, calls) => {
  const pids = [];
  for (const worker of workers) pids.push((await worker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
  let pending;
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM catalog_revisions WHERE id=$1 FOR UPDATE", [revisionId]);
    pending = Promise.allSettled(calls.map((run, idx) => run(drizzle(workers[idx]))));
    try {
      let blocked = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        const { rows: [row] } = await client.query("SELECT count(*)::integer AS count FROM unnest($1::integer[]) AS worker(pid) WHERE cardinality(pg_blocking_pids(worker.pid))>0", [pids]);
        if (row.count === 2) { blocked = true; break; }
        await delay(25);
      }
      assert.ok(blocked, "Both different writers must be waiting concurrently.");
    } finally { await client.query("ROLLBACK"); }
    const results = await pending;
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    assert.ok(rejectCode("REVISION_CONFLICT")(results.find(row => row.status === "rejected")?.reason));
    return results;
  } finally {
    await client.query("ROLLBACK");
    if (pending) await pending;
  }
};

test("variant creation and product text compete for the same root token", () => withFixture(async ({ client, ids }) => {
  const workers = [];
  try {
    workers.push(await connectTestOwner()); workers.push(await connectTestOwner());
    const results = await race(client, workers, ids.revision, [db => createProductVariant(db, variantInput(ids)),
      db => saveProductTranslation(db, { revisionId: ids.revision, productId: ids.product, expectedVersion: 1, locale: "id", title: "QA concurrent", description: "" })]);
    assert.equal(await versionOf(client, ids), 2);
    assert.equal((await variantsOf(client, ids)).length, results[0].status === "fulfilled" ? 1 : 0);
    const rows = (await client.query("SELECT title FROM product_translations WHERE revision_id=$1 AND product_id=$2 AND locale='id'", [ids.revision, ids.product])).rows;
    assert.equal(rows.length, results[1].status === "fulfilled" ? 1 : 0);
  } finally { for (const worker of workers) await worker.end(); }
}));

test("full variant edit and existing price-only writer cannot overwrite each other", () => withFixture(async ({ client, db, ids }) => {
  const standard = await createProductVariant(db, variantInput(ids));
  const workers = [];
  try {
    workers.push(await connectTestOwner()); workers.push(await connectTestOwner());
    const results = await race(client, workers, ids.revision, [context => updateProductVariant(context,
      variantInput(ids, { variantId: standard.variantId, expectedVersion: 2, basePrice: 400000, sortOrder: 8 })),
    context => updateVariantPrice(context, { revisionId: ids.revision, productId: ids.product, variantId: standard.variantId, expectedVersion: 2, basePrice: 900000 })]);
    assert.equal(await versionOf(client, ids), 3);
    const [stored] = await variantsOf(client, ids);
    assert.equal(stored.base_price, results[0].status === "fulfilled" ? "400000" : "900000");
    assert.equal(stored.sort_order, results[0].status === "fulfilled" ? 8 : 2);
  } finally { for (const worker of workers) await worker.end(); }
}));

test("unchanged app permissions deny variant create/edit/translation", () => withFixture(async ({ client: owner, db, ids }) => {
  const standard = await createProductVariant(db, variantInput(ids));
  const config = getDatabaseConfig(process.env, "test");
  assert.equal(new URL(config.connectionString).username, "tiny_osaka_test_app");
  const client = new pg.Client(config);
  try {
    try { await client.connect(); } catch { throw new Error("Test app connection failed; inspect credentials locally."); }
    const app = drizzle(client);
    await assert.rejects(createProductVariant(app, variantInput(ids, { expectedVersion: 2, code: "large" })), rejectCode("PERSISTENCE_FAILED"));
    await assert.rejects(updateProductVariant(app, variantInput(ids, { expectedVersion: 2, variantId: standard.variantId })), rejectCode("PERSISTENCE_FAILED"));
    await assert.rejects(saveVariantTranslation(app, textInput(ids, standard.variantId)), rejectCode("PERSISTENCE_FAILED"));
    assert.equal(await versionOf(owner, ids), 2);
  } finally { await client.end(); }
}));

test("all thirteen tables are empty after variant/translation fixture cleanup", async () => {
  const client = await connectTestOwner();
  try {
    await client.query("BEGIN READ ONLY");
    for (const table of pricingTables) {
      const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM public.${table}`);
      assert.equal(row.count, 0);
    }
    await client.query("ROLLBACK");
  } finally { await client.end(); }
});

