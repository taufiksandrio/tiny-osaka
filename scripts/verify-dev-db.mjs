import assert from "node:assert/strict";
import pg from "pg";
import { connectDevOwner } from "./lib/dev-db.mjs";
import { getDatabaseConfig } from "../src/server/db/config.mjs";
import { allTables, validateDevMigrationState } from "./lib/dev-migration-plan.mjs";

import { verifyCatalogProtection } from "./lib/catalog-protection.mjs";

import { verifyPageProtection } from "./lib/page-protection.mjs";

import { verifyMediaProtection } from "./lib/media-protection.mjs";

import { verifyPublicReadProtection } from "./lib/public-read-protection.mjs";

const tables = allTables;
let owner;
let app;
try {
  owner = await connectDevOwner();
  await owner.query("BEGIN READ ONLY");
  const { rows: objects } = await owner.query(`
    SELECT c.relname AS name, c.relkind AS kind, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname
  `);
  const { rows: history } = await owner.query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id");
  const { rows: [metadata] } = await owner.query("SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='drizzle'");
  const { rows: relations } = await owner.query(`
    SELECT c.relname AS name, c.relkind AS kind, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='drizzle' ORDER BY c.relname
  `);
  assert.equal(validateDevMigrationState({ history, objects, relations, metadataOwner: metadata?.owner }), 7);
  const { rows: foreignKeys } = await owner.query(`
    SELECT c.confupdtype, c.confdeltype FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND c.contype = 'f'
  `);
  assert.equal(foreignKeys.length, 30);
  assert.ok(foreignKeys.every(row => row.confupdtype === "r" && row.confdeltype === "r"));
  for (const table of tables) {
    const { rows: [count] } = await owner.query(`SELECT count(*)::integer AS total FROM public.${table}`);
    assert.equal(count.total, 0);
  }
  await verifyCatalogProtection(owner, "tiny_osaka_dev_owner");
  await verifyPageProtection(owner, "tiny_osaka_dev_owner");
  await verifyMediaProtection(owner, "tiny_osaka_dev_owner");
  await verifyPublicReadProtection(owner, "tiny_osaka_dev_owner");
  await owner.query("ROLLBACK");

  const config = getDatabaseConfig();
  assert.equal(new URL(config.connectionString).username, "tiny_osaka_dev_app");
  app = new pg.Client(config);
  await app.connect();
  await app.query("BEGIN READ ONLY");
  await app.query("SET LOCAL statement_timeout TO '15s'");
  const { rows: [identity] } = await app.query(`
    SELECT current_database() AS database, session_user AS login,
      rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
      (SELECT count(*)::integer FROM pg_auth_members WHERE member = r.oid) AS memberships,
      has_database_privilege(session_user, 'tiny_osaka_test', 'CONNECT') AS cross_connect,
      has_schema_privilege(session_user, 'public', 'CREATE') AS schema_create
    FROM pg_roles r WHERE rolname = session_user
  `);
  assert.equal(identity.database, "tiny_osaka_dev");
  assert.equal(identity.login, "tiny_osaka_dev_app");
  assert.equal(identity.memberships, 0);
  for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls",
    "cross_connect", "schema_create"]) assert.equal(identity[key], false);
  for (const table of tables) {
    const { rows: [access] } = await app.query(`
      SELECT has_table_privilege(session_user, $1, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed
    `, [`public.${table}`]);
    assert.equal(access.allowed, false);
  }
  await app.query("ROLLBACK");
  console.log("dev: verified 28 empty owner-owned tables, reviewed 0000-0006 history, 30 RESTRICT FKs and runtime privilege isolation (read-only).");
} catch {
  console.error("Dev verification failed; no raw errors or credentials logged.");
  process.exitCode = 1;
} finally {
  if (app) await app.end();
  if (owner) await owner.end();
}
