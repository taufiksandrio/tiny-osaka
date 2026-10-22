import { tablesForState } from "./dev-migration-plan.mjs";
import { authTables, mcpAuthTables } from "./auth-protection.mjs";
import { remoteMigrations, ownerOf } from "./production-migration-plan.mjs";

// One-time, staging-only restore of the lost drizzle.__drizzle_migrations history for the reviewed 0000-0017 shape.
// Pure validation only (no I/O) so it is unit-testable; the script owns every database call.
export class RestorePlanError extends Error {}

export const RESTORE_CONFIRM_ENV = "TINY_OSAKA_CONFIRM_HISTORY_RESTORE";
export const RESTORE_TARGET = "staging";
export const RESTORE_CONFIRMATION = "staging-0017";
export const RESTORED_HISTORY_LENGTH = 18;
// Tables whose row counts must be identical before and after (the data that has to be kept).
export const guardedTables = Object.freeze(["public.pages", "public.media_assets", "cms_auth.users"]);

const refuse = reason => { throw new RestorePlanError(`Refusing history restore: ${reason} Nothing was changed.`); };

export const assertRestoreTarget = target => {
  if (target !== RESTORE_TARGET) refuse("only --target staging is allowed.");
};

export const assertRestoreConfirmation = (env = process.env) => {
  if (env[RESTORE_CONFIRM_ENV] !== RESTORE_CONFIRMATION) {
    refuse(`set ${RESTORE_CONFIRM_ENV}=${RESTORE_CONFIRMATION} after reviewing the dry-run and taking a verified backup.`);
  }
};

// The only source of hashes and created_at values: the pinned remoteMigrations plan (first 18 = 0000-0017).
export const historyRowsToWrite = (plan = remoteMigrations) => {
  const rows = plan.slice(0, RESTORED_HISTORY_LENGTH).map(row => ({ hash: row.hash, createdAt: row.when }));
  if (rows.length !== RESTORED_HISTORY_LENGTH || plan[RESTORED_HISTORY_LENGTH - 1]?.tag !== "0017_public_read_order_links") {
    refuse("the pinned plan does not end its first 18 entries at 0017.");
  }
  return rows;
};

const sameList = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const sorted = names => [...names].sort();

// schemas: [{name}] among drizzle/cms_auth; objects: public relations; authObjects: cms_auth relations
// (each {name, kind, owner}); both of the latter ordered by name as in the runner.
export const validatePreRestoreState = ({ target, schemas, objects, authObjects }) => {
  assertRestoreTarget(target);
  if (!Array.isArray(schemas) || !Array.isArray(objects) || !Array.isArray(authObjects)) refuse("state could not be read.");
  const owner = ownerOf(target);
  if (schemas.some(row => row.name === "drizzle")) {
    refuse('schema "drizzle" already exists; the history is not missing, use the official runner (npm run db:migrate:production).');
  }
  if (!schemas.some(row => row.name === "cms_auth")) refuse("schema cms_auth is missing.");
  if (authObjects.some(row => ["oauth_clients", "mcp_uploads"].includes(row.name)) ||
    mcpAuthTables.some(name => authObjects.some(row => row.name === name))) {
    refuse("MCP tables already exist, so the database is not at 0000-0017.");
  }
  if (!sameList(sorted(objects.map(row => row.name)), sorted(tablesForState(RESTORED_HISTORY_LENGTH)))) {
    refuse("public objects differ from the reviewed 0000-0017 table set.");
  }
  if (!sameList(sorted(authObjects.map(row => row.name)), sorted(authTables))) {
    refuse("cms_auth objects differ from the reviewed 9-table set.");
  }
  if ([...objects, ...authObjects].some(row => row.kind !== "r" || row.owner !== owner)) {
    refuse(`every table must be an ordinary table owned by ${owner}.`);
  }
};

// before/after: { "<schema.table>": count }. Any difference, missing or extra key, means rollback.
export const assertRowCountsUnchanged = (before, after) => {
  const keys = Object.keys(before ?? {}).sort();
  if (!keys.length || !sameList(keys, Object.keys(after ?? {}).sort()) || guardedTables.some(name => !(name in before))) {
    refuse("row counts could not be compared.");
  }
  if (keys.some(key => String(before[key]) !== String(after[key]))) refuse("a row count changed during the restore; transaction rolled back.");
};

// Tables to count: every public/cms_auth table of the 0017 shape (fixed lists, safe to quote).
export const countedTables = () => [
  ...tablesForState(RESTORED_HISTORY_LENGTH).map(name => `public.${name}`),
  ...authTables.map(name => `cms_auth.${name}`),
];
