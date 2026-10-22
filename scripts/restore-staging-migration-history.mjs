// ONE-TIME, STAGING-ONLY restore of the lost drizzle.__drizzle_migrations history (reviewed 0000-0017).
// Manual only; never run by build/start/deploy. Dry-run (read-only) by default.
//   node scripts/restore-staging-migration-history.mjs --target staging
//   TINY_OSAKA_CONFIRM_HISTORY_RESTORE=staging-0017 node scripts/restore-staging-migration-history.mjs --target staging --apply
// Needs MIGRATION_DATABASE_URL (the *_migrator role) in the operator shell only. Take a verified backup first.
// It writes only the drizzle metadata (schema, table, 18 rows from the pinned remoteMigrations) in ONE transaction and
// refuses unless the database is exactly the reviewed 0000-0017 shape. It never touches public/cms_auth tables or data.
// Afterwards use the official runner: npm run db:migrate:production -- --target staging
import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { verifyCatalogProtection } from "./lib/catalog-protection.mjs";
import { verifyPageProtection } from "./lib/page-protection.mjs";
import { verifyMediaProtection } from "./lib/media-protection.mjs";
import { verifyPublicReadProtection } from "./lib/public-read-protection.mjs";
import { verifyAuthProtection } from "./lib/auth-protection.mjs";
import { verifyCmsProtection } from "./lib/cms-protection.mjs";
import { verifyPublishingProtection } from "./lib/publishing-protection.mjs";
import { verifyLanguageColumnsRemoved } from "./lib/language-removal-protection.mjs";
import { transformedFiles, remoteFolder } from "./lib/remote-migration-sql.mjs";
import { connectRemoteOwner, resolveTarget, RemoteDatabaseGuardError } from "./lib/railway-db.mjs";
import { RemoteMigrationPlanError, ownerOf, validateRemoteMigrationFiles, validateRemoteMigrationState } from "./lib/production-migration-plan.mjs";
import {
  RestorePlanError, RESTORED_HISTORY_LENGTH, assertRestoreConfirmation, assertRestoreTarget, assertRowCountsUnchanged,
  countedTables, historyRowsToWrite, validatePreRestoreState,
} from "./lib/restore-migration-history-plan.mjs";

const apply = process.argv.includes("--apply");
const listRelations = (client, schema) => client.query(`
  SELECT c.relname AS name, c.relkind AS kind, pg_get_userbyid(c.relowner) AS owner
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = $1 AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname`, [schema]).then(result => result.rows);
const listSchemas = client => client.query("SELECT nspname AS name FROM pg_namespace WHERE nspname IN ('drizzle','cms_auth') ORDER BY nspname").then(result => result.rows);

// Same read-only role/isolation pre-check as the official runner (created by scripts/provision-railway-db.mjs).
const precheckRoles = async (client, target) => {
  const database = `tiny_osaka_${target}`;
  const { rows } = await client.query(`
    SELECT r.rolname AS name, r.rolcanlogin AS login, r.rolconnlimit AS connlimit,
      (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit) AS privileged,
      (SELECT count(*)::int FROM pg_auth_members WHERE member = r.oid) AS memberships,
      has_database_privilege(r.rolname, $1, 'CONNECT') AS can_connect
    FROM pg_roles r WHERE r.rolname = ANY($2::text[]) ORDER BY r.rolname`, [database, [`tiny_osaka_${target}_app`, `tiny_osaka_${target}_cms`]]);
  const { rows: [open] } = await client.query(`
    SELECT EXISTS (SELECT 1 FROM pg_database d, aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
      WHERE d.datname = $1 AND a.grantee = 0 AND a.privilege_type IN ('CONNECT','CREATE','TEMPORARY')) AS public_access`, [database]);
  if (rows.length !== 2 || rows.some(row => !row.login || row.privileged || row.memberships !== 0 || !row.can_connect) ||
    rows.find(row => row.name.endsWith("_cms")).connlimit !== 5 || open.public_access) {
    throw new RestorePlanError("Refusing history restore: app/cms roles or database PUBLIC isolation differ from the approved provisioning. Nothing was changed.");
  }
};

// Proves the structure is the reviewed 0000-0017 shape (same strictness as the runner's final verification, MCP excluded).
const verifyShape = async (client, target) => {
  const owner = ownerOf(target);
  await verifyCatalogProtection(client, owner, RESTORED_HISTORY_LENGTH);
  await verifyPageProtection(client, owner);
  await verifyMediaProtection(client, owner, { posterRead: true });
  await verifyPublicReadProtection(client, owner, { media: true, preDrop: false, orderLinks: true });
  await verifyAuthProtection(client, owner, { mcp: false });
  await verifyCmsProtection(client, owner, { otherDatabase: null });
  await verifyPublishingProtection(client, owner, { identityRestrict: true });
  await verifyLanguageColumnsRemoved(client);
};

const countRows = async client => {
  const counts = {};
  for (const name of countedTables()) {
    const [schema, table] = name.split("."); // fixed internal lists, never user input
    counts[name] = (await client.query(`SELECT count(*)::text AS n FROM "${schema}"."${table}"`)).rows[0].n;
  }
  return counts;
};

const verifyWritten = async (client, target) => {
  const { rows: [metadata] } = await client.query("SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='drizzle'");
  const history = (await client.query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id")).rows;
  const state = validateRemoteMigrationState({
    target, history, objects: await listRelations(client, "public"), relations: await listRelations(client, "drizzle"),
    schemas: await listSchemas(client), metadataOwner: metadata?.owner,
  });
  if (state !== RESTORED_HISTORY_LENGTH) throw new RestorePlanError("Refusing history restore: written history did not verify as 0000-0017. Transaction rolled back.");
};

let client, inTransaction = false;
try {
  const target = resolveTarget(process.argv.slice(2));
  assertRestoreTarget(target);
  // Hashes come only from the pinned plan, and the committed drizzle-remote copies must still match it.
  const journal = JSON.parse(readFileSync(`${remoteFolder}/meta/_journal.json`, "utf8"));
  const files = readMigrationFiles({ migrationsFolder: remoteFolder });
  validateRemoteMigrationFiles(journal, files);
  if (transformedFiles().some((item, idx) => item.sql !== readFileSync(`${remoteFolder}/${item.name}`, "utf8") || !files[idx])) {
    throw new RestorePlanError("Refusing history restore: drizzle-remote is not the transform of drizzle/; run build-remote-migrations. Nothing was changed.");
  }
  const rows = historyRowsToWrite();
  files.slice(0, RESTORED_HISTORY_LENGTH).forEach((file, idx) => {
    if (file.hash !== rows[idx].hash || file.folderMillis !== rows[idx].createdAt) throw new RestorePlanError("Refusing history restore: migration files differ from the pinned plan. Nothing was changed.");
  });
  if (apply) assertRestoreConfirmation(); // before any connection is opened
  client = await connectRemoteOwner(target);
  await client.query("SELECT pg_advisory_lock(76210983)"); // same lock as the runners
  await precheckRoles(client, target);
  console.log(`${target}: migrator identity, app/cms roles and PUBLIC isolation verified.`);
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  inTransaction = true;
  const schemas = await listSchemas(client);
  validatePreRestoreState({ target, schemas, objects: await listRelations(client, "public"), authObjects: await listRelations(client, "cms_auth") });
  console.log(`${target}: schema "drizzle" is absent; public (31) and cms_auth (9) tables match 0000-0017.`);
  await verifyShape(client, target);
  console.log(`${target}: structure, ownership and privileges verified as the reviewed 0000-0017 shape.`);
  const before = await countRows(client);
  console.log(`${target}: row counts before: pages=${before["public.pages"]}, media_assets=${before["public.media_assets"]}, cms_auth.users=${before["cms_auth.users"]}.`);
  if (!apply) {
    await client.query("ROLLBACK");
    inTransaction = false;
    console.log(`${target}: dry-run OK: would write ${rows.length} history rows (0000-0017). Nothing was changed.`);
  } else {
    // Same objects Drizzle's migrator creates (identical to the runner), owned by the *_owner role through SET ROLE.
    await client.query('CREATE SCHEMA "drizzle"');
    await client.query('CREATE TABLE "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
    for (const row of rows) {
      await client.query('INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)', [row.hash, row.createdAt]);
    }
    await verifyWritten(client, target);
    assertRowCountsUnchanged(before, await countRows(client));
    await client.query("COMMIT");
    inTransaction = false;
    console.log(`${target}: restored ${rows.length} history rows; row counts unchanged. Next: npm run db:migrate:production -- --target staging`);
  }
} catch (error) {
  if (client && inTransaction) await client.query("ROLLBACK").catch(() => {});
  console.error(error instanceof RestorePlanError || error instanceof RemoteMigrationPlanError || error instanceof RemoteDatabaseGuardError
    ? error.message : "History restore failed; transaction rolled back; no raw error/credentials logged.");
  process.exitCode = 1;
} finally {
  if (client) await client.end(); // releases the advisory lock even after failure
}
