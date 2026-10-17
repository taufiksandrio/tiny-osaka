import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const verifyPublicReadProtection = async (client, owner, { media = true } = {}) => {
  const source = readFileSync(new URL("../../drizzle/0006_public_read_path.sql", import.meta.url), "utf8") +
    (media ? readFileSync(new URL("../../drizzle/0010_cms_media_access.sql", import.meta.url), "utf8") : "");
  const expected = [...source.matchAll(/CREATE FUNCTION public\.(public_read_\w+)\(([^)]*)\) RETURNS jsonb\s+LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS \$\$([\s\S]*?)\$\$;/g)];
  const app = owner.replace("_owner", "_app");
  const { rows } = await client.query(`
    SELECT p.oid,p.proname,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,l.lanname,
      pg_get_userbyid(p.proowner) AS owner,pg_get_function_identity_arguments(p.oid) AS args,
      p.prorettype::regtype::text AS result
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname LIKE 'public_read_%'
  `);
  assert.equal(expected.length, media ? 3 : 2); assert.equal(rows.length, expected.length);
  for (const [, name, args, body] of expected) {
    const fn = rows.find(row => row.proname === name);
    assert.ok(fn); assert.equal(fn.prosrc.replaceAll("\r\n", "\n"), body.replaceAll("\r\n", "\n"));
    assert.equal(fn.args.replaceAll(", ", ","), args);
    assert.equal(fn.owner, owner); assert.equal(fn.prosecdef, true);
    assert.equal(fn.provolatile, "s"); assert.equal(fn.lanname, "sql"); assert.equal(fn.result, "jsonb");
    assert.deepEqual(fn.proconfig, ["search_path=pg_catalog"]);
    const { rows: acl } = await client.query(`
      SELECT CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS role,
        x.privilege_type,x.is_grantable FROM pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x WHERE p.oid=$1
    `, [fn.oid]);
    assert.deepEqual(acl.map(row => row.role).sort(), [owner, app].sort());
    assert.ok(acl.every(row => row.privilege_type === "EXECUTE" && !row.is_grantable));
  }
};
