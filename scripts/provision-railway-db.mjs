// One-time provisioning of the staging/production database and its four roles (owner, migrator, app, cms).
// Operator-only, run from a shell INSIDE Railway's private network with the Postgres admin URL in
// RAILWAY_ADMIN_DATABASE_URL (never set that variable on the web service). Dry-run by default.
//   node scripts/provision-railway-db.mjs --target staging --credentials-file /tmp/staging-db.env          (dry-run)
//   node scripts/provision-railway-db.mjs --target staging --credentials-file /tmp/staging-db.env --apply
// Generated passwords are written ONLY to the new credentials file (mode 0600, must not exist), never printed.
// The script refuses if the database or any role already exists; it never alters or drops pre-existing objects.
import pg from "pg";
import { randomBytes } from "node:crypto";
import { chmodSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { resolveTarget } from "./lib/railway-db.mjs";
import { isValidDatabaseUrl } from "../src/server/db/config.mjs";

const apply = process.argv.includes("--apply");
const args = process.argv.slice(2);
const fileIndex = args.indexOf("--credentials-file");
const credentialsFile = fileIndex >= 0 ? args[fileIndex + 1] : undefined;

const connect = async (url, database) => {
  const parsed = new URL(url);
  const client = new pg.Client({ host: parsed.hostname, port: parsed.port ? Number(parsed.port) : 5432, user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password), database, connectionTimeoutMillis: 5000 });
  await client.connect();
  return client;
};

let admin, created = [], database, fileWritten = false;
const cleanup = async names => {
  // Only objects created by THIS run are removed, in dependency order.
  if (!admin) return;
  if (names.includes("database")) await admin.query(`DROP DATABASE IF EXISTS ${database}`).catch(() => {});
  for (const role of names.filter(name => name !== "database").reverse()) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
};
try {
  const target = resolveTarget(args);
  const adminUrl = process.env.RAILWAY_ADMIN_DATABASE_URL;
  const adminHost = new URL(adminUrl).hostname;
  // Same host rule as the application: loopback, *.railway.internal or an explicit DATABASE_HOST_ALLOWLIST entry.
  const probe = `postgresql://tiny_osaka_${target}_app:${"x".repeat(16)}@${new URL(adminUrl).host}/tiny_osaka_${target}`;
  if (!adminHost || !isValidDatabaseUrl(probe, target, ["app"], process.env)) throw new Error();
  if (!credentialsFile || !isAbsolute(credentialsFile)) throw new Error();
  database = `tiny_osaka_${target}`;
  const owner = `${database}_owner`, migrator = `${database}_migrator`, app = `${database}_app`, cms = `${database}_cms`;

  admin = await connect(adminUrl, new URL(adminUrl).pathname.slice(1) || "postgres");
  const { rows: clash } = await admin.query(
    "SELECT rolname AS name FROM pg_roles WHERE rolname = ANY($1::text[]) UNION ALL SELECT datname FROM pg_database WHERE datname = $2",
    [[owner, migrator, app, cms], database]);
  if (clash.length) throw new Error("Existing objects found; refusing (no repair).");
  if (!apply) {
    console.log(`${target}: dry-run OK. --apply would create roles ${owner} (NOLOGIN), ${migrator}, ${app}, ${cms}, database ${database} owned by ${owner}, revoke PUBLIC access, and write a 0600 credentials file.`);
  } else {
    const passwords = { [migrator]: randomBytes(48).toString("hex"), [app]: randomBytes(48).toString("hex"), [cms]: randomBytes(48).toString("hex") };
    const host = new URL(adminUrl).host;
    const url = (role, secret) => `postgresql://${role}:${secret}@${host}/${database}`;
    // Exclusive create (fails if present) with owner-only permission before any database change.
    writeFileSync(credentialsFile, [
      `DATABASE_URL=${url(app, passwords[app])}`, `CMS_DATABASE_URL=${url(cms, passwords[cms])}`,
      `MIGRATION_DATABASE_URL=${url(migrator, passwords[migrator])}`, ""].join("\n"), { flag: "wx", mode: 0o600 });
    fileWritten = true;
    chmodSync(credentialsFile, 0o600);
    await admin.query("SET password_encryption = 'scram-sha-256'");
    // Identifiers are fixed by the validated target; passwords are generated hex.
    const flags = "NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT";
    await admin.query(`CREATE ROLE ${owner} NOLOGIN ${flags}`); created.push(owner);
    await admin.query(`CREATE ROLE ${migrator} LOGIN ${flags} CONNECTION LIMIT 3 PASSWORD '${passwords[migrator]}'`); created.push(migrator);
    await admin.query(`CREATE ROLE ${app} LOGIN ${flags} CONNECTION LIMIT 5 PASSWORD '${passwords[app]}'`); created.push(app);
    await admin.query(`CREATE ROLE ${cms} LOGIN ${flags} CONNECTION LIMIT 5 PASSWORD '${passwords[cms]}'`); created.push(cms);
    // CREATE DATABASE ... OWNER needs the admin to be able to SET ROLE to the owner (superuser, or membership).
    await admin.query(`GRANT ${owner} TO CURRENT_USER`).catch(() => {});
    await admin.query(`CREATE DATABASE ${database} OWNER ${owner}`); created.push("database");
    await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    for (const role of [migrator, app, cms]) await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
    await admin.query(`GRANT ${owner} TO ${migrator} WITH INHERIT FALSE, SET TRUE, ADMIN FALSE`);
    const inner = await connect(adminUrl, database);
    try { await inner.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC"); } finally { await inner.end(); }
    console.log(`${target}: roles and database created. Credentials were written to the given file (mode 0600); move them into Railway Variables, then delete the file.`);
    console.log("Note: the web service needs DATABASE_URL and CMS_DATABASE_URL only; keep MIGRATION_DATABASE_URL in the operator shell.");
  }
} catch {
  if (created.length) await cleanup(created);
  if (fileWritten && credentialsFile) { try { unlinkSync(credentialsFile); } catch { /* ignore */ } }
  console.error("Railway database provisioning failed; no credentials logged. Created partial objects (if any) were removed; check the admin URL, host rule and that nothing pre-exists.");
  process.exitCode = 1;
} finally { if (admin) await admin.end(); }
