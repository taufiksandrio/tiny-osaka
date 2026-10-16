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
import { createCatalogDraft, updateVariantPrice, cloneCatalogDraft, saveCategoryTranslation, saveProductTranslation, CatalogDraftError } from "../../src/server/catalog/drafts.mjs";

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
      for (const [revision, product, variant] of [[ids.revision, ids.product, ids.variant],
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

const writers = [
  { save: saveCategoryTranslation, key: "categoryId", id: "category", table: "category_translations", column: "category_id" },
  { save: saveProductTranslation, key: "productId", id: "product", table: "product_translations", column: "product_id" },
];
const input = (ids, writer, fields = {}) => ({ revisionId: ids.revision, [writer.key]: ids[writer.id],
  expectedVersion: 1, locale: "id", title: "QA 日本語 & Bahasa", description: "QA line one\nline two", ...fields });
const rejectCode = code => error => error instanceof CatalogDraftError && error.code === code;
const versionOf = async (client, revision) => (await client.query("SELECT version FROM catalog_revisions WHERE id=$1", [revision])).rows[0].version;
const translations = async (client, writer, ids, revision = ids.revision) => (await client.query(
  `SELECT locale,title,description FROM ${writer.table} WHERE revision_id=$1 AND ${writer.column}=$2 ORDER BY locale`,
  [revision, ids[writer.id]])).rows;

test("inserts then updates one locale for category/product, with exact text and one version increment per save", () => withFixture(async ({ client, db, ids }) => {
  let expectedVersion = 1;
  for (const writer of writers) {
    const before = await translations(client, writer, ids);
    const data = input(ids, writer, { expectedVersion, slug: "must-not-change", status: "published" });
    const result = await writer.save(db, data);
    assert.deepEqual(result, { revisionId: ids.revision, version: ++expectedVersion, [writer.key]: ids[writer.id],
      locale: "id", title: data.title, description: data.description });
    await writer.save(db, input(ids, writer, { expectedVersion: expectedVersion++, title: "QA updated", description: "" }));
    const after = await translations(client, writer, ids);
    assert.deepEqual(after, [...before, { locale: "id", title: "QA updated", description: "" }]);
    assert.equal(await versionOf(client, ids.revision), expectedVersion);
  }
  assert.equal((await client.query("SELECT status FROM catalog_revisions WHERE id=$1", [ids.revision])).rows[0].status, "draft");
  assert.equal((await client.query("SELECT slug FROM products WHERE id=$1", [ids.product])).rows[0].slug, `qa-draft-${ids.product}`);
  assert.equal((await client.query("SELECT slug FROM categories WHERE id=$1", [ids.category])).rows[0].slug, `qa-draft-${ids.category}`);
}));

test("ID/EN and revisions remain isolated; HTML-like characters are literal text", () => withFixture(async ({ client, db, ids }) => {
  let expectedVersion = 1;
  for (const writer of writers) {
    const otherBefore = await translations(client, writer, ids, ids.otherRevision);
    const enBefore = (await translations(client, writer, ids))[0];
    const text = '<script>alert("QA")</script> & <b>literal text</b>';
    await writer.save(db, input(ids, writer, { expectedVersion: expectedVersion++, title: "  QA literal <tag>  ", description: text }));
    const afterId = await translations(client, writer, ids);
    assert.deepEqual(afterId[0], enBefore);
    assert.equal(afterId[1].description, text);
    assert.equal(afterId[1].title, "  QA literal <tag>  ");
    await writer.save(db, input(ids, writer, { expectedVersion: expectedVersion++, locale: "en", title: "QA changed EN", description: "QA English updated" }));
    assert.deepEqual((await translations(client, writer, ids))[1], afterId[1]);
    assert.deepEqual(await translations(client, writer, ids, ids.otherRevision), otherBefore);
  }
  assert.equal(await versionOf(client, ids.otherRevision), 1);
}));

test("missing or cross-revision entries roll back the root version and do not create rows", () => withFixture(async ({ client, db, ids, revisions }) => {
  const empty = await db.transaction(async tx => {
    const revision = await createCatalogDraft(tx); revisions.push(revision.id); return revision;
  });
  for (const writer of writers) {
    const before = await translations(client, writer, ids);
    await assert.rejects(writer.save(db, input(ids, writer, { [writer.key]: randomUUID() })), rejectCode("ENTRY_NOT_FOUND"));
    await assert.rejects(writer.save(db, input(ids, writer, { revisionId: empty.id })), rejectCode("ENTRY_NOT_FOUND"));
    assert.equal(await versionOf(client, ids.revision), 1);
    assert.equal(await versionOf(client, empty.id), 1);
    assert.deepEqual(await translations(client, writer, ids), before);
    assert.deepEqual(await translations(client, writer, ids, empty.id), []);
  }
}));

test("missing and stale drafts are rejected without changing translation rows", () => withFixture(async ({ client, db, ids }) => {
  await saveCategoryTranslation(db, input(ids, writers[0]));
  for (const writer of writers) {
    const before = await translations(client, writer, ids);
    await assert.rejects(writer.save(db, input(ids, writer, { title: "QA stale" })), rejectCode("REVISION_CONFLICT"));
    await assert.rejects(writer.save(db, input(ids, writer, { revisionId: randomUUID() })), rejectCode("REVISION_CONFLICT"));
    assert.deepEqual(await translations(client, writer, ids), before);
  }
  assert.equal(await versionOf(client, ids.revision), 2);
}));

test("invalid locale/blank names/null-byte text leave both data and token unchanged", () => withFixture(async ({ client, db, ids }) => {
  for (const writer of writers) {
    const before = await translations(client, writer, ids);
    for (const fields of [{ locale: "jp" }, { title: " \t\n\u00a0" }, { description: null }, { description: "QA\0" }]) {
      await assert.rejects(writer.save(db, input(ids, writer, fields)), rejectCode("INVALID_INPUT"));
    }
    assert.deepEqual(await translations(client, writer, ids), before);
  }
  assert.equal(await versionOf(client, ids.revision), 1);
}));

test("real SQL failure after saving translation rolls back the text and root increment", () => withFixture(async ({ client, db, ids }) => {
  const failingDb = { transaction: run => db.transaction(async tx => {
    await run(tx);
    await tx.execute(sql`SELECT 1 / 0`); // exercise rollback after both actual writes
  }) };
  for (const writer of writers) {
    const before = await translations(client, writer, ids);
    await assert.rejects(writer.save(failingDb, input(ids, writer)), rejectCode("PERSISTENCE_FAILED"));
    assert.equal(await versionOf(client, ids.revision), 1);
    assert.deepEqual(await translations(client, writer, ids), before);
  }
}));

test("translation writes respect int4 version exhaustion", () => withFixture(async ({ client, db, ids }) => {
  await client.query("UPDATE catalog_revisions SET version=2147483646 WHERE id=$1", [ids.revision]);
  assert.equal((await saveProductTranslation(db, input(ids, writers[1], { expectedVersion: 2147483646 }))).version, 2147483647);
  for (const writer of writers) {
    const before = await translations(client, writer, ids);
    await assert.rejects(writer.save(db, input(ids, writer, { expectedVersion: 2147483647 })), rejectCode("INVALID_INPUT"));
    assert.deepEqual(await translations(client, writer, ids), before);
  }
  assert.equal(await versionOf(client, ids.revision), 2147483647);
}));

test("editing translations on a cloned draft does not change source or its version", () => withFixture(async ({ client, db, ids, revisions }) => {
  const source = [];
  for (const writer of writers) source.push(await translations(client, writer, ids));
  const clone = await db.transaction(async tx => {
    const row = await cloneCatalogDraft(tx, { sourceRevisionId: ids.revision, expectedSourceVersion: 1 });
    revisions.push(row.id); return row;
  });
  for (const [idx, writer] of writers.entries()) {
    await writer.save(db, input(ids, writer, { revisionId: clone.id, expectedVersion: idx + 1 }));
    assert.deepEqual(await translations(client, writer, ids), source[idx]);
  }
  assert.equal(await versionOf(client, ids.revision), 1);
  assert.equal(await versionOf(client, clone.id), 3);
}));

test("concurrent text and price edits compete for one shared root version", () => withFixture(async ({ client, ids }) => {
  const workers = [];
  let pending;
  try {
    workers.push(await connectTestOwner()); workers.push(await connectTestOwner());
    const pids = [];
    for (const worker of workers) pids.push((await worker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    await client.query("BEGIN");
    await client.query("SELECT id FROM catalog_revisions WHERE id=$1 FOR UPDATE", [ids.revision]);
    pending = Promise.allSettled([
      saveProductTranslation(drizzle(workers[0]), input(ids, writers[1])),
      updateVariantPrice(drizzle(workers[1]), { revisionId: ids.revision, productId: ids.product, variantId: ids.variant, expectedVersion: 1, basePrice: 400000 }),
    ]);
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
    const loser = results.find(row => row.status === "rejected");
    assert.ok(rejectCode("REVISION_CONFLICT")(loser?.reason));
    assert.equal(await versionOf(client, ids.revision), 2);
    const price = Number((await client.query("SELECT base_price FROM product_variants WHERE revision_id=$1 AND id=$2", [ids.revision, ids.variant])).rows[0].base_price);
    const savedText = (await translations(client, writers[1], ids)).find(row => row.locale === "id");
    if (results[0].status === "fulfilled") {
      assert.equal(savedText.title, input(ids, writers[1]).title);
      assert.equal(price, 250000);
    } else {
      assert.equal(savedText, undefined);
      assert.equal(price, 400000);
    }
  } finally {
    await client.query("ROLLBACK");
    if (pending) await pending;
    for (const worker of workers) await worker.end();
  }
}));

test("unchanged app privileges deny both translation writer operations", () => withFixture(async ({ ids }) => {
  const config = getDatabaseConfig(process.env, "test");
  assert.equal(new URL(config.connectionString).username, "tiny_osaka_test_app");
  const client = new pg.Client(config);
  try {
    try { await client.connect(); } catch { throw new Error("Test app connection failed; inspect credentials locally."); }
    for (const writer of writers) {
      await assert.rejects(writer.save(drizzle(client), input(ids, writer)), rejectCode("PERSISTENCE_FAILED"));
    }
  } finally { await client.end(); }
}));

test("all thirteen tables are empty after translation fixture cleanup", async () => {
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
