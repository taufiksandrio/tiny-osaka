// Staging/production migration runner (reviewed 0000-0019, Option P SQL from drizzle-remote/).
// Manual only; never run by build/start/deploy. Dry-run by default; --apply needs the exact confirmation value.
//   node scripts/migrate-production-db.mjs --target staging            (read-only pre-checks, prints the plan)
//   TINY_OSAKA_CONFIRM_PRODUCTION_MIGRATION=staging-0019 node scripts/migrate-production-db.mjs --target staging --apply
// Starts from an empty database (applies 0000-0019) or from the previously reviewed 0000-0017 (applies 0018-0019 only).
// Needs MIGRATION_DATABASE_URL (the *_migrator role) in the operator shell only. It never resets, repairs or deletes.
import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { applyReviewedMigration } from "./lib/apply-reviewed-migration.mjs";
import { verifyCatalogProtection } from "./lib/catalog-protection.mjs";
import { verifyPageProtection } from "./lib/page-protection.mjs";
import { verifyMediaProtection } from "./lib/media-protection.mjs";
import { verifyPublicReadProtection } from "./lib/public-read-protection.mjs";
import { verifyAuthProtection } from "./lib/auth-protection.mjs";
import { verifyCmsProtection } from "./lib/cms-protection.mjs";
import { verifyPublishingProtection } from "./lib/publishing-protection.mjs";
import { transformedFiles, remoteFolder } from "./lib/remote-migration-sql.mjs";
import { connectRemoteOwner, resolveTarget, RemoteDatabaseGuardError } from "./lib/railway-db.mjs";
import {
  CONFIRM_ENV, RemoteMigrationPlanError, confirmationFor, ownerOf,
  validateRemoteMigrationFiles, validateRemoteMigrationState,
} from "./lib/production-migration-plan.mjs";

const apply = process.argv.includes("--apply");

const readState = async (client, target) => {
  const { rows: schemas } = await client.query("SELECT nspname AS name FROM pg_namespace WHERE nspname IN ('drizzle','cms_auth') ORDER BY nspname");
  const { rows: objects } = await client.query(`
    SELECT c.relname AS name, c.relkind AS kind, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname`);
  if (!schemas.some(row => row.name === "drizzle")) {
    return { state: validateRemoteMigrationState({ target, history: null, objects, relations: [], schemas }), objects };
  }
  const { rows: [metadata] } = await client.query("SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='drizzle'");
  const { rows: relations } = await client.query(`
    SELECT c.relname AS name, c.relkind AS kind, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'drizzle' ORDER BY c.relname`);
  const { rows: history } = await client.query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id");
  return { state: validateRemoteMigrationState({ target, history, objects, relations, schemas, metadataOwner: metadata?.owner }), objects };
};

const verifyFinal = async (client, target) => {
  const owner = ownerOf(target);
  await verifyCatalogProtection(client, owner, 18);
  await verifyPageProtection(client, owner);
  await verifyMediaProtection(client, owner, { posterRead: true });
  await verifyPublicReadProtection(client, owner, { media: true, preDrop: false, orderLinks: true });
  await verifyAuthProtection(client, owner, { mcp: true, uploads: true });
  await verifyCmsProtection(client, owner, { otherDatabase: null });
  await verifyPublishingProtection(client, owner, { identityRestrict: true });
};

// Read-only checks of the pre-provisioned application roles (created by scripts/provision-railway-db.mjs).
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
    throw new RemoteMigrationPlanError("Refusing migration: app/cms roles or database PUBLIC isolation differ from the approved provisioning.");
  }
};

// Before adding 0018-0019 to a database already at 0000-0017, its auth schema must still be the reviewed 9-table one.
const verifyBase = async (client, target) => {
  const owner = ownerOf(target);
  await verifyCatalogProtection(client, owner, 18);
  await verifyAuthProtection(client, owner, { mcp: false });
};

let client;
try {
  const target = resolveTarget(process.argv.slice(2));
  const journal = JSON.parse(readFileSync(`${remoteFolder}/meta/_journal.json`, "utf8"));
  const files = readMigrationFiles({ migrationsFolder: remoteFolder });
  validateRemoteMigrationFiles(journal, files);
  // The committed copies must still equal the transform of the reviewed drizzle/ files.
  const generated = transformedFiles();
  if (generated.some((item, idx) => item.sql !== readFileSync(`${remoteFolder}/${item.name}`, "utf8") || !files[idx])) {
    throw new RemoteMigrationPlanError("Refusing migration: drizzle-remote is not the transform of drizzle/; run build-remote-migrations.");
  }
  if (apply && process.env[CONFIRM_ENV] !== confirmationFor(target)) {
    throw new RemoteMigrationPlanError(`Refusing to apply: set ${CONFIRM_ENV}=${confirmationFor(target)} after reviewing the dry-run and taking a backup. Nothing was changed.`);
  }
  client = await connectRemoteOwner(target);
  // Same advisory lock as the dev/test runners so no two runners work at once.
  await client.query("SELECT pg_advisory_lock(76210983)");
  await precheckRoles(client, target);
  console.log(`${target}: migrator identity, app/cms roles and PUBLIC isolation verified.`);
  const { state } = await readState(client, target);
  if (state === 20) {
    await verifyFinal(client, target);
    console.log(`${target}: reviewed 0000-0019 already applied and verified; no changes made.`);
  } else if (!apply) {
    if (state === 18) await verifyBase(client, target);
    console.log(`${target}: dry-run OK. Database is ${state === 0 ? "empty; --apply would create the drizzle metadata and apply 0000-0019" : "at 0000-0017; --apply would apply 0018-0019"} in ONE transaction.`);
  } else {
    if (state === 18) await verifyBase(client, target);
    await applyReviewedMigration(client, state === 0 ? files : files.slice(18), async () => {
      if ((await readState(client, target)).state !== 20) throw new Error("Migration final state verification failed.");
      await verifyFinal(client, target);
    }, state === 0 ? async () => {
      // Same objects Drizzle's migrator creates, owned by the *_owner role through SET ROLE.
      await client.query('CREATE SCHEMA "drizzle"');
      await client.query('CREATE TABLE "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
    } : undefined);
    console.log(`${target}: applied ${state === 0 ? "0000-0019" : "0018-0019"}; 31 public and 14 auth tables owned by ${ownerOf(target)}.`);
  }
} catch (error) {
  console.error(error instanceof RemoteMigrationPlanError || error instanceof RemoteDatabaseGuardError
    ? error.message : "Remote migration failed; transaction rolled back; no raw error/credentials logged.");
  process.exitCode = 1;
} finally {
  if (client) await client.end(); // releases the advisory lock even after failure
}
