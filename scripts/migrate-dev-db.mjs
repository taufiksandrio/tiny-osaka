import { verifyPublishingProtection } from "./lib/publishing-protection.mjs";
import { verifyCmsProtection } from "./lib/cms-protection.mjs";
import { verifyAuthProtection } from "./lib/auth-protection.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyDropLanguageMigration, ContentResetError } from "./lib/reset-local-content.mjs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { connectDevOwner, DevDatabaseGuardError } from "./lib/dev-db.mjs";
import { validateDevMigrationFiles, validateDevMigrationState, DevMigrationPlanError } from "./lib/dev-migration-plan.mjs";

import { verifyCatalogProtection } from "./lib/catalog-protection.mjs";

import { verifyPageProtection } from "./lib/page-protection.mjs";

import { verifyMediaProtection } from "./lib/media-protection.mjs";

import { verifyPublicReadProtection } from "./lib/public-read-protection.mjs";

const folder = fileURLToPath(new URL("../drizzle", import.meta.url));

const checkHistory = async (client) => {
  const { rows: objects } = await client.query(`
    SELECT c.relname AS name, c.relkind AS kind, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname
  `);
  const { rows: [metadata] } = await client.query("SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='drizzle'");
  const { rows: relations } = await client.query(`
    SELECT c.relname AS name, c.relkind AS kind, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'drizzle' ORDER BY c.relname
  `);
  const { rows: history } = await client.query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id");
  const state = validateDevMigrationState({ history, objects, relations, metadataOwner: metadata?.owner });
  if (state >= 3) await verifyCatalogProtection(client, "tiny_osaka_dev_owner", state);
  if (state >= 5) await verifyPageProtection(client, "tiny_osaka_dev_owner");
  if (state >= 6) await verifyMediaProtection(client, "tiny_osaka_dev_owner", { posterRead: state >= 12 });
  if (state >= 7) await verifyPublicReadProtection(client, "tiny_osaka_dev_owner", { media: state >= 11, preDrop: state < 17 });
  await verifyAuthProtection(client, "tiny_osaka_dev_owner", { absent: state === 7 });
  await verifyCmsProtection(client, "tiny_osaka_dev_owner", { catalog: state >= 10, media: state >= 11, publishing: state >= 13, deletion: state >= 15 });
  if (state >= 13) await verifyPublishingProtection(client, "tiny_osaka_dev_owner", { identityRestrict: state >= 14 });
  return state;
};

let client;
try {
  const journal = JSON.parse(readFileSync(`${folder}/meta/_journal.json`, "utf8"));
  const files = readMigrationFiles({ migrationsFolder: folder });
  validateDevMigrationFiles(journal, files);
  client = await connectDevOwner();
  // Preserve the original dev lock so all versions of this runner serialize.
  await client.query("SELECT pg_advisory_lock(76210983)");
  const initialState = await checkHistory(client);
  if (initialState === 17) {
    console.log("dev: reviewed 0000-0016 already applied; no changes made.");
  } else {
    await applyDropLanguageMigration({ client, files, initialState, owner: "tiny_osaka_dev_owner", label: "dev", checkHistory });
    console.log("dev: applied reviewed plan up to 0016 (language columns removed; hashed local content reset); 31 public and 9 auth tables owned by tiny_osaka_dev_owner.");
  }
} catch (error) {
  console.error(error instanceof ContentResetError || error instanceof DevDatabaseGuardError || error instanceof DevMigrationPlanError
    ? error.message : "Dev migration failed; no raw error/credentials logged.");
  process.exitCode = 1;
} finally {
  if (client) await client.end(); // releases advisory lock even after failure
}
