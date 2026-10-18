import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// preDrop: states 7..16 are checked against 0006. orderLinks: state >= 18 (0017) replaced public_read_catalog()
// (adds the three stored order links); the page and media functions keep their earlier definitions.
export const verifyPublicReadProtection = async (client, owner, { media = true, preDrop = false, orderLinks = false } = {}) => {
  const read = name => readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), "utf8");
  const sources = [preDrop ? read("0006_public_read_path.sql") : read("0016_drop_language_columns.sql"),
    ...(media ? [read("0010_cms_media_access.sql")] : []), ...(orderLinks ? [read("0017_public_read_order_links.sql")] : [])];
  const byName = new Map();
  for (const source of sources) {
    for (const match of source.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(public_read_\w+)\(([^)]*)\) RETURNS jsonb\s+LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS \$\$([\s\S]*?)\$\$;/g)) {
      byName.set(match[1], match);
    }
  }
  const expected = [...byName.values()];
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
