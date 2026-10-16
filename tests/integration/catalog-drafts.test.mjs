import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { pricingTables } from "../../scripts/lib/test-migration-plan.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";
import { createCatalogDraft, updateVariantPrice, CatalogDraftError } from "../../src/server/catalog/drafts.mjs";

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
        for (const product of [ids.product, ids.otherProduct]) {
          await client.query("INSERT INTO product_entries(revision_id,product_id,category_id) VALUES ($1,$2,$3)", [revision, product, ids.category]);
        }
      }
      for (const [revision, product, variant] of [[ids.revision, ids.product, ids.variant],
        [ids.revision, ids.otherProduct, ids.otherVariant], [ids.otherRevision, ids.product, ids.otherRevisionVariant]]) {
        await client.query("INSERT INTO product_variants(revision_id,product_id,id,code,base_price) VALUES ($1,$2,$3,'standard',250000)", [revision, product, variant]);
      }
      await client.query("COMMIT");
    }
    await run({ client, db, ids, created });
  } finally {
    try {
      await client.query("ROLLBACK"); // clear any failed fixture transaction
      await client.query("BEGIN");
      await client.query("DELETE FROM product_variants WHERE revision_id = ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM product_entries WHERE revision_id = ANY($1::uuid[])", [revisions]);
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
const edit = (ids, fields = {}) => ({ revisionId: ids.revision, productId: ids.product, variantId: ids.variant,
  expectedVersion: 1, basePrice: 400000, ...fields });
const rejectCode = code => error => error instanceof CatalogDraftError && error.code === code;
const current = async (client, ids) => {
  const { rows: [row] } = await client.query(`SELECT r.version,v.base_price FROM catalog_revisions r
    JOIN product_variants v ON v.revision_id=r.id WHERE r.id=$1 AND v.product_id=$2 AND v.id=$3`, [ids.revision, ids.product, ids.variant]);
  return { version: row.version, basePrice: Number(row.base_price) };
};

test("creates independent empty drafts with server-generated defaults", () => withFixture(async ({ client, created }) => {
  assert.notEqual(created[0].id, created[1].id);
  for (const row of created) {
    assert.match(row.id, /^[0-9a-f-]{36}$/);
    assert.equal(row.status, "draft");
    assert.equal(row.version, 1);
    assert.ok(row.createdAt instanceof Date);
    const { rows: [count] } = await client.query("SELECT count(*)::integer AS count FROM product_entries WHERE revision_id=$1", [row.id]);
    assert.equal(count.count, 0);
  }
}, false));

test("saves prices and increments version atomically, including zero and the safe integer limit", () => withFixture(async ({ client, db, ids }) => {
  for (const [idx, basePrice] of [400000, 0, Number.MAX_SAFE_INTEGER].entries()) {
    const result = await updateVariantPrice(db, edit(ids, { expectedVersion: idx + 1, basePrice }));
    assert.deepEqual(result, { revisionId: ids.revision, version: idx + 2, variantId: ids.variant, basePrice });
    assert.deepEqual(await current(client, ids), { version: idx + 2, basePrice });
  }
}));

test("stale and missing revisions fail without overwriting a saved price", () => withFixture(async ({ client, db, ids }) => {
  await updateVariantPrice(db, edit(ids));
  await assert.rejects(updateVariantPrice(db, edit(ids, { basePrice: 900000 })), rejectCode("REVISION_CONFLICT"));
  await assert.rejects(updateVariantPrice(db, edit(ids, { revisionId: randomUUID() })), rejectCode("REVISION_CONFLICT"));
  assert.deepEqual(await current(client, ids), { version: 2, basePrice: 400000 });
}));

test("wrong product/revision/variant scope rolls back the version increment", () => withFixture(async ({ client, db, ids }) => {
  for (const fields of [{ variantId: randomUUID() }, { variantId: ids.otherVariant },
    { variantId: ids.otherRevisionVariant }, { productId: ids.otherProduct }]) {
    await assert.rejects(updateVariantPrice(db, edit(ids, fields)), rejectCode("VARIANT_NOT_FOUND"));
    assert.deepEqual(await current(client, ids), { version: 1, basePrice: 250000 });
  }
  const { rows } = await client.query("SELECT version FROM catalog_revisions WHERE id=$1", [ids.otherRevision]);
  assert.equal(rows[0].version, 1);
  const result = await updateVariantPrice(db, edit(ids)); // failures did not consume the version
  assert.equal(result.version, 2);
}));

test("invalid price input leaves persisted price/version unchanged", () => withFixture(async ({ client, db, ids }) => {
  for (const basePrice of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(updateVariantPrice(db, edit(ids, { basePrice })), rejectCode("INVALID_INPUT"));
    assert.deepEqual(await current(client, ids), { version: 1, basePrice: 250000 });
  }
}));

test("last writable int4 version succeeds once; exhaustion cannot wrap or alter price", () => withFixture(async ({ client, db, ids }) => {
  await client.query("UPDATE catalog_revisions SET version=2147483646 WHERE id=$1", [ids.revision]);
  assert.equal((await updateVariantPrice(db, edit(ids, { expectedVersion: 2147483646 }))).version, 2147483647);
  await assert.rejects(updateVariantPrice(db, edit(ids, { expectedVersion: 2147483647, basePrice: 900000 })), rejectCode("INVALID_INPUT"));
  assert.deepEqual(await current(client, ids), { version: 2147483647, basePrice: 400000 });
}));

test("two actual simultaneous editors produce one winner and one stale conflict", () => withFixture(async ({ client, ids }) => {
  const workers = [];
  let pending;
  try {
    workers.push(await connectTestOwner());
    workers.push(await connectTestOwner());
    const pids = [];
    for (const worker of workers) {
      const { rows: [row] } = await worker.query("SELECT pg_backend_pid() AS pid");
      pids.push(row.pid);
    }
    await client.query("BEGIN");
    await client.query("SELECT id FROM catalog_revisions WHERE id=$1 FOR UPDATE", [ids.revision]);
    pending = Promise.allSettled(workers.map((worker, idx) => updateVariantPrice(drizzle(worker), edit(ids, { basePrice: 400000 + idx }))));
    try {
      let bothWaiting = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        // pg_stat_activity detail is restricted after SET ROLE to the NOLOGIN
        // owner. Query the lock graph directly without expanding privileges.
        const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count
          FROM unnest($1::integer[]) AS worker(pid) WHERE cardinality(pg_blocking_pids(worker.pid)) > 0`, [pids]);
        if (row.count === 2) { bothWaiting = true; break; }
        await delay(25);
      }
      assert.ok(bothWaiting, "Both independent writers must be waiting concurrently before releasing the revision lock.");
    } finally { await client.query("ROLLBACK"); }
    const results = await pending;
    const winners = results.filter(result => result.status === "fulfilled");
    const losers = results.filter(result => result.status === "rejected");
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.ok(rejectCode("REVISION_CONFLICT")(losers[0].reason));
    assert.deepEqual(await current(client, ids), { version: 2, basePrice: winners[0].value.basePrice });
  } finally {
    await client.query("ROLLBACK");
    if (pending) await pending;
    for (const worker of workers) await worker.end();
  }
}));

test("unchanged runtime application privileges deny both draft writer operations", async () => {
  const config = getDatabaseConfig(process.env, "test");
  assert.equal(new URL(config.connectionString).username, "tiny_osaka_test_app");
  const client = new pg.Client(config);
  try {
    try { await client.connect(); } catch { throw new Error("Test app connection failed; inspect credentials locally."); }
    const db = drizzle(client);
    await assert.rejects(createCatalogDraft(db), rejectCode("PERSISTENCE_FAILED"));
    await assert.rejects(updateVariantPrice(db, { revisionId: randomUUID(), productId: randomUUID(), variantId: randomUUID(), expectedVersion: 1, basePrice: 250000 }), rejectCode("PERSISTENCE_FAILED"));
  } finally { await client.end(); }
});

test("all catalog tables are empty after committed fixture cleanup", async () => {
  const client = await connectTestOwner();
  try {
    await client.query("BEGIN READ ONLY");
    for (const table of pricingTables) {
      const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM public.${table}`);
      assert.equal(row.count, 0, "No synthetic draft rows may remain.");
    }
    await client.query("ROLLBACK");
  } finally { await client.end(); }
});
