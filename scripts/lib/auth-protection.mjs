import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const authTables = ["accounts", "audit", "request_limits", "roles", "session_activity", "sessions", "two_factors", "users", "verifications"];
export const verifyAuthProtection = async (client, owner, { absent = false } = {}) => {
  const schema = (await client.query("SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='cms_auth'")).rows;
  if (absent) { assert.equal(schema.length, 0); return; }
  assert.equal(schema.length, 1); assert.equal(schema[0].owner, owner);
  const app = owner.replace("_owner", "_app");
  const tables = (await client.query("SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='cms_auth' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname")).rows;
  assert.deepEqual(tables.map(row => row.name), authTables);
  assert.ok(tables.every(row => row.owner === owner && row.kind === "r"));
  const source = readFileSync(new URL("../../drizzle/0007_auth_foundation.sql", import.meta.url), "utf8");
  const expected = [...source.matchAll(/CREATE FUNCTION cms_auth\.(\w+)\(\) RETURNS trigger\nLANGUAGE plpgsql SECURITY (DEFINER|INVOKER) SET search_path = pg_catalog AS \$\$([\s\S]*?)\$\$;/g)];
  const functions = (await client.query("SELECT p.proname,p.prosrc,p.proconfig,p.prosecdef,pg_get_userbyid(p.proowner) AS owner,p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='cms_auth'")).rows;
  assert.equal(expected.length, 3); assert.equal(functions.length, 3);
  for (const [, name, security, body] of expected) {
    const fn = functions.find(row => row.proname === name); assert.ok(fn);
    assert.equal(fn.prosrc.replaceAll("\r\n", "\n"), body);
    assert.equal(fn.owner, owner); assert.equal(fn.prosecdef, security === "DEFINER");
    assert.deepEqual(fn.proconfig, ["search_path=pg_catalog"]);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1 AND (a.grantee<>p.proowner OR a.is_grantable)", [fn.oid])).rows[0].n, 0);
  }
  const triggers = (await client.query("SELECT t.tgname,t.tgenabled,p.proname,c.relname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='cms_auth' AND NOT t.tgisinternal ORDER BY t.tgname")).rows;
  assert.deepEqual(triggers.map(row => [row.tgname, row.proname, row.relname, row.tgenabled]), [
    ["immutable_auth_audit", "guard_audit", "audit", "O"], ["immutable_session_identity", "guard_session_identity", "sessions", "O"], ["initialize_session_activity", "initialize_activity", "sessions", "O"],
  ]);
  assert.deepEqual(triggers.map(row => row.definition), [
    "CREATE TRIGGER immutable_auth_audit BEFORE DELETE OR UPDATE ON cms_auth.audit FOR EACH ROW EXECUTE FUNCTION cms_auth.guard_audit()",
    "CREATE TRIGGER immutable_session_identity BEFORE UPDATE ON cms_auth.sessions FOR EACH ROW EXECUTE FUNCTION cms_auth.guard_session_identity()",
    "CREATE TRIGGER initialize_session_activity AFTER INSERT ON cms_auth.sessions FOR EACH ROW EXECUTE FUNCTION cms_auth.initialize_activity()",
  ]);
  for (const table of authTables) {
    const result = (await client.query("SELECT has_table_privilege($1,$2,'TRUNCATE,REFERENCES,TRIGGER') AS danger, has_schema_privilege($1,'cms_auth','CREATE') AS create", [app, "cms_auth." + table])).rows[0];
    assert.equal(result.danger, false); assert.equal(result.create, false);
  }
  for (const privilege of ["INSERT", "UPDATE", "DELETE"]) assert.equal((await client.query("SELECT has_table_privilege($1,'cms_auth.roles',$2) AS ok", [app, privilege])).rows[0].ok, false);
  for (const [table, column] of [["users", "email"], ["users", "id"], ["accounts", "user_id"]]) {
    assert.equal((await client.query("SELECT has_column_privilege($1,$2,$3,'UPDATE') AS ok", [app, "cms_auth." + table, column])).rows[0].ok, false);
  }
};
