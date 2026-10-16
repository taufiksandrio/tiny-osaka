import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { sql } from "drizzle-orm";
import { createDatabaseClient } from "../../src/server/db/client.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";

// Local read-only tests. Never create/truncate/drop schema objects here.
for (const target of ["dev", "test"]) {
  test(`${target}: Drizzle connects with isolated unprivileged LOGIN`, async () => {
    const client = createDatabaseClient(process.env, target);
    try {
      let result;
      try {
        result = await client.db.execute(sql`
          SELECT current_database() AS database, current_user AS username,
            rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
            rolbypassrls,
            has_database_privilege(current_user, current_database(), 'CREATE') AS can_create,
            has_database_privilege(current_user, current_database(), 'TEMP') AS can_temp,
            has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_table,
            EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS has_membership
          FROM pg_roles r WHERE rolname = current_user
        `);
      } catch {
        throw new Error(`${target}: local connection/metadata query failed; verify credentials privately.`);
      }
      const row = result.rows[0];
      assert.equal(row.database, `tiny_osaka_${target}`);
      assert.equal(row.username, `tiny_osaka_${target}_app`);
      assert.equal(row.rolcanlogin, true);
      for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication",
        "rolbypassrls", "can_create", "can_temp", "can_create_table", "has_membership"]) {
        assert.equal(row[key], false, `${target}: unexpected privilege ${key}`);
      }
    } finally {
      await client.close();
    }
  });

  test(`${target}: PostgreSQL rejects connection to the other local database`, async () => {
    const config = getDatabaseConfig(process.env, target);
    const url = new URL(config.connectionString);
    url.pathname = target === "dev" ? "/tiny_osaka_test" : "/tiny_osaka_dev";
    const client = new pg.Client({ ...config, connectionString: url.toString() });
    let errorCode;
    try {
      await client.connect();
    } catch (error) {
      errorCode = error.code;
    } finally {
      await client.end();
    }
    assert.equal(errorCode, "42501", `${target}: expected database CONNECT permission denial`);
  });
}
