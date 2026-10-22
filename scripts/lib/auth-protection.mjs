import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const authTables = ["accounts", "audit", "request_limits", "roles", "session_activity", "sessions", "two_factors", "users", "verifications"];
export const mcpAuthTables = ["mcp_audit", "mcp_uploads", "oauth_clients", "oauth_codes", "oauth_tokens"];
// mcp_uploads arrives with migration 0019; databases at 0018 carry the other four.
export const mcpAuthTablesAt0018 = mcpAuthTables.filter(name => name !== "mcp_uploads");
export const authTablesWithMcp = [...authTables, ...mcpAuthTables].sort();
// uploads: whether migration 0019 (mcp_uploads) is expected. Left undefined, it is detected from the database.
export const hasUploadsTable = async client => (await client.query("SELECT to_regclass('cms_auth.mcp_uploads') IS NOT NULL AS ok")).rows[0].ok;
export const verifyAuthProtection = async (client, owner, { absent = false, mcp = false, uploads } = {}) => {
  const schema = (await client.query("SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='cms_auth'")).rows;
  if (absent) { assert.equal(schema.length, 0); return; }
  assert.equal(schema.length, 1); assert.equal(schema[0].owner, owner);
  const app = owner.replace("_owner", "_app");
  const tables = (await client.query("SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='cms_auth' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname")).rows;
  const withUploads = mcp && (uploads ?? await hasUploadsTable(client));
  const mcpTables = withUploads ? mcpAuthTables : mcpAuthTablesAt0018;
  const expectedTables = mcp ? [...authTables, ...mcpTables].sort() : authTables;
  assert.deepEqual(tables.map(row => row.name), expectedTables);
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
    ["immutable_auth_audit", "guard_audit", "audit", "O"],
    ...(mcp ? [["immutable_mcp_audit", "guard_audit", "mcp_audit", "O"]] : []),
    ["immutable_session_identity", "guard_session_identity", "sessions", "O"], ["initialize_session_activity", "initialize_activity", "sessions", "O"],
  ]);
  assert.deepEqual(triggers.map(row => row.definition), [
    "CREATE TRIGGER immutable_auth_audit BEFORE DELETE OR UPDATE ON cms_auth.audit FOR EACH ROW EXECUTE FUNCTION cms_auth.guard_audit()",
    ...(mcp ? ["CREATE TRIGGER immutable_mcp_audit BEFORE DELETE OR UPDATE ON cms_auth.mcp_audit FOR EACH ROW EXECUTE FUNCTION cms_auth.guard_audit()"] : []),
    "CREATE TRIGGER immutable_session_identity BEFORE UPDATE ON cms_auth.sessions FOR EACH ROW EXECUTE FUNCTION cms_auth.guard_session_identity()",
    "CREATE TRIGGER initialize_session_activity AFTER INSERT ON cms_auth.sessions FOR EACH ROW EXECUTE FUNCTION cms_auth.initialize_activity()",
  ]);
  for (const table of expectedTables) {
    const result = (await client.query("SELECT has_table_privilege($1,$2,'TRUNCATE,REFERENCES,TRIGGER') AS danger, has_schema_privilege($1,'cms_auth','CREATE') AS create", [app, "cms_auth." + table])).rows[0];
    assert.equal(result.danger, false); assert.equal(result.create, false);
  }
  for (const privilege of ["INSERT", "UPDATE", "DELETE"]) assert.equal((await client.query("SELECT has_table_privilege($1,'cms_auth.roles',$2) AS ok", [app, privilege])).rows[0].ok, false);
  if (mcp) {
    // The app role may only append to mcp_audit; the isolated CMS role holds nothing on any MCP table.
    const cms = owner.replace("_owner", "_cms");
    for (const privilege of ["SELECT", "UPDATE", "DELETE"]) assert.equal((await client.query("SELECT has_table_privilege($1,'cms_auth.mcp_audit',$2) AS ok", [app, privilege])).rows[0].ok, false);
    assert.equal((await client.query("SELECT has_table_privilege($1,'cms_auth.mcp_audit','INSERT') AS ok", [app])).rows[0].ok, false);
    assert.equal((await client.query("SELECT has_column_privilege($1,'cms_auth.mcp_audit','event','INSERT') AS ok", [app])).rows[0].ok, true);
    for (const table of mcpTables) for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.equal((await client.query("SELECT has_table_privilege($1,$2,$3) AS ok", [cms, "cms_auth." + table, privilege])).rows[0].ok, false, table);
    }
  }
  if (withUploads) {
    // Constraints of mcp_uploads (one path only, status/mime/size/target limits, unique tokens, owner/client FKs) and the widened audit event list.
    const constraints = (await client.query("SELECT conname,contype FROM pg_constraint WHERE conrelid='cms_auth.mcp_uploads'::regclass AND contype<>'n' ORDER BY conname")).rows.map(row => `${row.conname}:${row.contype}`);
    assert.deepEqual(constraints, ["mcp_upload_mime:c", "mcp_upload_one_path:c", "mcp_upload_size:c", "mcp_upload_status:c", "mcp_upload_target:c",
      "mcp_uploads_agent_token_hash_unique:u", "mcp_uploads_client_id_oauth_clients_client_id_fk:f", "mcp_uploads_pkey:p", "mcp_uploads_user_id_users_id_fk:f", "mcp_uploads_user_token_hash_unique:u"]);
    const events = (await client.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='cms_auth.mcp_audit'::regclass AND conname='mcp_audit_event'")).rows;
    assert.equal(events.length, 1);
    for (const event of ["upload_requested", "upload_completed", "upload_rejected"]) assert.ok(events[0].def.includes(`'${event}'`), event);
    // Upload requests are never deleted by the app role; it may only write the outcome columns.
    for (const privilege of ["SELECT", "INSERT"]) assert.equal((await client.query("SELECT has_table_privilege($1,'cms_auth.mcp_uploads',$2) AS ok", [app, privilege])).rows[0].ok, true);
    for (const privilege of ["UPDATE", "DELETE"]) assert.equal((await client.query("SELECT has_table_privilege($1,'cms_auth.mcp_uploads',$2) AS ok", [app, privilege])).rows[0].ok, false);
    for (const column of ["asset_id", "status", "agent_used_at", "user_used_at", "failure_code"]) assert.equal((await client.query("SELECT has_column_privilege($1,'cms_auth.mcp_uploads',$2,'UPDATE') AS ok", [app, column])).rows[0].ok, true, column);
    for (const column of ["user_id", "client_id", "agent_token_hash", "user_token_hash", "expires_at", "created_at"]) assert.equal((await client.query("SELECT has_column_privilege($1,'cms_auth.mcp_uploads',$2,'UPDATE') AS ok", [app, column])).rows[0].ok, false, column);
  }
  for (const [table, column] of [["users", "email"], ["users", "id"], ["accounts", "user_id"]]) {
    assert.equal((await client.query("SELECT has_column_privilege($1,$2,$3,'UPDATE') AS ok", [app, "cms_auth." + table, column])).rows[0].ok, false);
  }
};
