import assert from "node:assert/strict";
export const verifyCmsProtection = async (client, owner, { absent = false, catalog = true, media = true } = {}) => {
  const cms = owner.replace("_owner", "_cms"), app = owner.replace("_owner", "_app");
  const role = (await client.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit,rolcanlogin,rolconnlimit,(SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships FROM pg_roles r WHERE rolname=$1", [cms])).rows[0];
  assert.ok(role, "Provision isolated CMS role first.");
  assert.equal(role.rolcanlogin, true); assert.equal(role.rolconnlimit, 5); assert.equal(role.memberships, 0);
  for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls", "rolinherit"]) assert.equal(role[key], false);
  const database = owner.replace("_owner", ""), other = database.includes("_dev") ? "tiny_osaka_test" : "tiny_osaka_dev";
  assert.equal((await client.query("SELECT has_database_privilege($1,$2,'CONNECT') AS own", [cms, database])).rows[0].own, true);
  const isolation = (await client.query("SELECT has_database_privilege($1,$2,'CONNECT') AS other,has_schema_privilege($1,'public','CREATE') AS create", [cms, other])).rows[0];
  assert.equal(isolation.other, false); assert.equal(isolation.create, false);
  const reads = ["pages", "page_revisions", "page_translations", "page_submissions", "page_approvals", "page_publications", "page_workflow_events", "page_media_refs", "media_assets"];
  const inserts = reads.filter(table => table !== "media_assets"), updates = ["page_revisions", "page_translations", "page_publications"];
  if (catalog) {
    const catalogReads = ["catalog_revisions", "categories", "products", "category_entries", "product_entries", "category_translations", "product_translations", "product_variants", "variant_translations", "modifier_groups", "modifier_group_translations", "modifier_options", "modifier_option_translations", "catalog_submissions", "catalog_approvals", "catalog_publication", "catalog_workflow_events", "catalog_media_refs"];
    reads.push(...catalogReads); inserts.push(...catalogReads);
    updates.push(...catalogReads.filter(table => !["categories", "products", "catalog_submissions", "catalog_approvals", "catalog_workflow_events", "catalog_media_refs"].includes(table)));
    const constraint = (await client.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.catalog_workflow_events'::regclass AND conname='catalog_workflow_events_action'")).rows[0]?.definition;
    assert.deepEqual([...constraint.matchAll(/'([^']+)'/g)].map(match => match[1]).sort(), ["create", "save", "clone", "submit", "approve", "reject", "publish", "archive"].sort());
  }
  if (media) { inserts.push("media_assets", "media_events"); updates.push("page_media_refs", "catalog_media_refs"); }
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
  for (const { tablename } of tables) {
    for (const [privilege, allowed] of [["SELECT", reads], ["INSERT", inserts], ["UPDATE", updates], ["DELETE", media ? ["page_media_refs", "catalog_media_refs"] : []], ["TRUNCATE", []], ["TRIGGER", []], ["REFERENCES", []]]) {
      const access = (await client.query("SELECT has_table_privilege($1,$2,$3) AS ok", [cms, "public." + tablename, privilege])).rows[0].ok;
      assert.equal(access, !absent && allowed.includes(tablename), `${tablename}/${privilege}`);
    }
    assert.equal((await client.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS ok", [app, "public." + tablename])).rows[0].ok, false);
  }
  for (const { table_name, column_name } of (await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='cms_auth'")).rows) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
      const access = (await client.query("SELECT has_column_privilege($1,$2,$3,$4) AS ok", [cms, "cms_auth." + table_name, column_name, privilege])).rows[0].ok;
      assert.equal(access, !absent && table_name === "roles" && privilege === "SELECT");
    }
  }
};
