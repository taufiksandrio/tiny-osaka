import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pricingTables, workflowTables } from "./test-migration-plan.mjs";

// Hash-pinned SQL remains the source of truth for hand-written functions.
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
    WHERE n.nspname='public' AND p.proname LIKE 'catalog_%' ORDER BY p.proname
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
