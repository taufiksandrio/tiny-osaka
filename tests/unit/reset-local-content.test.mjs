import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { allTables } from "../../scripts/lib/test-migration-plan.mjs";
import { applyDropLanguageMigration, assertResetRequested, assertResetStart, CONFIRM_ENV, ContentResetError,
  resetLocalContent, resetTables, retainedTables } from "../../scripts/lib/reset-local-content.mjs";

const mockClient = ({ owner = "tiny_osaka_test_owner", database = "tiny_osaka_test", host = "127.0.0.1", rows = 2, badTriggers = "0" } = {}) => {
  const log = [];
  return { host, log, query: async sql => {
    log.push(sql);
    if (sql.includes("current_user AS owner")) return { rows: [{ owner, database }] };
    if (sql.includes("tgenabled <> 'O'")) return { rows: [{ count: badTriggers }] };
    if (sql.startsWith("SELECT count(*)")) return { rows: [{ count: String(sql.includes("FROM public.publication_events") ? rows : 1) }] };
    return { rows: [] };
  } };
};
const deletes = log => log.filter(sql => sql.startsWith("DELETE FROM")).map(sql => sql.replace("DELETE FROM public.", ""));

test("reset inventory is exactly the reviewed tables minus media, media events and page identities", () => {
  assert.deepEqual([...resetTables].sort(), allTables.filter(name => !["media_assets", "media_events", "pages"].includes(name)).sort());
  assert.deepEqual([...retainedTables].sort(), ["catalog_deletion_log", "media_assets", "media_events", "pages"]);
  assert.equal(new Set(resetTables).size, resetTables.length);
});

test("delete order removes every child before its parent (RESTRICT foreign keys)", () => {
  const childFirst = [["publication_events", "publication_jobs"], ["publication_jobs", "catalog_revisions"], ["publication_jobs", "page_revisions"],
    ["catalog_publication", "catalog_approvals"], ["page_publications", "page_approvals"], ["catalog_approvals", "catalog_submissions"],
    ["page_approvals", "page_submissions"], ["catalog_submissions", "catalog_revisions"], ["page_submissions", "page_revisions"],
    ["catalog_workflow_events", "catalog_revisions"], ["page_workflow_events", "page_revisions"],
    ["modifier_option_translations", "modifier_options"], ["modifier_options", "modifier_groups"], ["modifier_group_translations", "modifier_groups"],
    ["modifier_groups", "product_entries"], ["variant_translations", "product_variants"], ["product_variants", "product_entries"],
    ["catalog_media_refs", "product_entries"], ["page_media_refs", "page_revisions"], ["product_translations", "product_entries"],
    ["product_entries", "category_entries"], ["product_entries", "products"], ["category_translations", "category_entries"],
    ["category_entries", "categories"], ["category_entries", "catalog_revisions"], ["page_translations", "page_revisions"],
    ["catalog_publication", "catalog_revisions"], ["page_publications", "page_revisions"]];
  for (const [child, parent] of childFirst) assert.ok(resetTables.indexOf(child) < resetTables.indexOf(parent), `${child} before ${parent}`);
});

test("confirmation variable and start state are mandatory", () => {
  assert.throws(() => assertResetRequested({}), ContentResetError);
  assert.throws(() => assertResetRequested({ [CONFIRM_ENV]: "yes" }), ContentResetError);
  assert.doesNotThrow(() => assertResetRequested({ [CONFIRM_ENV]: "0016" }));
  for (const state of [12, 13, 14, 15, 17]) assert.throws(() => assertResetStart(state), ContentResetError);
  assert.doesNotThrow(() => assertResetStart(16));
});

test("reset disables guards, deletes in order, re-enables guards and checks them", async () => {
  const client = mockClient();
  await resetLocalContent(client, { owner: "tiny_osaka_test_owner", checkState: async () => 16 });
  assert.deepEqual(deletes(client.log), [...resetTables]);
  const firstDelete = client.log.findIndex(sql => sql.startsWith("DELETE")), lastDelete = client.log.findLastIndex(sql => sql.startsWith("DELETE"));
  assert.equal(client.log.slice(0, firstDelete).filter(sql => sql.includes("DISABLE TRIGGER USER")).length, resetTables.length);
  assert.equal(client.log.slice(lastDelete).filter(sql => sql.includes("ENABLE TRIGGER USER")).length, resetTables.length);
  assert.ok(client.log.some(sql => sql.includes("LOCK TABLE") && sql.includes("ACCESS EXCLUSIVE")));
  assert.ok(!client.log.some(sql => /TRUNCATE/i.test(sql)));
});

test("reset refuses a wrong state, role, database or non-loopback host before deleting anything", async () => {
  for (const [client, state] of [[mockClient(), 17], [mockClient({ owner: "postgres" }), 16], [mockClient({ database: "tiny_osaka_dev" }), 16],
    [mockClient({ host: "db.example.com" }), 16], [mockClient({ owner: "tiny_osaka_dev_owner" }), 16]]) {
    await assert.rejects(resetLocalContent(client, { owner: "tiny_osaka_test_owner", checkState: async () => state }), ContentResetError);
    assert.deepEqual(deletes(client.log), []);
  }
});

test("a guard left disabled fails the reset", async () => {
  await assert.rejects(resetLocalContent(mockClient({ badTriggers: "2" }), { owner: "tiny_osaka_test_owner", checkState: async () => 16 }), ContentResetError);
});

test("without the confirmation variable the runner prints counts and stops before BEGIN", async () => {
  const client = mockClient(), out = [];
  await assert.rejects(applyDropLanguageMigration({ client, files: [], initialState: 16, env: {}, owner: "tiny_osaka_test_owner",
    checkHistory: async () => 16, label: "test", log: line => out.push(line) }), ContentResetError);
  assert.ok(!client.log.includes("BEGIN"));
  assert.ok(out[0].includes("publication_events=2") && out[0].includes("Rows to delete"));
  assert.deepEqual(deletes(client.log), []);
});

test("a failing final verification rolls the whole transaction back", async () => {
  const client = mockClient(), files = [{ sql: ["SELECT 1"], hash: "h", folderMillis: 1 }];
  let calls = 0;
  const checkHistory = async () => (calls++ < 1 ? 16 : 16); // the post-migration state never reaches 17
  await assert.rejects(applyDropLanguageMigration({ client, files: [...Array(16).fill(null), ...files], initialState: 16,
    env: { [CONFIRM_ENV]: "0016" }, owner: "tiny_osaka_test_owner", checkHistory, label: "test", log: () => {} }), ContentResetError);
  assert.ok(client.log.includes("BEGIN") && client.log.includes("ROLLBACK") && !client.log.includes("COMMIT"));
});

test("migration 0016 is structural only and refuses a database that holds content", () => {
  const file = readMigrationFiles({ migrationsFolder: "drizzle" })[16];
  const sql = file.sql.join("\n");
  // The purge function body (replaced, not run) legitimately deletes; everything before it must not.
  const executed = sql.slice(0, sql.indexOf("CREATE OR REPLACE FUNCTION public.catalog_purge_product"));
  assert.ok(executed.length > 1000 && !/\b(DELETE|TRUNCATE|UPDATE|INSERT)\b/i.test(executed));
  assert.ok(/RAISE EXCEPTION 'Refusing structural change/.test(file.sql[0]));
  const source = readFileSync("drizzle/0016_drop_language_columns.sql", "utf8");
  const functions = [...source.matchAll(/CREATE FUNCTION public\.(public_read_\w+)\(([^)]*)\) RETURNS jsonb\s+LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS \$\$([\s\S]*?)\$\$;/g)];
  assert.deepEqual(functions.map(row => `${row[1]}(${row[2]})`), ["public_read_catalog()", "public_read_page(p_key text)"]);
});

test("migration 0017 replaces only public_read_catalog, adds exactly the three link keys and widens no grant", () => {
  const source = readFileSync("drizzle/0017_public_read_order_links.sql", "utf8");
  const code = source.split("\n").filter(line => !line.startsWith("--")).join("\n");
  assert.equal([...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(row => row[1]).join(), "public_read_catalog");
  assert.ok(!/\b(DELETE|TRUNCATE|UPDATE|INSERT|ALTER|DROP|GRANT|REVOKE)\b/i.test(code), "function-only change");
  const added = [...code.matchAll(/'(\w+Url)',e\.(\w+)/g)].map(row => `${row[1]}=${row[2]}`);
  assert.deepEqual(added, ["grabfoodUrl=grabfood_url", "gofoodUrl=gofood_url", "shopeefoodUrl=shopeefood_url"]);
  const previous = readFileSync("drizzle/0016_drop_language_columns.sql", "utf8").match(/CREATE FUNCTION public\.public_read_catalog\(\)[\s\S]*?\$\$;/)[0];
  const stripped = code.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/)[0]
    .replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION").replace(/,'grabfoodUrl',e\.grabfood_url,'gofoodUrl',e\.gofood_url,'shopeefoodUrl',e\.shopeefood_url/, "");
  assert.equal(stripped.replaceAll("\r\n", "\n"), previous.replaceAll("\r\n", "\n"), "0017 differs from 0016 only by the three link keys");
});
