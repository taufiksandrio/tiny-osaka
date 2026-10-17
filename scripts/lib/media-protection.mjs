import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const mediaTables = Object.freeze(["media_assets", "media_events", "catalog_media_refs", "page_media_refs"].sort());
export const verifyMediaProtection = async (client, owner, { posterRead = true } = {}) => {
  const source = readFileSync(new URL("../../drizzle/0005_media_references.sql", import.meta.url), "utf8");
  const expected = [...source.matchAll(/CREATE FUNCTION public\.(media_\w+)\(\) RETURNS trigger\s+LANGUAGE plpgsql SET search_path = pg_catalog AS \$\$([\s\S]*?)\$\$;/g)];
  if (posterRead) {
    const replacement = readFileSync(new URL("../../drizzle/0011_media_poster_read.sql", import.meta.url), "utf8");
    const body = /AS \$\$([\s\S]*?)\$\$;/.exec(replacement)[1];
    expected.find(([, name]) => name === "media_guard_asset")[2] = body;
  }
  const { rows: functions } = await client.query(`
    SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,l.lanname,pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname LIKE 'media_%'
  `);
  assert.equal(expected.length, 3); assert.equal(functions.length, 3);
  for (const [, name, body] of expected) {
    const fn = functions.find(row => row.proname === name);
    assert.ok(fn); assert.equal(fn.prosrc.replaceAll("\r\n", "\n"), body.replaceAll("\r\n", "\n"));
    assert.equal(fn.owner, owner); assert.equal(fn.prosecdef, false); assert.equal(fn.lanname, "plpgsql");
    assert.deepEqual(fn.proconfig, ["search_path=pg_catalog"]);
  }
  const wanted = [];
  const add = (table, name, fn, type = 31) => wanted.push({ table, name, fn, type, deferred: false, initially: false, enabled: "O" });
  add("media_assets", "media_asset_guard", "media_guard_asset");
  add("media_events", "media_event_guard", "media_guard_event");
  for (const table of ["catalog_media_refs", "page_media_refs"]) add(table, "media_reference_guard", "media_guard_reference");
  for (const table of mediaTables) add(table, "media_no_truncate", "catalog_deny_truncate", 34);
  const { rows: actual } = await client.query(`
    SELECT c.relname AS table,t.tgname AS name,p.proname AS fn,t.tgtype::integer AS type,
      t.tgdeferrable AS deferred,t.tginitdeferred AS initially,t.tgenabled AS enabled
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname=ANY($1::text[])
  `, [mediaTables]);
  const sort = rows => rows.sort((a, b) => (a.table + "/" + a.name).localeCompare(b.table + "/" + b.name));
  assert.deepEqual(sort(actual), sort(wanted));
};
