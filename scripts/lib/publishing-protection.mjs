import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export const verifyPublishingProtection = async (client, owner, { identityRestrict = true } = {}) => {
  const source = readFileSync(new URL("../../drizzle/0012_scheduled_publishing.sql", import.meta.url), "utf8");
  const expected = [...source.matchAll(/CREATE FUNCTION public\.(publishing_guard_\w+)\(\) RETURNS trigger\s+LANGUAGE plpgsql SET search_path = pg_catalog AS \$\$([\s\S]*?)\$\$;/g)];
  const functions = (await client.query(`SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'publishing_guard_%'`)).rows;
  assert.equal(expected.length, 2); assert.equal(functions.length, 2);
  for (const [, name, body] of expected) {
    const fn = functions.find(row => row.proname === name);
    assert.ok(fn); assert.equal(fn.owner, owner); assert.equal(fn.prosecdef, false);
    assert.deepEqual(fn.proconfig, ["search_path=pg_catalog"]);
    assert.equal(fn.prosrc.replaceAll("\r\n", "\n"), body.replaceAll("\r\n", "\n"));
  }
  const triggers = (await client.query(`SELECT t.tgname,t.tgenabled,t.tgtype,p.proname,c.relname FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE c.oid IN ('public.publication_jobs'::regclass,'public.publication_events'::regclass) AND NOT t.tgisinternal ORDER BY t.tgname`)).rows;
  assert.deepEqual(triggers.map(row => row.tgname), ["publication_events_truncate", "publication_events_write", "publication_jobs_truncate", "publication_jobs_write"]);
  for (const trigger of triggers) {
    assert.equal(trigger.tgenabled, "O");
    assert.equal(trigger.tgtype, trigger.tgname.endsWith("_truncate") ? 34 : 31);
    assert.equal(trigger.proname, trigger.relname === "publication_jobs" ? "publishing_guard_job" : "publishing_guard_event");
  }
  const unique = (await client.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='publication_jobs_active_target'")).rows[0]?.indexdef;
  assert.match(unique ?? "", /UNIQUE INDEX.*\(target\).*WHERE.*scheduled/);
  const fks = (await client.query("SELECT confupdtype,confdeltype FROM pg_constraint WHERE conrelid IN ('public.publication_jobs'::regclass,'public.publication_events'::regclass) AND contype='f'")).rows;
  assert.equal(fks.length, 3);
  assert.ok(fks.every(fk => fk.confdeltype === "r" && fk.confupdtype === (identityRestrict ? "r" : "a")));
};
