import pg from "pg";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";

export class DevDatabaseGuardError extends Error {}

export const getDevMigrationConfig = (env = process.env) => {
  let config;
  try {
    config = getDatabaseConfig({ DATABASE_URL: env.DEV_MIGRATION_DATABASE_URL }, "dev");
    if (new URL(config.connectionString).username !== "tiny_osaka_dev_migrator") throw new Error();
  } catch {
    throw new DevDatabaseGuardError("Refusing migration: require explicit local dev migrator credentials.");
  }
  return config;
};

export const connectDevOwner = async (env = process.env) => {
  const client = new pg.Client(getDevMigrationConfig(env));
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
          WHERE m.member = r.oid AND o.rolname = 'tiny_osaka_dev_owner'
            AND m.set_option AND NOT m.inherit_option AND NOT m.admin_option
            AND NOT o.rolcanlogin AND NOT o.rolsuper AND NOT o.rolcreatedb
            AND NOT o.rolcreaterole AND NOT o.rolreplication AND NOT o.rolbypassrls
            AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = o.oid)
        ) AS owner_membership,
        has_database_privilege(session_user, 'tiny_osaka_test', 'CONNECT') AS can_connect_other,
        has_database_privilege(session_user, current_database(), 'CREATE') AS can_create_before_set,
        pg_get_userbyid(d.datdba) AS database_owner
      FROM pg_roles r JOIN pg_database d ON d.datname = current_database()
      WHERE r.rolname = session_user
    `);
    if (!role || role.database !== "tiny_osaka_dev" || role.login !== "tiny_osaka_dev_migrator" ||
      role.database_owner !== "tiny_osaka_dev_owner" || role.memberships !== 1 || !role.owner_membership ||
      ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls", "rolinherit",
        "can_connect_other", "can_create_before_set"].some(key => role[key])) {
      throw new DevDatabaseGuardError("Refusing migration: database identity or role privileges differ from approved scope.");
    }
    await client.query("SET ROLE tiny_osaka_dev_owner");
    await client.query("SET search_path TO public, pg_catalog");
    const { rows: [identity] } = await client.query("SELECT current_user AS owner");
    if (identity.owner !== "tiny_osaka_dev_owner") throw new DevDatabaseGuardError("SET ROLE verification failed.");
    return client;
  } catch (error) {
    await client.end();
    if (error instanceof DevDatabaseGuardError) throw error;
    throw new DevDatabaseGuardError("Dev migrator connection/privilege verification failed; inspect credentials locally.");
  }
};
