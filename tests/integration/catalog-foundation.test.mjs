import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as writers from "../../src/server/catalog/drafts.mjs";
import { getCatalogReviewReadiness } from "../../src/server/catalog/review.mjs";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { pricingTables } from "../../scripts/lib/test-migration-plan.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";

const childTables = ["category_entries", "category_translations", "product_entries", "product_translations", "product_variants",
  "variant_translations", "modifier_groups", "modifier_group_translations", "modifier_options", "modifier_option_translations"];
const rejectCode = code => error => error instanceof writers.CatalogDraftError && error.code === code;
const root = async (client, id) => (await client.query("SELECT * FROM catalog_revisions WHERE id=$1", [id])).rows[0];
const slug = prefix => `qa-foundation-${prefix}-${randomUUID()}`;
const waitBlocked = async (client, pids) => {
  for (let attempt = 0; attempt < 80; attempt++) {
    const { rows: [row] } = await client.query("SELECT count(*)::integer AS count FROM unnest($1::integer[]) AS worker(pid) WHERE cardinality(pg_blocking_pids(worker.pid))>0", [pids]);
    if (row.count === pids.length) return;
    await delay(25);
  }
  assert.fail("Independent sessions must actually wait on their transaction locks.");
};

// Every identity and revision is created by application writers. Record IDs before
// outer commit so cleanup never needs wildcard slugs or global deletion.
const withFixture = async run => {
  const client = await connectTestOwner();
  const db = drizzle(client);
  const revisions = [];
  const identities = { categories: [], products: [] };
  const addOn = (context, save, input) => context.transaction(async tx => {
    const row = await save(tx, input);
    if (save === writers.createCatalogDraft || save === writers.cloneCatalogDraft) revisions.push(row.id);
    if (save === writers.createCatalogCategory) identities.categories.push({ id: row.categoryId, slug: row.slug });
    if (save === writers.createCatalogProduct) identities.products.push({ id: row.productId, slug: row.slug });
    return row;
  });
  const add = (save, input) => addOn(db, save, input);
  try {
    const source = await add(writers.createCatalogDraft);
    const other = await add(writers.createCatalogDraft);
    await run({ client, db, source, other, add, addOn });
  } finally {
    try {
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      for (const table of [...childTables].reverse()) await client.query(`DELETE FROM ${table} WHERE revision_id=ANY($1::uuid[])`, [revisions]);
      await client.query("DELETE FROM catalog_revisions WHERE id=ANY($1::uuid[])", [revisions]);
      for (const table of ["products", "categories"]) {
        for (const identity of identities[table]) await client.query(`DELETE FROM ${table} WHERE id=$1 AND slug=$2`, [identity.id, identity.slug]);
      }
      await client.query("COMMIT");
      for (const table of ["catalog_revisions", ...childTables]) {
        const key = table === "catalog_revisions" ? "id" : "revision_id";
        const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM ${table} WHERE ${key}=ANY($1::uuid[])`, [revisions]);
        assert.equal(row.count, 0);
      }
      for (const table of ["products", "categories"]) {
        const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM ${table} WHERE id=ANY($1::uuid[])`, [identities[table].map(value => value.id)]);
        assert.equal(row.count, 0);
      }
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`Foundation fixture cleanup failed; inspect ONLY these owned IDs: ${JSON.stringify({ revisions, identities })}`);
    } finally { await client.end(); }
  }
};

const minimal = async context => {
  const { source, add } = context;
  const category = await add(writers.createCatalogCategory, { revisionId: source.id, expectedVersion: 1, slug: slug("category"), sortOrder: 0 });
  const product = await add(writers.createCatalogProduct, { revisionId: source.id, expectedVersion: 2, slug: slug("product"), sortOrder: 0, categoryId: category.categoryId });
  return { category, product, version: 3 };
};
const complete = async context => {
  const { source, add } = context;
  const graph = await minimal(context);
  let version = graph.version;
  const scope = { revisionId: source.id, productId: graph.product.productId };
  const variant = await add(writers.createProductVariant, { ...scope, expectedVersion: version++, code: "standard", basePrice: 250000, sortOrder: 0 });
  const group = await add(writers.createModifierGroup, { ...scope, expectedVersion: version++, code: "toppings", selectionType: "single", minSelections: 1, maxSelections: 1, sortOrder: 0 });
  const option = await add(writers.createModifierOption, { ...scope, groupId: group.groupId, expectedVersion: version++, code: "qa-option", priceDelta: 150000, sortOrder: 0 });
  for (const locale of ["id", "en"]) {
    const text = { locale, title: `QA synthetic ${locale}`, description: "QA only" };
    for (const [save, fields] of [
      [writers.saveCategoryTranslation, { revisionId: source.id, categoryId: graph.category.categoryId }],
      [writers.saveProductTranslation, scope], [writers.saveVariantTranslation, { ...scope, variantId: variant.variantId }],
      [writers.saveModifierGroupTranslation, { ...scope, groupId: group.groupId }],
      [writers.saveModifierOptionTranslation, { ...scope, groupId: group.groupId, optionId: option.optionId }],
    ]) await add(save, { ...fields, ...text, expectedVersion: version++ });
  }
  return { ...graph, variant, group, option, version, scope };
};
const report = (context, version, revisionId = context.source.id) => getCatalogReviewReadiness(context.db, { revisionId, expectedVersion: version });

test("from empty draft to complete bilingual review structure using only application writers", () => withFixture(async context => {
  const empty = await report(context, 1);
  assert.equal(empty.ready, false);
  assert.ok(empty.issues.some(row => row.code === "EMPTY_CATALOG"));
  const graph = await complete(context);
  const before = await root(context.client, context.source.id);
  assert.deepEqual(await report(context, graph.version), { revisionId: context.source.id, version: 16, ready: true, issues: [] });
  assert.deepEqual(await root(context.client, context.source.id), before); // report makes no DML/version change
  assert.equal(before.status, "draft");
}));

test("category/product namespaces allow the same slug but duplicates across revisions are atomic conflicts", () => withFixture(async context => {
  const { source, other, add, client } = context;
  const shared = slug("shared");
  const category = await add(writers.createCatalogCategory, { revisionId: source.id, expectedVersion: 1, slug: shared, sortOrder: 0 });
  await add(writers.createCatalogProduct, { revisionId: source.id, expectedVersion: 2, categoryId: category.categoryId, slug: shared, sortOrder: 0 });
  await assert.rejects(add(writers.createCatalogCategory, { revisionId: other.id, expectedVersion: 1, slug: shared, sortOrder: 0 }), rejectCode("SLUG_CONFLICT"));
  assert.equal((await root(client, other.id)).version, 1);
  const otherCategory = await add(writers.createCatalogCategory, { revisionId: other.id, expectedVersion: 1, slug: slug("other"), sortOrder: 0 });
  await assert.rejects(add(writers.createCatalogProduct, { revisionId: other.id, expectedVersion: 2, categoryId: otherCategory.categoryId, slug: shared, sortOrder: 0 }), rejectCode("SLUG_CONFLICT"));
  assert.equal((await root(client, other.id)).version, 2);
  assert.equal((await client.query("SELECT count(*)::integer AS count FROM product_entries WHERE revision_id=$1", [other.id])).rows[0].count, 0);
}));

test("placement/creation require entries in the exact revision and reject stale or missing drafts", () => withFixture(async context => {
  const { source, other, add, client } = context;
  const graph = await minimal(context);
  const foreign = await add(writers.createCatalogCategory, { revisionId: other.id, expectedVersion: 1, slug: slug("foreign"), sortOrder: 0 });
  const calls = [
    [writers.createCatalogProduct, { revisionId: source.id, expectedVersion: 3, categoryId: foreign.categoryId, slug: slug("invalid"), sortOrder: 0 }],
    [writers.updateCategoryPlacement, { revisionId: source.id, expectedVersion: 3, categoryId: foreign.categoryId, sortOrder: 1 }],
    [writers.updateProductPlacement, { revisionId: source.id, expectedVersion: 3, productId: graph.product.productId, categoryId: foreign.categoryId, sortOrder: 1 }],
    [writers.updateProductPlacement, { revisionId: other.id, expectedVersion: 2, productId: graph.product.productId, categoryId: foreign.categoryId, sortOrder: 1 }],
  ];
  for (const [save, input] of calls) await assert.rejects(add(save, input), rejectCode("ENTRY_NOT_FOUND"));
  await assert.rejects(add(writers.createCatalogCategory, { revisionId: source.id, expectedVersion: 2, slug: slug("stale"), sortOrder: 0 }), rejectCode("REVISION_CONFLICT"));
  await assert.rejects(add(writers.createCatalogCategory, { revisionId: randomUUID(), expectedVersion: 1, slug: slug("missing"), sortOrder: 0 }), rejectCode("REVISION_CONFLICT"));
  assert.equal((await root(client, source.id)).version, 3);
  assert.equal((await root(client, other.id)).version, 2);
}));

test("moving/reordering cloned entries affects only the clone, never shared slugs or source content", () => withFixture(async context => {
  const { add, client, source } = context;
  const graph = await complete(context);
  const clone = await add(writers.cloneCatalogDraft, { sourceRevisionId: source.id, expectedSourceVersion: graph.version });
  const category = await add(writers.createCatalogCategory, { revisionId: clone.id, expectedVersion: 1, slug: slug("clone-category"), sortOrder: 10 });
  await add(writers.updateProductPlacement, { revisionId: clone.id, expectedVersion: 2, productId: graph.product.productId, categoryId: category.categoryId.toUpperCase(), sortOrder: 8, slug: "ignored" });
  await add(writers.updateCategoryPlacement, { revisionId: clone.id, expectedVersion: 3, categoryId: graph.category.categoryId, sortOrder: 2147483647, slug: "ignored" });
  const { rows } = await client.query("SELECT revision_id,category_id,sort_order FROM product_entries WHERE product_id=$1 ORDER BY revision_id", [graph.product.productId]);
  assert.equal(rows.find(row => row.revision_id === source.id).category_id, graph.category.categoryId);
  assert.equal(rows.find(row => row.revision_id === source.id).sort_order, 0);
  assert.equal(rows.find(row => row.revision_id === clone.id).category_id, category.categoryId);
  assert.equal(rows.find(row => row.revision_id === clone.id).sort_order, 8);
  assert.equal((await client.query("SELECT slug FROM products WHERE id=$1", [graph.product.productId])).rows[0].slug, graph.product.slug);
  assert.equal((await report(context, 4, clone.id)).ready, false); // missing new-category translations
  for (const [idx, locale] of ["id", "en"].entries()) await add(writers.saveCategoryTranslation, { revisionId: clone.id,
    expectedVersion: 4 + idx, categoryId: category.categoryId, locale, title: "QA clone category", description: "" });
  assert.equal((await report(context, 6, clone.id)).ready, true);
  assert.equal((await report(context, graph.version)).ready, true);
}));

test("actual SQL failure rolls back new identity/entry and each placement update", () => withFixture(async context => {
  const { db, client, source } = context;
  const graph = await minimal(context);
  const before = {};
  for (const table of ["categories", "products", "category_entries", "product_entries"]) before[table] = (await client.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows;
  const failing = { transaction: run => db.transaction(async tx => { await run(tx); await tx.execute(sql`SELECT 1/0`); }) };
  for (const [save, input] of [
    [writers.createCatalogCategory, { revisionId: source.id, expectedVersion: 3, slug: slug("failure-cat"), sortOrder: 0 }],
    [writers.createCatalogProduct, { revisionId: source.id, expectedVersion: 3, slug: slug("failure-prod"), categoryId: graph.category.categoryId, sortOrder: 0 }],
    [writers.updateCategoryPlacement, { revisionId: source.id, expectedVersion: 3, categoryId: graph.category.categoryId, sortOrder: 8 }],
    [writers.updateProductPlacement, { revisionId: source.id, expectedVersion: 3, categoryId: graph.category.categoryId, productId: graph.product.productId, sortOrder: 8 }],
  ]) {
    await assert.rejects(save(failing, input), rejectCode("PERSISTENCE_FAILED"));
    assert.equal((await root(client, source.id)).version, 3);
    for (const table of Object.keys(before)) assert.deepEqual((await client.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows, before[table]);
  }
}));

test("readiness refuses stale/missing revision and flags overflow in a complete stored catalog", () => withFixture(async context => {
  const { add, source } = context;
  const graph = await complete(context);
  await assert.rejects(report(context, graph.version - 1), rejectCode("REVISION_CONFLICT"));
  await assert.rejects(report(context, 1, randomUUID()), rejectCode("REVISION_CONFLICT"));
  await add(writers.updateModifierOption, { ...graph.scope, groupId: graph.group.groupId, optionId: graph.option.optionId,
    expectedVersion: 16, code: "qa-option", priceDelta: Number.MAX_SAFE_INTEGER, sortOrder: 0 });
  const overflow = await report(context, 17);
  assert.ok(overflow.issues.some(row => row.code === "PRICE_TOTAL_OVERFLOW"));
  await add(writers.updateModifierOption, { ...graph.scope, groupId: graph.group.groupId, optionId: graph.option.optionId,
    expectedVersion: 17, code: "qa-option", priceDelta: 150000, sortOrder: 0 });
  await add(writers.updateVariantPrice, { ...graph.scope, variantId: graph.variant.variantId, expectedVersion: 18, basePrice: Number.MAX_SAFE_INTEGER - 150000 });
  assert.equal((await report(context, 19, source.id)).ready, true);
}));

test("concurrent slug creation in different revisions has one winner without orphan identities", () => withFixture(async context => {
  const { client, source, other, addOn } = context;
  const workers = []; let pending;
  const shared = slug("race");
  try {
    workers.push(await connectTestOwner()); workers.push(await connectTestOwner());
    const pids = [];
    for (const worker of workers) pids.push((await worker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    await client.query("BEGIN");
    await client.query("SELECT id FROM catalog_revisions WHERE id=ANY($1::uuid[]) FOR UPDATE", [[source.id, other.id]]);
    pending = Promise.allSettled(workers.map((worker, idx) => addOn(drizzle(worker), writers.createCatalogCategory,
      { revisionId: [source.id, other.id][idx], expectedVersion: 1, slug: shared, sortOrder: 0 })));
    try { await waitBlocked(client, pids); } finally { await client.query("ROLLBACK"); }
    const results = await pending;
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    assert.ok(rejectCode("SLUG_CONFLICT")(results.find(row => row.status === "rejected")?.reason));
    assert.deepEqual([(await root(client, source.id)).version, (await root(client, other.id)).version].sort(), [1, 2]);
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM categories WHERE slug=$1", [shared])).rows[0].count, 1);
  } finally {
    await client.query("ROLLBACK"); if (pending) await pending;
    for (const worker of workers) await worker.end();
  }
}));

test("category reorder and product move race on the same revision without partial losing writes", () => withFixture(async context => {
  const { client, source, add, addOn } = context;
  const graph = await minimal(context);
  const destination = await add(writers.createCatalogCategory, { revisionId: source.id, expectedVersion: 3, slug: slug("destination"), sortOrder: 0 });
  const workers = []; let pending;
  try {
    workers.push(await connectTestOwner()); workers.push(await connectTestOwner());
    const pids = [];
    for (const worker of workers) pids.push((await worker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    await client.query("BEGIN"); await client.query("SELECT id FROM catalog_revisions WHERE id=$1 FOR UPDATE", [source.id]);
    pending = Promise.allSettled([
      addOn(drizzle(workers[0]), writers.updateCategoryPlacement, { revisionId: source.id, expectedVersion: 4, categoryId: graph.category.categoryId, sortOrder: 9 }),
      addOn(drizzle(workers[1]), writers.updateProductPlacement, { revisionId: source.id, expectedVersion: 4, categoryId: destination.categoryId, productId: graph.product.productId, sortOrder: 8 }),
    ]);
    try { await waitBlocked(client, pids); } finally { await client.query("ROLLBACK"); }
    const results = await pending;
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    assert.ok(rejectCode("REVISION_CONFLICT")(results.find(row => row.status === "rejected")?.reason));
    assert.equal((await root(client, source.id)).version, 5);
    const category = (await client.query("SELECT sort_order FROM category_entries WHERE revision_id=$1 AND category_id=$2", [source.id, graph.category.categoryId])).rows[0];
    const product = (await client.query("SELECT category_id,sort_order FROM product_entries WHERE revision_id=$1 AND product_id=$2", [source.id, graph.product.productId])).rows[0];
    assert.equal(category.sort_order, results[0].status === "fulfilled" ? 9 : 0);
    assert.equal(product.category_id, results[1].status === "fulfilled" ? destination.categoryId : graph.category.categoryId);
    assert.equal(product.sort_order, results[1].status === "fulfilled" ? 8 : 0);
  } finally {
    await client.query("ROLLBACK"); if (pending) await pending;
    for (const worker of workers) await worker.end();
  }
}));

test("readiness locks a consistent version, then becomes stale after a waiting editor commits", () => withFixture(async context => {
  const { db, client, source, addOn } = context;
  const graph = await complete(context);
  const worker = await connectTestOwner(); let pending;
  try {
    const pid = (await worker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await db.transaction(async tx => {
      const checked = await getCatalogReviewReadiness(tx, { revisionId: source.id, expectedVersion: graph.version });
      assert.equal(checked.ready, true); assert.equal(checked.version, 16);
      pending = addOn(drizzle(worker), writers.createCatalogCategory, { revisionId: source.id, expectedVersion: 16, slug: slug("waiting"), sortOrder: 0 })
        .then(value => ({ value }), error => ({ error }));
      await waitBlocked(client, [pid]);
      assert.equal((await root(client, source.id)).version, 16);
    });
    assert.equal((await pending).value?.version, 17);
    await assert.rejects(report(context, 16), rejectCode("REVISION_CONFLICT"));
    const changed = await report(context, 17);
    assert.equal(changed.ready, false);
    assert.ok(changed.issues.some(row => row.code === "MISSING_TRANSLATION"));
  } finally { if (pending) await pending; await worker.end(); }
}));

test("last writable version succeeds, exhaustion cannot overflow, and reporting still works", () => withFixture(async context => {
  const { source, client, add } = context;
  await client.query("UPDATE catalog_revisions SET version=2147483646 WHERE id=$1", [source.id]);
  const category = await add(writers.createCatalogCategory, { revisionId: source.id, expectedVersion: 2147483646, slug: slug("last"), sortOrder: 2147483647 });
  assert.equal(category.version, 2147483647);
  for (const [save, input] of [
    [writers.createCatalogCategory, { revisionId: source.id, expectedVersion: 2147483647, slug: slug("blocked"), sortOrder: 0 }],
    [writers.createCatalogProduct, { revisionId: source.id, expectedVersion: 2147483647, slug: slug("blocked"), categoryId: category.categoryId, sortOrder: 0 }],
    [writers.updateCategoryPlacement, { revisionId: source.id, expectedVersion: 2147483647, categoryId: category.categoryId, sortOrder: 0 }],
    [writers.updateProductPlacement, { revisionId: source.id, expectedVersion: 2147483647, productId: randomUUID(), categoryId: category.categoryId, sortOrder: 0 }],
  ]) await assert.rejects(add(save, input), rejectCode("INVALID_INPUT"));
  assert.equal((await report(context, 2147483647)).ready, false);
  assert.equal((await root(client, source.id)).version, 2147483647);
}));

test("unchanged application privileges deny new writers and draft readiness reads", () => withFixture(async context => {
  const graph = await minimal(context);
  const config = getDatabaseConfig(process.env, "test");
  assert.equal(new URL(config.connectionString).username, "tiny_osaka_test_app");
  const client = new pg.Client(config);
  try {
    try { await client.connect(); } catch { throw new Error("Test app connection failed; inspect credentials locally."); }
    const db = drizzle(client);
    for (const [save, input] of [
      [writers.createCatalogCategory, { revisionId: context.source.id, expectedVersion: 3, slug: slug("denied"), sortOrder: 0 }],
      [writers.createCatalogProduct, { revisionId: context.source.id, expectedVersion: 3, slug: slug("denied"), categoryId: graph.category.categoryId, sortOrder: 0 }],
      [writers.updateCategoryPlacement, { revisionId: context.source.id, expectedVersion: 3, categoryId: graph.category.categoryId, sortOrder: 0 }],
      [writers.updateProductPlacement, { revisionId: context.source.id, expectedVersion: 3, productId: graph.product.productId, categoryId: graph.category.categoryId, sortOrder: 0 }],
      [getCatalogReviewReadiness, { revisionId: context.source.id, expectedVersion: 3 }],
    ]) await assert.rejects(save(db, input), rejectCode("PERSISTENCE_FAILED"));
  } finally { await client.end(); }
}));

test("all thirteen tables are empty after complete application-writer fixture cleanup", async () => {
  const client = await connectTestOwner();
  try {
    await client.query("BEGIN READ ONLY");
    for (const table of pricingTables) assert.equal((await client.query(`SELECT count(*)::integer AS count FROM ${table}`)).rows[0].count, 0);
    await client.query("ROLLBACK");
  } finally { await client.end(); }
});
