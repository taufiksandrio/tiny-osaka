import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { pricingTables, tablesForState } from "../../scripts/lib/test-migration-plan.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";
import { productVariants, modifierGroups, modifierOptions } from "../../src/server/db/schema.mjs";
import { calculatePrice, CatalogPricingError, validatePricingProduct } from "../../src/server/catalog/pricing.mjs";

// Test target is checked by connectTestOwner before any mutation. All fixtures
// live in a transaction that is rolled back; no persistent seed or cleanup DDL.
const withGraph = async (run) => {
  const client = await connectTestOwner();
  const ids = Object.fromEntries(["revision", "otherRevision", "category", "product", "otherProduct", "variant", "group", "otherGroup", "option"]
    .map(key => [key, randomUUID()]));
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO catalog_revisions(id) VALUES ($1),($2)", [ids.revision, ids.otherRevision]);
    await client.query("INSERT INTO categories(id,slug) VALUES ($1,$2)", [ids.category, `qa-${ids.category}`]);
    for (const product of [ids.product, ids.otherProduct]) {
      await client.query("INSERT INTO products(id,slug) VALUES ($1,$2)", [product, `qa-${product}`]);
    }
    for (const revision of [ids.revision, ids.otherRevision]) {
      await client.query("INSERT INTO category_entries(revision_id,category_id) VALUES ($1,$2)", [revision, ids.category]);
      for (const product of [ids.product, ids.otherProduct]) {
        await client.query("INSERT INTO product_entries(revision_id,product_id,category_id) VALUES ($1,$2,$3)", [revision, product, ids.category]);
      }
    }
    await client.query("INSERT INTO product_variants(revision_id,product_id,id,code,base_price) VALUES ($1,$2,$3,'standard',250000)", [ids.revision, ids.product, ids.variant]);
    await client.query(`INSERT INTO modifier_groups(revision_id,product_id,id,code,selection_type,min_selections,max_selections)
      VALUES ($1,$2,$3,'toppings','single',0,1),($1,$2,$4,'other','multiple',0,0)`, [ids.revision, ids.product, ids.group, ids.otherGroup]);
    await client.query("INSERT INTO modifier_options(revision_id,product_id,group_id,id,code,price_delta) VALUES ($1,$2,$3,$4,'qa-option',150000)",
      [ids.revision, ids.product, ids.group, ids.option]);
    await client.query("INSERT INTO variant_translations(revision_id,product_id,variant_id,title) VALUES ($1,$2,$3,'QA variant only')", [ids.revision, ids.product, ids.variant]);
    await client.query("INSERT INTO modifier_group_translations(revision_id,product_id,group_id,title) VALUES ($1,$2,$3,'QA group only')", [ids.revision, ids.product, ids.group]);
    await client.query("INSERT INTO modifier_option_translations(revision_id,product_id,group_id,option_id,title) VALUES ($1,$2,$3,$4,'QA option only')", [ids.revision, ids.product, ids.group, ids.option]);
    await run(client, ids);
  } finally {
    try {
      await client.query("ROLLBACK");
      for (const table of pricingTables.filter(name => !["categories", "products"].includes(name))) {
        const column = table === "catalog_revisions" ? "id" : "revision_id";
        const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM public.${table} WHERE ${column} IN ($1,$2)`, [ids.revision, ids.otherRevision]);
        assert.equal(row.count, 0, "Synthetic revision rows must not persist.");
      }
      for (const [table, values] of [["categories", [ids.category]], ["products", [ids.product, ids.otherProduct]]]) {
        const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM public.${table} WHERE id = ANY($1::uuid[])`, [values]);
        assert.equal(row.count, 0, "Synthetic identity rows must not persist.");
      }
    } finally { await client.end(); }
  }
};

const reject = async (client, sql, params, code, constraint) => {
  await client.query("SAVEPOINT expected_rejection");
  let actual;
  try { await client.query(sql, params); } catch (error) {
    actual = { code: error.code, constraint: error.constraint };
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
    await client.query("RELEASE SAVEPOINT expected_rejection");
  }
  assert.equal(actual?.code, code, "Expected PostgreSQL rejection.");
  if (constraint) assert.equal(actual.constraint, constraint);
};

const loadProduct = async (client, ids) => {
  const db = drizzle(client);
  const inScope = table => and(eq(table.revisionId, ids.revision), eq(table.productId, ids.product));
  const variants = await db.select().from(productVariants).where(inScope(productVariants));
  const groups = await db.select().from(modifierGroups).where(inScope(modifierGroups));
  const options = await db.select().from(modifierOptions).where(inScope(modifierOptions));
  return { revisionId: ids.revision, productId: ids.product, variants,
    groups: groups.map(group => ({ ...group, options: options.filter(option => option.groupId === group.id) })) };
};

test("persists pricing rows and maps bigint to exact Drizzle numbers above 100000", () => withGraph(async (client, ids) => {
  const product = await loadProduct(client, ids);
  assert.equal(typeof product.variants[0].basePrice, "number");
  assert.equal(product.variants[0].basePrice, 250000);
  assert.equal(product.variants[0].sortOrder, 0);
  assert.equal(calculatePrice(product, { revisionId: ids.revision, productId: ids.product, optionIds: [ids.option] }), 400000);
  for (const table of ["variant_translations", "modifier_group_translations", "modifier_option_translations"]) {
    const { rows } = await client.query(`SELECT description FROM ${table} WHERE revision_id=$1`, [ids.revision]);
    assert.equal(rows.length, 1);
    assert.ok(rows.every(row => row.description === ""));
  }
}));

test("safe integer boundary is exact through DB/Drizzle and final sum overflow is rejected", () => withGraph(async (client, ids) => {
  await client.query("UPDATE product_variants SET base_price=$1 WHERE revision_id=$2", [String(Number.MAX_SAFE_INTEGER - 150000), ids.revision]);
  const selection = { revisionId: ids.revision, productId: ids.product, optionIds: [ids.option] };
  assert.equal(calculatePrice(await loadProduct(client, ids), selection), Number.MAX_SAFE_INTEGER);
  await client.query("UPDATE product_variants SET base_price=$1 WHERE revision_id=$2", [String(Number.MAX_SAFE_INTEGER), ids.revision]);
  const product = await loadProduct(client, ids);
  assert.equal(product.variants[0].basePrice, Number.MAX_SAFE_INTEGER);
  assert.throws(() => calculatePrice(product, selection), CatalogPricingError);
  await client.query("UPDATE product_variants SET base_price=0 WHERE revision_id=$1", [ids.revision]);
  await client.query("UPDATE modifier_options SET price_delta=0 WHERE revision_id=$1", [ids.revision]);
  assert.equal(calculatePrice(await loadProduct(client, ids), selection), 0);
}));

test("PostgreSQL rejects negative and technically unsafe base/delta values", () => withGraph(async (client, ids) => {
  for (const [table, column, constraint] of [["product_variants", "base_price", "product_variants_price_safe"],
    ["modifier_options", "price_delta", "modifier_options_price_safe"]]) {
    for (const value of ["-1", "9007199254740992"]) {
      await reject(client, `UPDATE ${table} SET ${column}=$1 WHERE revision_id=$2`, [value, ids.revision], "23514", constraint);
    }
  }
}));

test("rejects duplicate variant/group/option codes, keys and ambiguous option IDs", () => withGraph(async (client, ids) => {
  await reject(client, "INSERT INTO product_variants(revision_id,product_id,code,base_price) VALUES ($1,$2,'standard',1)", [ids.revision, ids.product], "23505", "product_variants_code_unique");
  await reject(client, "INSERT INTO product_variants(revision_id,product_id,id,code,base_price) VALUES ($1,$2,$3,'different',1)", [ids.revision, ids.product, ids.variant], "23505", "product_variants_pk");
  await reject(client, "INSERT INTO modifier_groups(revision_id,product_id,code,selection_type,min_selections,max_selections) VALUES ($1,$2,'toppings','single',0,1)", [ids.revision, ids.product], "23505", "modifier_groups_code_unique");
  await reject(client, "INSERT INTO modifier_groups(revision_id,product_id,id,code,selection_type,min_selections,max_selections) VALUES ($1,$2,$3,'different','single',0,1)", [ids.revision, ids.product, ids.group], "23505", "modifier_groups_pk");
  await reject(client, "INSERT INTO modifier_options(revision_id,product_id,group_id,code,price_delta) VALUES ($1,$2,$3,'qa-option',1)", [ids.revision, ids.product, ids.group], "23505", "modifier_options_code_unique");
  await reject(client, "INSERT INTO modifier_options(revision_id,product_id,group_id,id,code,price_delta) VALUES ($1,$2,$3,$4,'different',1)", [ids.revision, ids.product, ids.otherGroup, ids.option], "23505", "modifier_options_id_unique");
}));

test("rejects invalid group limits/types, malformed codes and negative sort positions", () => withGraph(async (client, ids) => {
  for (const [change, constraint] of [
    ["min_selections=-1", "modifier_groups_selection_range"],
    ["min_selections=2,max_selections=1", "modifier_groups_selection_range"],
    ["max_selections=2", "modifier_groups_single_limit"],
    ["selection_type='other'", "modifier_groups_selection_type"],
  ]) await reject(client, `UPDATE modifier_groups SET ${change} WHERE id=$1`, [ids.group], "23514", constraint);
  for (const table of ["product_variants", "modifier_groups", "modifier_options"]) {
    await reject(client, `UPDATE ${table} SET code='Invalid Code' WHERE revision_id=$1`, [ids.revision], "23514", `${table}_code_format`);
    await reject(client, `UPDATE ${table} SET sort_order=-1 WHERE revision_id=$1`, [ids.revision], "23514", `${table}_sort_nonnegative`);
  }
}));

test("incomplete drafts may persist but pricing readiness rejects insufficient options", () => withGraph(async (client, ids) => {
  await client.query("UPDATE modifier_groups SET selection_type='multiple',min_selections=2,max_selections=2 WHERE id=$1", [ids.group]);
  // The cross-row rule belongs to the service, not an SQL CHECK.
  const awaitedProduct = await loadProduct(client, ids);
  assert.throws(() => validatePricingProduct(awaitedProduct), CatalogPricingError);
}));

test("translation title/uniqueness rules apply to all three new entities", () => withGraph(async (client, ids) => {
  for (const table of ["variant_translations", "modifier_group_translations", "modifier_option_translations"]) {
    await reject(client, `UPDATE ${table} SET title='   ' WHERE revision_id=$1`, [ids.revision], "23514", `${table}_title_nonempty`);
    await reject(client, `INSERT INTO ${table} SELECT * FROM ${table} WHERE revision_id=$1`, [ids.revision], "23505", `${table}_pk`);
  }
}));

test("composite FKs reject orphaned and cross-product/revision/group references", () => withGraph(async (client, ids) => {
  await reject(client, "INSERT INTO product_variants(revision_id,product_id,code,base_price) VALUES ($1,$2,'orphan',1)", [randomUUID(), ids.product], "23503", "product_variants_entry_fk");
  await reject(client, "INSERT INTO modifier_groups(revision_id,product_id,code,selection_type,min_selections,max_selections) VALUES ($1,$2,'orphan','single',0,1)", [ids.revision, randomUUID()], "23503", "modifier_groups_entry_fk");
  for (const [column, value] of [["revision_id", ids.otherRevision], ["product_id", ids.otherProduct]]) {
    await reject(client, `UPDATE variant_translations SET ${column}=$1 WHERE revision_id=$2`, [value, ids.revision], "23503", "variant_translations_variant_fk");
    await reject(client, `UPDATE modifier_group_translations SET ${column}=$1 WHERE revision_id=$2`, [value, ids.revision], "23503", "modifier_group_translations_group_fk");
    await reject(client, `INSERT INTO modifier_options(revision_id,product_id,group_id,code,price_delta) VALUES ($1,$2,$3,'orphan',1)`,
      [column === "revision_id" ? value : ids.revision, column === "product_id" ? value : ids.product, ids.group], "23503", "modifier_options_group_fk");
    await reject(client, `UPDATE modifier_option_translations SET ${column}=$1 WHERE revision_id=$2`, [value, ids.revision], "23503", "modifier_option_translations_option_fk");
  }
  await reject(client, "UPDATE modifier_option_translations SET group_id=$1 WHERE revision_id=$2", [ids.otherGroup, ids.revision], "23503", "modifier_option_translations_option_fk");
}));

test("new foreign keys RESTRICT deleting or changing referenced parent identities", () => withGraph(async (client, ids) => {
  for (const [table, id] of [["product_variants", ids.variant], ["modifier_groups", ids.group], ["modifier_options", ids.option]]) {
    await reject(client, `DELETE FROM ${table} WHERE id=$1`, [id], "23001");
    await reject(client, `UPDATE ${table} SET id=$1 WHERE id=$2`, [randomUUID(), id], "23001");
  }
  await reject(client, "DELETE FROM product_entries WHERE revision_id=$1 AND product_id=$2", [ids.revision, ids.product], "23001");
}));

test("runtime application cannot read or write any new draft pricing table", async () => {
  const config = getDatabaseConfig(process.env, "test");
  assert.equal(new URL(config.connectionString).username, "tiny_osaka_test_app");
  const client = new pg.Client(config);
  try {
    try { await client.connect(); } catch { throw new Error("Test app connection failed; inspect credentials locally."); }
    await client.query("BEGIN");
    for (const table of pricingTables.filter(name => !["catalog_revisions", "categories", "category_entries", "category_translations", "products", "product_entries", "product_translations"].includes(name))) {
      await reject(client, `SELECT * FROM public.${table}`, [], "42501");
      await reject(client, `DELETE FROM public.${table} WHERE false`, [], "42501");
      const { rows: [access] } = await client.query("SELECT has_table_privilege(session_user,$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed", [`public.${table}`]);
      assert.equal(access.allowed, false);
    }
  } finally {
    try { await client.query("ROLLBACK"); } finally { await client.end(); }
  }
});

test("all thirty tables remain empty, owner-owned, with thirty-three RESTRICT FKs", async () => {
  const client = await connectTestOwner();
  try {
    for (const table of pricingTables) {
      const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM public.${table}`);
      assert.equal(row.count, 0);
    }
    const { rows: tables } = await client.query("SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname");
    const { rows: [applied] } = await client.query("SELECT count(*)::integer AS total FROM drizzle.__drizzle_migrations");
    assert.deepEqual(tables.map(row => row.name), tablesForState(applied.total));
    assert.ok(tables.every(row => row.owner === "tiny_osaka_test_owner"));
    const { rows: fks } = await client.query("SELECT confupdtype,confdeltype FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype='f'");
    assert.equal(fks.length, 33);
    assert.ok(fks.every(row => row.confupdtype === "r" && row.confdeltype === "r"));
  } finally { await client.end(); }
});
