import pg from "pg";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";

export class TestDatabaseGuardError extends Error {}

export const getTestMigrationConfig = (env = process.env) => {
  let config;
  try {
    config = getDatabaseConfig({ TEST_DATABASE_URL: env.TEST_MIGRATION_DATABASE_URL }, "test");
    if (new URL(config.connectionString).username !== "tiny_osaka_test_migrator") throw new Error();
  } catch {
    throw new TestDatabaseGuardError("Refusing migration: require explicit local test migrator credentials.");
  }
  return config;
};

export const connectTestOwner = async (env = process.env) => {
  const client = new pg.Client(getTestMigrationConfig(env));
  try {
    await client.connect();
    await client.query("SET search_path TO pg_catalog");
    await client.query("SET statement_timeout TO '15s'");
    await client.query("SET lock_timeout TO '5s'");
    const { rows: [role] } = await client.query(`
      SELECT current_database() AS database, session_user AS login,
        rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit,
        (SELECT count(*)::integer FROM pg_auth_members WHERE member = r.oid) AS memberships,
        EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles o ON o.oid = m.roleid
          WHERE m.member = r.oid AND o.rolname = 'tiny_osaka_test_owner'
            AND m.set_option AND NOT m.inherit_option AND NOT m.admin_option
            AND NOT o.rolcanlogin AND NOT o.rolsuper AND NOT o.rolcreatedb
            AND NOT o.rolcreaterole AND NOT o.rolreplication AND NOT o.rolbypassrls
            AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = o.oid)
        ) AS owner_membership,
        has_database_privilege(session_user, 'tiny_osaka_dev', 'CONNECT') AS can_connect_dev,
        has_database_privilege(session_user, current_database(), 'CREATE') AS can_create_before_set,
        pg_get_userbyid(d.datdba) AS database_owner
      FROM pg_roles r JOIN pg_database d ON d.datname = current_database()
      WHERE r.rolname = session_user
    `);
    if (!role || role.database !== "tiny_osaka_test" || role.login !== "tiny_osaka_test_migrator" ||
      role.database_owner !== "tiny_osaka_test_owner" || role.memberships !== 1 || !role.owner_membership ||
      ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls", "rolinherit",
        "can_connect_dev", "can_create_before_set"].some(key => role[key])) {
      throw new TestDatabaseGuardError("Refusing migration: database identity or role privileges differ from approved scope.");
    }
    await client.query("SET ROLE tiny_osaka_test_owner");
    await client.query("SET search_path TO public, pg_catalog");
    const { rows: [identity] } = await client.query("SELECT current_user AS owner");
    if (identity.owner !== "tiny_osaka_test_owner") throw new TestDatabaseGuardError("SET ROLE verification failed.");
    return client;
  } catch (error) {
    await client.end();
    if (error instanceof TestDatabaseGuardError) throw error;
    throw new TestDatabaseGuardError("Test migrator connection/privilege verification failed; inspect credentials locally.");
  }
};
