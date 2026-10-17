import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";

// Each test creates synthetic records inside a transaction, then rolls back.
const withGraph = async (run) => {
  const client = await connectTestOwner();
  const ids = { revision: randomUUID(), otherRevision: randomUUID(), category: randomUUID(), product: randomUUID() };
  const slug = `qa-${randomUUID()}`;
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO catalog_revisions(id) VALUES ($1),($2)", [ids.revision, ids.otherRevision]);
    await client.query("INSERT INTO categories(id,slug) VALUES ($1,$2)", [ids.category, slug]);
    await client.query("INSERT INTO products(id,slug) VALUES ($1,$2)", [ids.product, slug]);
    await client.query("INSERT INTO category_entries(revision_id,category_id) VALUES ($1,$2)", [ids.revision, ids.category]);
    await client.query("INSERT INTO product_entries(revision_id,product_id,category_id) VALUES ($1,$2,$3)", [ids.revision, ids.product, ids.category]);
    for (const locale of ["id", "en"]) {
      await client.query("INSERT INTO category_translations(revision_id,category_id,locale,title) VALUES ($1,$2,$3,'QA category only')", [ids.revision, ids.category, locale]);
      await client.query("INSERT INTO product_translations(revision_id,product_id,locale,title) VALUES ($1,$2,$3,'QA product only')", [ids.revision, ids.product, locale]);
    }
    await run(client, ids, slug);
  } finally {
    try {
      await client.query("ROLLBACK");
      const { rows: [remaining] } = await client.query(`
        SELECT (SELECT count(*) FROM catalog_revisions WHERE id IN ($1,$2)) +
          (SELECT count(*) FROM categories WHERE id = $3) +
          (SELECT count(*) FROM products WHERE id = $4) AS count
      `, [ids.revision, ids.otherRevision, ids.category, ids.product]);
      assert.equal(Number(remaining.count), 0, "Test records must not persist.");
    } finally {
      await client.end();
    }
  }
};

const reject = async (client, statement, params, code, constraint) => {
  await client.query("SAVEPOINT expected_rejection");
  let actual;
  try {
    await client.query(statement, params);
  } catch (error) {
    actual = { code: error.code, constraint: error.constraint };
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
    await client.query("RELEASE SAVEPOINT expected_rejection");
  }
  assert.equal(actual?.code, code, "Expected PostgreSQL constraint/permission rejection.");
  if (constraint) assert.equal(actual.constraint, constraint);
};

test("accepts a valid bilingual draft graph with expected defaults", () => withGraph(async (client, ids) => {
  const { rows: [revision] } = await client.query("SELECT status,version,created_at FROM catalog_revisions WHERE id=$1", [ids.revision]);
  assert.equal(revision.status, "draft");
  assert.equal(revision.version, 1);
  assert.ok(revision.created_at instanceof Date);
  const { rows } = await client.query(`SELECT t.locale,t.title,t.description FROM product_entries p
    JOIN category_entries c ON c.revision_id=p.revision_id AND c.category_id=p.category_id
    JOIN product_translations t ON t.revision_id=p.revision_id AND t.product_id=p.product_id
    WHERE p.revision_id=$1 ORDER BY t.locale`, [ids.revision]);
  assert.deepEqual(rows.map(row => row.locale), ["en", "id"]);
  assert.ok(rows.every(row => row.title === "QA product only" && row.description === ""));
}));

test("rejects duplicate identities/entries/translations", () => withGraph(async (client, ids, slug) => {
  for (const table of ["categories", "products"]) {
    await reject(client, `INSERT INTO ${table}(slug) VALUES ($1)`, [slug], "23505", `${table}_slug_unique`);
  }
  await reject(client, "INSERT INTO category_entries(revision_id,category_id) VALUES ($1,$2)", [ids.revision, ids.category], "23505", "category_entries_pk");
  await reject(client, "INSERT INTO product_entries(revision_id,product_id,category_id) VALUES ($1,$2,$3)", [ids.revision, ids.product, ids.category], "23505", "product_entries_pk");
  await reject(client, "INSERT INTO product_translations(revision_id,product_id,locale,title) VALUES ($1,$2,'id','QA duplicate')", [ids.revision, ids.product], "23505", "product_translations_pk");
}));

test("rejects invalid locale and blank localized names", () => withGraph(async (client, ids) => {
  for (const [table, key, id] of [
    ["category_translations", "category_id", ids.category], ["product_translations", "product_id", ids.product],
  ]) {
    await reject(client, `INSERT INTO ${table}(revision_id,${key},locale,title) VALUES ($1,$2,'jp','QA only')`, [ids.revision, id], "23514", `${table}_locale`);
    await reject(client, `UPDATE ${table} SET title='   ' WHERE revision_id=$1 AND ${key}=$2 AND locale='id'`, [ids.revision, id], "23514", `${table}_title_nonempty`);
  }
}));

test("rejects orphaned and cross-revision relationships", () => withGraph(async (client, ids) => {
  await reject(client, "INSERT INTO category_entries(revision_id,category_id) VALUES ($1,$2)", [ids.revision, randomUUID()], "23503", "category_entries_category_id_categories_id_fk");
  await reject(client, "INSERT INTO product_entries(revision_id,product_id,category_id) VALUES ($1,$2,$3)", [ids.otherRevision, ids.product, ids.category], "23503", "product_entries_category_in_revision_fk");
  await reject(client, "INSERT INTO product_translations(revision_id,product_id,locale,title) VALUES ($1,$2,'id','QA only')", [ids.otherRevision, ids.product], "23503", "product_translations_entry_fk");
  await reject(client, "INSERT INTO category_translations(revision_id,category_id,locale,title) VALUES ($1,$2,'id','QA only')", [ids.otherRevision, ids.category], "23503", "category_translations_entry_fk");
}));

test("rejects unsafe ranges/status and malformed slugs", () => withGraph(async (client, ids) => {
  await reject(client, "UPDATE catalog_revisions SET version=0 WHERE id=$1", [ids.revision], "23514", "catalog_revisions_version_positive");
  await reject(client, "UPDATE catalog_revisions SET status='published' WHERE id=$1", [ids.revision], "23514");
  await reject(client, "UPDATE category_entries SET sort_order=-1 WHERE revision_id=$1", [ids.revision], "23514", "category_entries_sort_nonnegative");
  await reject(client, "UPDATE product_entries SET sort_order=-1 WHERE revision_id=$1", [ids.revision], "23514", "product_entries_sort_nonnegative");
  for (const table of ["categories", "products"]) {
    await reject(client, `INSERT INTO ${table}(slug) VALUES ('Invalid Slug')`, [], "23514", `${table}_slug_format`);
  }
}));

test("restricts deletion of referenced parent rows", () => withGraph(async (client, ids) => {
  await reject(client, "DELETE FROM catalog_revisions WHERE id=$1", [ids.revision], "23001");
  await reject(client, "DELETE FROM categories WHERE id=$1", [ids.category], "23001");
  await reject(client, "DELETE FROM products WHERE id=$1", [ids.product], "23001");
  await reject(client, "DELETE FROM product_entries WHERE revision_id=$1", [ids.revision], "23001", "product_translations_entry_fk");
}));

test("application login cannot assume owner, create tables or read draft data", async () => {
  const config = getDatabaseConfig(process.env, "test");
  assert.equal(new URL(config.connectionString).username, "tiny_osaka_test_app");
  const client = new pg.Client(config);
  try {
    try { await client.connect(); } catch { throw new Error("Test application login failed; inspect credentials locally."); }
    await client.query("BEGIN");
    await reject(client, "SET ROLE tiny_osaka_test_owner", [], "42501");
    await reject(client, "CREATE TABLE public.qa_forbidden_table(id integer)", [], "42501");
    await reject(client, "SELECT * FROM public.products", [], "42501");
  } finally {
    try { await client.query("ROLLBACK"); } finally { await client.end(); }
  }
});

test("catalog has no persistent test fixtures and all tables have the NOLOGIN owner", async () => {
  const client = await connectTestOwner();
  try {
    const tables = ["catalog_revisions", "categories", "category_entries", "category_translations", "products", "product_entries", "product_translations",
      "product_variants", "variant_translations", "modifier_groups", "modifier_group_translations", "modifier_options", "modifier_option_translations"];
    for (const table of tables) {
      const { rows: [count] } = await client.query(`SELECT count(*)::integer AS count FROM public.${table}`);
      assert.equal(count.count, 0, "Synthetic catalog records must be rolled back.");
    }
    const { rows } = await client.query(`SELECT pg_get_userbyid(c.relowner) AS owner FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`);
    assert.equal(rows.length, 30);
    assert.ok(rows.every(row => row.owner === "tiny_osaka_test_owner"));
  } finally { await client.end(); }
});
