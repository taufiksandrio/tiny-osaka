import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pricingTables, workflowTables } from "./test-migration-plan.mjs";

// Hash-pinned SQL remains the source of truth for hand-written functions.
// ADR-037 objects (migration 0014). The purge function is the only guard bypass.
const verifyDeletionObjects = async (client, owner) => {
  const cms = owner.replace("_owner", "_cms"), app = owner.replace("_owner", "_app");
  const { rows } = await client.query(`SELECT p.oid,p.prosecdef,p.proconfig,p.proowner::regrole::text AS owner,
    pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='catalog_purge_product'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prosecdef, true); assert.equal(rows[0].owner, owner);
  assert.deepEqual(rows[0].proconfig, ["search_path=pg_catalog"]);
  assert.equal(rows[0].args, "p_product_id uuid, p_actor text");
  const { rows: acl } = await client.query(`SELECT CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS role,
    x.privilege_type FROM pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x WHERE p.oid=$1`, [rows[0].oid]);
  assert.deepEqual(acl.map(row => row.role).sort(), [owner, cms].sort());
  assert.ok(acl.every(row => row.privilege_type === "EXECUTE"));
  assert.equal((await client.query("SELECT has_function_privilege($1,'public.catalog_purge_product(uuid,text)','EXECUTE') AS ok", [app])).rows[0].ok, false);
  const { rows: triggers } = await client.query(`SELECT t.tgname,t.tgenabled FROM pg_trigger t WHERE t.tgrelid='public.catalog_deletion_log'::regclass
    AND NOT t.tgisinternal ORDER BY t.tgname`);
  assert.deepEqual(triggers.map(row => row.tgname), ["catalog_deletion_log_guard", "catalog_no_truncate"]);
  assert.ok(triggers.every(row => row.tgenabled === "O"));
};

// Migration 0015: three nullable text columns with https/length CHECKs on product_entries (no new table or trigger).
const verifyOrderLinkColumns = async client => {
  const names = ["grabfood_url", "gofood_url", "shopeefood_url"];
  const { rows: columns } = await client.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_entries' AND column_name = ANY($1::text[]) ORDER BY column_name`, [names]);
  assert.deepEqual(columns.map(row => row.column_name), [...names].sort());
  assert.ok(columns.every(row => row.data_type === "text" && row.is_nullable === "YES" && row.column_default === null));
  const wanted = names.map(name => `product_entries_${name}_check`);
  const { rows: checks } = await client.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid='public.product_entries'::regclass AND contype='c' AND conname = ANY($1::text[]) ORDER BY conname`, [wanted]);
  assert.deepEqual(checks.map(row => row.conname), [...wanted].sort());
  for (const row of checks) assert.ok(row.def.includes("https://") && row.def.includes("2048"));
};

export const verifyCatalogProtection = async (client, owner, state = 4) => {
  const source = readFileSync(new URL("../../drizzle/0002_catalog_publication.sql", import.meta.url), "utf8");
  const expected = [...source.matchAll(/CREATE FUNCTION public\.(catalog_\w+)\(\) RETURNS trigger\s+LANGUAGE plpgsql SET search_path = pg_catalog AS \$\$([\s\S]*?)\$\$;/g)];
  if (state >= 4) {
    const correction = readFileSync(new URL("../../drizzle/0003_catalog_receipt_check.sql", import.meta.url), "utf8");
    expected.find(row => row[1] === "catalog_check_receipt")[2] =
      correction.match(/AS \$\$([\s\S]*?)\$\$;/)[1];
  }
  const { rows: functions } = await client.query(`
    SELECT p.proname, p.prosrc, p.prosecdef, p.proconfig, l.lanname,
      pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname LIKE 'catalog_%'
      AND p.proname NOT IN ('catalog_purge_product','catalog_guard_deletion_log') ORDER BY p.proname
  `);
  assert.equal(expected.length, 8);
  assert.equal(functions.length, expected.length);
  for (const [, name, body] of expected) {
    const fn = functions.find(row => row.proname === name);
    assert.ok(fn);
    assert.equal(fn.prosrc.replaceAll("\r\n", "\n"), body.replaceAll("\r\n", "\n"));
    assert.equal(fn.owner, owner);
    assert.equal(fn.prosecdef, false);
    assert.equal(fn.lanname, "plpgsql");
    assert.deepEqual(fn.proconfig, ["search_path=pg_catalog"]);
  }
  if (state >= 15) await verifyDeletionObjects(client, owner);
  if (state >= 16) await verifyOrderLinkColumns(client);
  const wanted = [];
  const add = (table, name, fn, type = 31, deferred = false) => wanted.push({
    table, name, fn, type, deferred, initially: deferred, enabled: "O",
  });
  add("catalog_revisions", "catalog_root_guard", "catalog_guard_root");
  for (const table of pricingTables.filter(name => !["catalog_revisions", "categories", "products"].includes(name))) {
    add(table, "catalog_child_guard", "catalog_guard_child");
  }
  for (const table of ["categories", "products"]) add(table, "catalog_identity_guard", "catalog_guard_identity", 27);
  for (const table of ["catalog_submissions", "catalog_approvals"]) {
    add(table, "catalog_receipt_guard", "catalog_guard_receipt");
    add(table, "catalog_receipt_complete", "catalog_check_receipt", 5, true);
  }
  add("catalog_publication", "catalog_publication_guard", "catalog_guard_publication");
  add("catalog_workflow_events", "catalog_event_guard", "catalog_guard_event");
  for (const table of workflowTables) add(table, "catalog_no_truncate", "catalog_deny_truncate", 34);
  const { rows: actual } = await client.query(`
    SELECT c.relname AS table, t.tgname AS name, p.proname AS fn, t.tgtype::integer AS type,
      t.tgdeferrable AS deferred, t.tginitdeferred AS initially, t.tgenabled AS enabled
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname=ANY($1::text[])
  `, [workflowTables]);
  const sort = rows => rows.sort((a, b) => (a.table + "/" + a.name).localeCompare(b.table + "/" + b.name));
  assert.deepEqual(sort(actual), sort(wanted));
};
