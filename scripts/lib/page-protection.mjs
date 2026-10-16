import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const pageTables = Object.freeze(["pages", "page_revisions", "page_translations", "page_submissions",
  "page_approvals", "page_publications", "page_workflow_events"].sort());
export const verifyPageProtection = async (client, owner) => {
  const source = readFileSync(new URL("../../drizzle/0004_page_content.sql", import.meta.url), "utf8");
  const expected = [...source.matchAll(/CREATE FUNCTION public\.(page_\w+)\(\) RETURNS trigger\s+LANGUAGE plpgsql SET search_path = pg_catalog AS \$\$([\s\S]*?)\$\$;/g)];
  const { rows: functions } = await client.query(`
    SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,l.lanname,pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname LIKE 'page_%'
  `);
  assert.equal(expected.length, 8);
  assert.equal(functions.length, 8);
  for (const [, name, body] of expected) {
    const fn = functions.find(row => row.proname === name);
    assert.ok(fn);
    assert.equal(fn.prosrc.replaceAll("\r\n", "\n"), body.replaceAll("\r\n", "\n"));
    assert.equal(fn.owner, owner); assert.equal(fn.prosecdef, false); assert.equal(fn.lanname, "plpgsql");
    assert.deepEqual(fn.proconfig, ["search_path=pg_catalog"]);
  }
  const wanted = [];
  const add = (table, name, fn, type = 31, deferred = false) => wanted.push({
    table, name, fn, type, deferred, initially: deferred, enabled: "O",
  });
  add("pages", "page_identity_guard", "page_guard_identity", 19);
  add("page_revisions", "page_root_guard", "page_guard_root");
  add("page_translations", "page_translation_guard", "page_guard_translation");
  for (const table of ["page_submissions", "page_approvals"]) {
    add(table, "page_receipt_guard", "page_guard_receipt");
    add(table, "page_receipt_complete", "page_check_receipt", 5, true);
  }
  add("page_publications", "page_publication_guard", "page_guard_publication");
  add("page_workflow_events", "page_event_guard", "page_guard_event");
  for (const table of pageTables) add(table, "page_no_truncate", "page_deny_truncate", 34);
  const { rows: actual } = await client.query(`
    SELECT c.relname AS table,t.tgname AS name,p.proname AS fn,t.tgtype::integer AS type,
      t.tgdeferrable AS deferred,t.tginitdeferred AS initially,t.tgenabled AS enabled
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname=ANY($1::text[])
  `, [pageTables]);
  const sort = rows => rows.sort((a, b) => (a.table + "/" + a.name).localeCompare(b.table + "/" + b.name));
  assert.deepEqual(sort(actual), sort(wanted));
};
