import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { verifyLanguageColumnsRemoved } from "../../scripts/lib/language-removal-protection.mjs";

// ADR-039 / migration 0016 read-only schema checks (AC-3..AC-6). Runs inside BEGIN READ ONLY and never writes.
const OWNER = "tiny_osaka_test_owner";
const APP = "tiny_osaka_test_app";
const CMS = "tiny_osaka_test_cms";
let client;

before(async () => {
  client = await connectTestOwner();
  await client.query("BEGIN READ ONLY");
});

after(async () => {
  if (client) {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});

test("AC-3: no public column named locale, alt_en or caption_en", async () => {
  const { rows } = await client.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN ('locale', 'alt_en', 'caption_en')`);
  assert.deepEqual(rows, []);
});

test("AC-3/AC-4/AC-5: shared language-removal verifier passes on the live test database", async () => {
  await verifyLanguageColumnsRemoved(client);
});

test("AC-4: primary keys of the six translation tables have the new shape without locale", async () => {
  const expected = {
    category_translations: ["revision_id", "category_id"],
    product_translations: ["revision_id", "product_id"],
    variant_translations: ["revision_id", "product_id", "variant_id"],
    modifier_group_translations: ["revision_id", "product_id", "group_id"],
    modifier_option_translations: ["revision_id", "product_id", "group_id", "option_id"],
    page_translations: ["revision_id"],
  };
  for (const [table, columns] of Object.entries(expected)) {
    const { rows } = await client.query(`SELECT a.attname AS column_name FROM pg_constraint c
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      WHERE c.conrelid = $1::regclass AND c.contype = 'p' AND c.conname = $2
      ORDER BY k.ord`, [`public.${table}`, `${table}_pk`]);
    assert.deepEqual(rows.map(row => row.column_name), columns, table);
  }
});

test("AC-4: no constraint definition mentions locale, alt_en or caption_en; media text CHECK limits only ids", async () => {
  const { rows } = await client.query(`SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace`);
  assert.deepEqual(rows.filter(row => /locale|alt_en|caption_en/.test(row.def) || /_locale$/.test(row.conname)), []);
  for (const table of ["catalog_media_refs", "page_media_refs"]) {
    const { rows: checks } = await client.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = $1::regclass AND contype = 'c' AND conname = $2`, [`public.${table}`, `${table}_text`]);
    assert.equal(checks.length, 1, table);
    const def = checks[0].def.replace(/::text/g, "").replace(/\s+/g, " ");
    assert.match(def, /length\(alt_id\)\s*<=\s*500/, table);
    assert.match(def, /length\(caption_id\)\s*<=\s*2000/, table);
    assert.doesNotMatch(def, /alt_en|caption_en/, table);
  }
});

test("AC-5: public read functions have no locale argument and the reviewed ACL", async () => {
  const { rows: fns } = await client.query(`SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
    p.prosecdef, p.proconfig, p.provolatile, pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('public_read_catalog', 'public_read_page') ORDER BY p.proname`);
  assert.deepEqual(fns.map(row => `${row.proname}(${row.args})`), ["public_read_catalog()", "public_read_page(p_key text)"]);
  for (const fn of fns) {
    assert.equal(fn.prosecdef, true, fn.proname);
    assert.deepEqual(fn.proconfig, ["search_path=pg_catalog"], fn.proname);
    assert.equal(fn.provolatile, "s", fn.proname);
    assert.equal(fn.owner, OWNER, fn.proname);
    const { rows: acl } = await client.query(`SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS role,
      x.privilege_type FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid = $1), acldefault('f', $2::regrole::oid))) x`, [fn.oid, OWNER]);
    assert.deepEqual(acl.map(row => row.role).sort(), [OWNER, APP].sort(), fn.proname);
    assert.ok(acl.every(row => row.privilege_type === "EXECUTE"), fn.proname);
  }
});

test("AC-5/AC-14: catalog_purge_product keeps Owner-only ACL and no locale filter", async () => {
  const { rows } = await client.query(`SELECT p.oid, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) AS owner,
    pg_get_function_identity_arguments(p.oid) AS args, p.prosrc FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'catalog_purge_product'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prosecdef, true);
  assert.deepEqual(rows[0].proconfig, ["search_path=pg_catalog"]);
  assert.equal(rows[0].owner, OWNER);
  assert.equal(rows[0].args, "p_product_id uuid, p_actor text");
  assert.doesNotMatch(rows[0].prosrc, /locale|alt_en|caption_en/);
  const { rows: acl } = await client.query(`SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS role
    FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid = $1), acldefault('f', $2::regrole::oid))) x`, [rows[0].oid, OWNER]);
  assert.deepEqual(acl.map(row => row.role).sort(), [OWNER, CMS].sort());
  const { rows: [app] } = await client.query("SELECT has_function_privilege($1, 'public.catalog_purge_product(uuid,text)', 'EXECUTE') AS ok", [APP]);
  assert.equal(app.ok, false);
});

test("AC-5: public read functions run without arguments and return no locale key (empty content)", async () => {
  const { rows: [catalog] } = await client.query("SELECT public.public_read_catalog() AS payload");
  assert.ok(catalog.payload === null || !JSON.stringify(catalog.payload).includes('"locale"'));
  const { rows: [page] } = await client.query("SELECT public.public_read_page('menu') AS payload");
  assert.ok(page.payload === null || !JSON.stringify(page.payload).includes('"locale"'));
});

test("AC-6: every non-internal trigger in public schema is enabled (tgenabled = 'O')", async () => {
  const { rows } = await client.query(`SELECT c.relname, t.tgname, t.tgenabled FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled <> 'O'`);
  assert.deepEqual(rows, []);
});

test("AC-6: no other session is left idle in transaction on the test database", async () => {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database() AND state LIKE 'idle in transaction%' AND pid <> pg_backend_pid()`);
  assert.equal(rows[0].n, 0);
});

test("AC-6: removed-content tables are empty after reset; retained tables are readable", async () => {
  const removed = ["category_translations", "product_translations", "variant_translations", "modifier_group_translations",
    "modifier_option_translations", "page_translations", "catalog_media_refs", "page_media_refs", "catalog_revisions",
    "page_revisions", "catalog_publication", "page_publications", "publication_jobs", "publication_events",
    "catalog_submissions", "catalog_approvals", "catalog_workflow_events", "page_submissions", "page_approvals",
    "page_workflow_events", "product_entries", "category_entries", "product_variants", "modifier_groups",
    "modifier_options", "products", "categories"];
  for (const table of removed) {
    const { rows: [row] } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
    assert.equal(row.n, 0, table);
  }
  for (const table of ["media_assets", "media_events", "pages", "catalog_deletion_log"]) {
    const { rows: [row] } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
    assert.ok(Number.isInteger(row.n), table);
  }
});
