import pg from "pg";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";
import { ownerOf } from "./production-migration-plan.mjs";

export class RemoteDatabaseGuardError extends Error {}

const targets = ["staging", "production"];

export const resolveTarget = (args, env = process.env) => {
  const index = args.indexOf("--target");
  const target = index >= 0 ? args[index + 1] : undefined;
  if (!targets.includes(target) || (env.PUBLIC_DATABASE_TARGET && env.PUBLIC_DATABASE_TARGET !== target)) {
    throw new RemoteDatabaseGuardError("Refusing: pass --target staging|production matching PUBLIC_DATABASE_TARGET.");
  }
  return target;
};

// Operator-only credential (never set on the web service). Same host/port/identity rules as the app config.
export const getRemoteMigrationConfig = (target, env = process.env) => {
  try {
    const config = getDatabaseConfig({ DATABASE_URL: env.MIGRATION_DATABASE_URL, DATABASE_HOST_ALLOWLIST: env.DATABASE_HOST_ALLOWLIST }, target);
    if (new URL(config.connectionString).username !== `tiny_osaka_${target}_migrator`) throw new Error();
    return config;
  } catch {
    throw new RemoteDatabaseGuardError(`Refusing migration: require explicit ${target} migrator credentials in MIGRATION_DATABASE_URL.`);
  }
};

// Connects as the *_migrator role, verifies it is minimal, then SET ROLE to the NOLOGIN *_owner.
export const connectRemoteOwner = async (target, env = process.env) => {
  const owner = ownerOf(target), database = `tiny_osaka_${target}`, login = `tiny_osaka_${target}_migrator`;
  const client = new pg.Client(getRemoteMigrationConfig(target, env));
  try {
    await client.connect();
    await client.query("SET search_path TO pg_catalog");
    await client.query("SET statement_timeout TO '30s'");
    await client.query("SET lock_timeout TO '5s'");
    const { rows: [role] } = await client.query(`
      SELECT current_database() AS database, session_user AS login,
        rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit,
        (SELECT count(*)::integer FROM pg_auth_members WHERE member = r.oid) AS memberships,
        EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles o ON o.oid = m.roleid
          WHERE m.member = r.oid AND o.rolname = $1
            AND m.set_option AND NOT m.inherit_option AND NOT m.admin_option
            AND NOT o.rolcanlogin AND NOT o.rolsuper AND NOT o.rolcreatedb
            AND NOT o.rolcreaterole AND NOT o.rolreplication AND NOT o.rolbypassrls
            AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = o.oid)
        ) AS owner_membership,
        has_database_privilege(session_user, current_database(), 'CREATE') AS can_create_before_set,
        pg_get_userbyid(d.datdba) AS database_owner
      FROM pg_roles r JOIN pg_database d ON d.datname = current_database()
      WHERE r.rolname = session_user
    `, [owner]);
    if (!role || role.database !== database || role.login !== login ||
      role.database_owner !== owner || role.memberships !== 1 || !role.owner_membership ||
      ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls", "rolinherit",
        "can_create_before_set"].some(key => role[key])) {
      throw new RemoteDatabaseGuardError("Refusing migration: database identity or role privileges differ from approved scope.");
    }
    await client.query(`SET ROLE ${owner}`); // fixed identifier derived from a validated target
    await client.query("SET search_path TO public, pg_catalog");
    const { rows: [identity] } = await client.query("SELECT current_user AS owner");
    if (identity.owner !== owner) throw new RemoteDatabaseGuardError("SET ROLE verification failed.");
    return client;
  } catch (error) {
    await client.end();
    if (error instanceof RemoteDatabaseGuardError) throw error;
    throw new RemoteDatabaseGuardError("Migrator connection/privilege verification failed; inspect credentials and network access.");
  }
};
