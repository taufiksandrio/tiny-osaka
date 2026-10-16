import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { pricingTables } from "../../scripts/lib/test-migration-plan.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";
import { createCatalogDraft, updateVariantPrice, cloneCatalogDraft, createProductVariant, createModifierGroup, updateModifierGroup, createModifierOption, updateModifierOption, saveModifierGroupTranslation, saveModifierOptionTranslation, CatalogDraftError } from "../../src/server/catalog/drafts.mjs";

import { productVariants, modifierGroups, modifierOptions } from "../../src/server/db/schema.mjs";
import { calculatePrice, validatePricingProduct, CatalogPricingError } from "../../src/server/catalog/pricing.mjs";

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
      await client.query("DELETE FROM modifier_option_translations WHERE revision_id = ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM modifier_options WHERE revision_id = ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM modifier_group_translations WHERE revision_id = ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM modifier_groups WHERE revision_id = ANY($1::uuid[])", [revisions]);
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

const groupInput = (ids, fields = {}) => ({ revisionId: ids.revision, productId: ids.product, expectedVersion: 1,
  code: "toppings", selectionType: "multiple", minSelections: 1, maxSelections: 2, sortOrder: 3, ...fields });
const optionInput = (ids, groupId, fields = {}) => ({ revisionId: ids.revision, productId: ids.product, groupId,
  expectedVersion: 3, code: "paid", priceDelta: 150000, sortOrder: 4, ...fields });
const labelInput = (ids, groupId, fields = {}) => ({ revisionId: ids.revision, productId: ids.product, groupId,
  expectedVersion: 7, locale: "id", title: "QA 日本語 topping", description: "QA description\nline two", ...fields });
const rejectCode = code => error => error instanceof CatalogDraftError && error.code === code;
const versionOf = async (client, ids) => (await client.query("SELECT version FROM catalog_revisions WHERE id=$1", [ids.revision])).rows[0].version;
const buildGraph = async ({ db, ids }) => {
  const variant = await createProductVariant(db, { revisionId: ids.revision, productId: ids.product, expectedVersion: 1, code: "standard", basePrice: 250000, sortOrder: 0 });
  const group = await createModifierGroup(db, groupInput(ids, { expectedVersion: 2 }));
  const paid = await createModifierOption(db, optionInput(ids, group.groupId));
  const free = await createModifierOption(db, optionInput(ids, group.groupId, { expectedVersion: 4, code: "free", priceDelta: 0 }));
  const otherGroup = await createModifierGroup(db, groupInput(ids, { expectedVersion: 5, code: "sauce", selectionType: "single", minSelections: 0, maxSelections: 1 }));
  // Same option code is allowed in another group, with a distinct generated ID.
  const otherOption = await createModifierOption(db, optionInput(ids, otherGroup.groupId, { expectedVersion: 6, priceDelta: 20000 }));
  return { variant, group, paid, free, otherGroup, otherOption };
};
const loadProduct = async (db, ids, revisionId = ids.revision) => {
  const scope = table => and(eq(table.revisionId, revisionId), eq(table.productId, ids.product));
  const variants = await db.select().from(productVariants).where(scope(productVariants));
  const groups = await db.select().from(modifierGroups).where(scope(modifierGroups));
  const options = await db.select().from(modifierOptions).where(scope(modifierOptions));
  return { revisionId, productId: ids.product, variants, groups: groups.map(group => ({ ...group, options: options.filter(option => option.groupId === group.id) })) };
};
const tables = ["modifier_groups", "modifier_options", "modifier_group_translations", "modifier_option_translations"];
const snapshot = async (client, revision) => {
  const result = {};
  for (const table of tables) {
    const { rows } = await client.query(`SELECT * FROM ${table} WHERE revision_id=$1`, [revision]);
    result[table] = rows.map(({ revision_id: _revision, ...row }) => JSON.stringify(row)).sort();
  }
  return result;
};

test("creates/edits group settings with generated IDs and preserves ownership", () => withFixture(async ({ client, db, ids }) => {
  const group = await createModifierGroup(db, groupInput(ids, { groupId: randomUUID() }));
  assert.equal(group.version, 2);
  assert.match(group.groupId, /^[0-9a-f-]{36}$/);
  const updated = await updateModifierGroup(db, groupInput(ids, { groupId: group.groupId.toUpperCase(), expectedVersion: 2,
    code: "sauce", selectionType: "single", minSelections: 0, maxSelections: 1, sortOrder: 2147483647, status: "published" }));
  assert.equal(updated.version, 3);
  assert.equal(updated.groupId, group.groupId);
  assert.equal(updated.selectionType, "single");
  assert.equal(updated.sortOrder, 2147483647);
  assert.equal((await client.query("SELECT status FROM catalog_revisions WHERE id=$1", [ids.revision])).rows[0].status, "draft");
}));

test("creates/edits options including zero/safe-limit deltas with stable IDs", () => withFixture(async ({ client, db, ids }) => {
  const group = await createModifierGroup(db, groupInput(ids));
  const suppliedId = randomUUID();
  const option = await createModifierOption(db, optionInput(ids, group.groupId, { expectedVersion: 2, priceDelta: 0, optionId: suppliedId }));
  assert.notEqual(option.optionId, suppliedId);
  assert.equal(option.version, 3);
  const edited = await updateModifierOption(db, optionInput(ids, group.groupId.toUpperCase(), { optionId: option.optionId.toUpperCase(),
    expectedVersion: 3, code: "premium", priceDelta: Number.MAX_SAFE_INTEGER, sortOrder: 2147483647 }));
  assert.equal(edited.version, 4);
  assert.equal(edited.optionId, option.optionId);
  assert.equal(edited.groupId, group.groupId);
  const { rows: [row] } = await client.query("SELECT price_delta,sort_order FROM modifier_options WHERE revision_id=$1 AND id=$2", [ids.revision, option.optionId]);
  assert.equal(row.price_delta, "9007199254740991");
  assert.equal(row.sort_order, 2147483647);
}));

test("duplicate group/option codes are rejected atomically; option code may repeat in different groups", () => withFixture(async context => {
  const { client, db, ids } = context;
  const graph = await buildGraph(context);
  assert.notEqual(graph.paid.optionId, graph.otherOption.optionId);
  const before = await snapshot(client, ids.revision);
  await assert.rejects(createModifierGroup(db, groupInput(ids, { expectedVersion: 7 })), rejectCode("MODIFIER_GROUP_CODE_CONFLICT"));
  await assert.rejects(updateModifierGroup(db, groupInput(ids, { expectedVersion: 7, groupId: graph.otherGroup.groupId })), rejectCode("MODIFIER_GROUP_CODE_CONFLICT"));
  await assert.rejects(createModifierOption(db, optionInput(ids, graph.group.groupId, { expectedVersion: 7 })), rejectCode("MODIFIER_OPTION_CODE_CONFLICT"));
  await assert.rejects(updateModifierOption(db, optionInput(ids, graph.group.groupId, { expectedVersion: 7, optionId: graph.free.optionId })), rejectCode("MODIFIER_OPTION_CODE_CONFLICT"));
  assert.equal(await versionOf(client, ids), 7);
  assert.deepEqual(await snapshot(client, ids.revision), before);
}));

test("invalid single/min/max/amount/sort rules cannot consume the root version", () => withFixture(async context => {
  const { client, db, ids } = context;
  const graph = await buildGraph(context);
  const before = await snapshot(client, ids.revision);
  for (const change of [{ minSelections: -1 }, { minSelections: 3, maxSelections: 2 }, { selectionType: "single" }, { maxSelections: 0.5 }]) {
    await assert.rejects(updateModifierGroup(db, groupInput(ids, { expectedVersion: 7, groupId: graph.group.groupId, ...change })), rejectCode("INVALID_INPUT"));
  }
  for (const change of [{ priceDelta: -1 }, { priceDelta: 0.5 }, { priceDelta: Number.MAX_SAFE_INTEGER + 1 }, { sortOrder: -1 }]) {
    await assert.rejects(updateModifierOption(db, optionInput(ids, graph.group.groupId, { expectedVersion: 7, optionId: graph.paid.optionId, ...change })), rejectCode("INVALID_INPUT"));
  }
  assert.equal(await versionOf(client, ids), 7);
  assert.deepEqual(await snapshot(client, ids.revision), before);
}));

test("full parent/product/revision/group scopes prevent moving groups/options or their labels", () => withFixture(async context => {
  const { client, db, ids } = context;
  const graph = await buildGraph(context);
  const foreignGroup = await createModifierGroup(db, groupInput(ids, { productId: ids.otherProduct, expectedVersion: 7 }));
  const otherRevisionGroup = await createModifierGroup(db, groupInput(ids, { revisionId: ids.otherRevision, expectedVersion: 1 }));
  const before = await snapshot(client, ids.revision);
  await assert.rejects(createModifierGroup(db, groupInput(ids, { productId: randomUUID(), expectedVersion: 8 })), rejectCode("ENTRY_NOT_FOUND"));
  for (const groupId of [foreignGroup.groupId, otherRevisionGroup.groupId, randomUUID()]) {
    await assert.rejects(updateModifierGroup(db, groupInput(ids, { groupId, expectedVersion: 8 })), rejectCode("MODIFIER_GROUP_NOT_FOUND"));
    await assert.rejects(createModifierOption(db, optionInput(ids, groupId, { expectedVersion: 8 })), rejectCode("MODIFIER_GROUP_NOT_FOUND"));
    await assert.rejects(saveModifierGroupTranslation(db, labelInput(ids, groupId, { expectedVersion: 8 })), rejectCode("MODIFIER_GROUP_NOT_FOUND"));
  }
  await assert.rejects(updateModifierOption(db, optionInput(ids, graph.otherGroup.groupId, { optionId: graph.paid.optionId, expectedVersion: 8 })), rejectCode("MODIFIER_OPTION_NOT_FOUND"));
  await assert.rejects(saveModifierOptionTranslation(db, labelInput(ids, graph.otherGroup.groupId, { optionId: graph.paid.optionId, expectedVersion: 8 })), rejectCode("MODIFIER_OPTION_NOT_FOUND"));
  assert.equal(await versionOf(client, ids), 8);
  assert.deepEqual(await snapshot(client, ids.revision), before);
}));

test("group/option ID/EN upserts preserve sibling locale and literal text", () => withFixture(async context => {
  const { client, db, ids } = context;
  const graph = await buildGraph(context);
  let expectedVersion = 7;
  for (const [save, table, fields] of [[saveModifierGroupTranslation, "modifier_group_translations", {}],
    [saveModifierOptionTranslation, "modifier_option_translations", { optionId: graph.paid.optionId }]]) {
    await save(db, labelInput(ids, graph.group.groupId, { ...fields, expectedVersion: expectedVersion++ }));
    await save(db, labelInput(ids, graph.group.groupId, { ...fields, expectedVersion: expectedVersion++, locale: "en", title: "QA EN", description: "QA English" }));
    await save(db, labelInput(ids, graph.group.groupId, { ...fields, expectedVersion: expectedVersion++, title: "  QA <literal> 日本語  ", description: "" }));
    const { rows } = await client.query(`SELECT locale,title,description FROM ${table} WHERE revision_id=$1 ORDER BY locale`, [ids.revision]);
    assert.deepEqual(rows, [{ locale: "en", title: "QA EN", description: "QA English" }, { locale: "id", title: "  QA <literal> 日本語  ", description: "" }]);
  }
  assert.equal(await versionOf(client, ids), 13);
}));

test("stored modifier graph calculates exact totals and enforces required/unique selections and overflow", () => withFixture(async context => {
  const { db, ids } = context;
  const graph = await buildGraph(context);
  const selection = { revisionId: ids.revision, productId: ids.product, optionIds: [graph.paid.optionId, graph.otherOption.optionId] };
  const product = await loadProduct(db, ids);
  assert.equal(calculatePrice(product, selection), 420000);
  assert.equal(calculatePrice(product, { ...selection, optionIds: [graph.free.optionId] }), 250000);
  assert.throws(() => calculatePrice(product, { ...selection, optionIds: [] }), CatalogPricingError);
  assert.throws(() => calculatePrice(product, { ...selection, optionIds: [graph.paid.optionId, graph.paid.optionId] }), CatalogPricingError);
  await updateModifierOption(db, optionInput(ids, graph.group.groupId, { optionId: graph.paid.optionId, expectedVersion: 7, priceDelta: Number.MAX_SAFE_INTEGER }));
  const awaitedProduct = await loadProduct(db, ids);
  assert.throws(() => calculatePrice(awaitedProduct, selection), CatalogPricingError);
}));

test("draft groups may be temporarily underfilled, but readiness rejects them until enough options exist", () => withFixture(async context => {
  const { db, ids } = context;
  const graph = await buildGraph(context);
  await updateModifierGroup(db, groupInput(ids, { groupId: graph.group.groupId, expectedVersion: 7, minSelections: 3, maxSelections: 3 }));
  const underfilled = await loadProduct(db, ids);
  assert.throws(() => validatePricingProduct(underfilled), CatalogPricingError);
  const extra = await createModifierOption(db, optionInput(ids, graph.group.groupId, { expectedVersion: 8, code: "extra", priceDelta: 0 }));
  const ready = await loadProduct(db, ids);
  validatePricingProduct(ready);
  assert.equal(calculatePrice(ready, { revisionId: ids.revision, productId: ids.product, optionIds: [graph.paid.optionId, graph.free.optionId, extra.optionId] }), 400000);
}));

const operations = (ids, graph, version = 7) => [
  [createModifierGroup, groupInput(ids, { expectedVersion: version, code: "extra" })],
  [updateModifierGroup, groupInput(ids, { groupId: graph.group.groupId, expectedVersion: version, code: "edited" })],
  [createModifierOption, optionInput(ids, graph.group.groupId, { expectedVersion: version, code: "extra" })],
  [updateModifierOption, optionInput(ids, graph.group.groupId, { expectedVersion: version, optionId: graph.paid.optionId, priceDelta: 400000 })],
  [saveModifierGroupTranslation, labelInput(ids, graph.group.groupId, { expectedVersion: version })],
  [saveModifierOptionTranslation, labelInput(ids, graph.group.groupId, { expectedVersion: version, optionId: graph.paid.optionId })],
];

test("real SQL failure after each of six writer operations rolls back children and version", () => withFixture(async context => {
  const { client, db, ids } = context;
  const graph = await buildGraph(context);
  const before = await snapshot(client, ids.revision);
  const failing = { transaction: run => db.transaction(async tx => { await run(tx); await tx.execute(sql`SELECT 1/0`); }) };
  for (const [save, input] of operations(ids, graph)) {
    await assert.rejects(save(failing, input), rejectCode("PERSISTENCE_FAILED"));
    assert.equal(await versionOf(client, ids), 7);
    assert.deepEqual(await snapshot(client, ids.revision), before);
  }
}));

test("all six writers reject stale/missing roots and technical version exhaustion", () => withFixture(async context => {
  const { client, db, ids } = context;
  const graph = await buildGraph(context);
  for (const [save, input] of operations(ids, graph, 6)) await assert.rejects(save(db, input), rejectCode("REVISION_CONFLICT"));
  for (const [save, input] of operations(ids, graph)) await assert.rejects(save(db, { ...input, revisionId: randomUUID() }), rejectCode("REVISION_CONFLICT"));
  await client.query("UPDATE catalog_revisions SET version=2147483646 WHERE id=$1", [ids.revision]);
  await updateModifierGroup(db, groupInput(ids, { groupId: graph.group.groupId, expectedVersion: 2147483646 }));
  for (const [save, input] of operations(ids, graph, 2147483647)) await assert.rejects(save(db, input), rejectCode("INVALID_INPUT"));
  assert.equal(await versionOf(client, ids), 2147483647);
}));

test("cloning retains groups/options/labels and later clone edits do not change source", () => withFixture(async context => {
  const { client, db, ids, revisions } = context;
  const graph = await buildGraph(context);
  let expectedVersion = 7;
  for (const locale of ["id", "en"]) {
    await saveModifierGroupTranslation(db, labelInput(ids, graph.group.groupId, { expectedVersion: expectedVersion++, locale }));
    await saveModifierOptionTranslation(db, labelInput(ids, graph.group.groupId, { expectedVersion: expectedVersion++, locale, optionId: graph.paid.optionId }));
  }
  const before = await snapshot(client, ids.revision);
  const clone = await db.transaction(async tx => {
    const row = await cloneCatalogDraft(tx, { sourceRevisionId: ids.revision, expectedSourceVersion: expectedVersion }); revisions.push(row.id); return row;
  });
  assert.deepEqual(await snapshot(client, clone.id), before);
  await updateModifierOption(db, optionInput(ids, graph.group.groupId, { revisionId: clone.id, expectedVersion: 1, optionId: graph.paid.optionId, priceDelta: 0 }));
  await saveModifierGroupTranslation(db, labelInput(ids, graph.group.groupId, { revisionId: clone.id, expectedVersion: 2, title: "QA clone" }));
  await createModifierOption(db, optionInput(ids, graph.group.groupId, { revisionId: clone.id, expectedVersion: 3, code: "clone-only", priceDelta: 0 }));
  assert.deepEqual(await snapshot(client, ids.revision), before);
  assert.equal(await versionOf(client, ids), 11);
}));

const race = async (client, workers, revision, calls) => {
  const pids = [];
  for (const worker of workers) pids.push((await worker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
  let pending;
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM catalog_revisions WHERE id=$1 FOR UPDATE", [revision]);
    pending = Promise.allSettled(calls.map((run, idx) => run(drizzle(workers[idx]))));
    try {
      let blocked = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        const { rows: [row] } = await client.query("SELECT count(*)::integer AS count FROM unnest($1::integer[]) AS worker(pid) WHERE cardinality(pg_blocking_pids(worker.pid))>0", [pids]);
        if (row.count === 2) { blocked = true; break; }
        await delay(25);
      }
      assert.ok(blocked, "Both modifier/mixed writers must be blocked simultaneously.");
    } finally { await client.query("ROLLBACK"); }
    const results = await pending;
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    assert.ok(rejectCode("REVISION_CONFLICT")(results.find(row => row.status === "rejected")?.reason));
    return results;
  } finally { await client.query("ROLLBACK"); if (pending) await pending; }
};

test("concurrent option creation and group-rule edit consume only one version", () => withFixture(async context => {
  const { client, ids } = context;
  const graph = await buildGraph(context);
  const workers = [];
  try {
    workers.push(await connectTestOwner()); workers.push(await connectTestOwner());
    const results = await race(client, workers, ids.revision, [db => createModifierOption(db, optionInput(ids, graph.group.groupId, { expectedVersion: 7, code: "extra", priceDelta: 0 })),
      db => updateModifierGroup(db, groupInput(ids, { groupId: graph.group.groupId, expectedVersion: 7, selectionType: "single", maxSelections: 1 }))]);
    assert.equal(await versionOf(client, ids), 8);
    const count = (await client.query("SELECT count(*)::integer AS count FROM modifier_options WHERE revision_id=$1 AND group_id=$2 AND code='extra'", [ids.revision, graph.group.groupId])).rows[0].count;
    assert.equal(count, results[0].status === "fulfilled" ? 1 : 0);
    const type = (await client.query("SELECT selection_type FROM modifier_groups WHERE revision_id=$1 AND id=$2", [ids.revision, graph.group.groupId])).rows[0].selection_type;
    assert.equal(type, results[1].status === "fulfilled" ? "single" : "multiple");
  } finally { for (const worker of workers) await worker.end(); }
}));

test("modifier price edit and variant price writer cannot partially overwrite each other", () => withFixture(async context => {
  const { client, ids } = context;
  const graph = await buildGraph(context);
  const workers = [];
  try {
    workers.push(await connectTestOwner()); workers.push(await connectTestOwner());
    const results = await race(client, workers, ids.revision, [db => updateModifierOption(db, optionInput(ids, graph.group.groupId, { expectedVersion: 7, optionId: graph.paid.optionId, priceDelta: 400000 })),
      db => updateVariantPrice(db, { revisionId: ids.revision, productId: ids.product, variantId: graph.variant.variantId, expectedVersion: 7, basePrice: 900000 })]);
    assert.equal(await versionOf(client, ids), 8);
    const delta = (await client.query("SELECT price_delta FROM modifier_options WHERE revision_id=$1 AND id=$2", [ids.revision, graph.paid.optionId])).rows[0].price_delta;
    const base = (await client.query("SELECT base_price FROM product_variants WHERE revision_id=$1 AND id=$2", [ids.revision, graph.variant.variantId])).rows[0].base_price;
    assert.equal(delta, results[0].status === "fulfilled" ? "400000" : "150000");
    assert.equal(base, results[1].status === "fulfilled" ? "900000" : "250000");
  } finally { for (const worker of workers) await worker.end(); }
}));

test("unchanged app privileges deny all six modifier writer operations", () => withFixture(async context => {
  const { client: owner, ids } = context;
  const graph = await buildGraph(context);
  const config = getDatabaseConfig(process.env, "test");
  assert.equal(new URL(config.connectionString).username, "tiny_osaka_test_app");
  const client = new pg.Client(config);
  try {
    try { await client.connect(); } catch { throw new Error("Test app connection failed; inspect credentials locally."); }
    for (const [save, input] of operations(ids, graph)) await assert.rejects(save(drizzle(client), input), rejectCode("PERSISTENCE_FAILED"));
    assert.equal(await versionOf(owner, ids), 7);
  } finally { await client.end(); }
}));

test("all thirteen tables are empty after modifier fixture cleanup", async () => {
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

