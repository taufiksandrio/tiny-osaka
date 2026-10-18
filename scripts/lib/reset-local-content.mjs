import { applyReviewedMigration } from "./apply-reviewed-migration.mjs";
import { allTables } from "./test-migration-plan.mjs";

// ADR-039 (strategy S3): migration 0016 changes the inputs of every immutable content hash, so hashed
// local test/dev content is DELETED (never re-hashed) in the same transaction as the structural change.
// Never usable for production: only the two local owner roles, 127.0.0.1/::1, start state 16, explicit env.
export class ContentResetError extends Error {}

export const CONFIRM_ENV = "TINY_OSAKA_CONFIRM_CONTENT_RESET";
export const CONFIRM_VALUE = "0016";
export const RESET_FROM_STATE = 16;
export const RESET_TO_STATE = 17;
const LOCAL_HOSTS = ["127.0.0.1", "::1", "[::1]", "localhost"];
const LOCAL_OWNERS = Object.freeze({ tiny_osaka_test_owner: "tiny_osaka_test", tiny_osaka_dev_owner: "tiny_osaka_dev" });

// Children before parents (all FKs are RESTRICT). TRUNCATE is forbidden by the guards, so DELETE.
export const resetTables = Object.freeze([
  "publication_events", "publication_jobs", "catalog_publication", "page_publications",
  "catalog_workflow_events", "page_workflow_events", "catalog_approvals", "page_approvals",
  "catalog_submissions", "page_submissions", "modifier_option_translations", "modifier_options",
  "modifier_group_translations", "modifier_groups", "variant_translations", "product_variants",
  "catalog_media_refs", "page_media_refs", "product_translations", "product_entries",
  "category_translations", "category_entries", "page_translations", "catalog_revisions", "page_revisions",
  "products", "categories",
]);
// Never touched: media metadata/events (files stay valid), page identities, append-only deletion log.
export const retainedTables = Object.freeze(["media_assets", "media_events", "pages", "catalog_deletion_log"]);
const countedTables = [...resetTables, ...retainedTables];

export const countRows = async (client, tables = countedTables) => {
  const counts = {};
  for (const table of tables) counts[table] = Number((await client.query(`SELECT count(*)::text AS count FROM public.${table}`)).rows[0].count);
  return counts;
};
export const formatCounts = (counts, tables) => tables.map(table => `${table}=${counts[table]}`).join(", ");

export const assertResetRequested = (env = process.env) => {
  if (env[CONFIRM_ENV] !== CONFIRM_VALUE) {
    throw new ContentResetError(`Refusing to delete local test content for migration 0016: set ${CONFIRM_ENV}=${CONFIRM_VALUE} after reviewing the counts above and taking a backup. Nothing was changed.`);
  }
};

export const assertResetStart = initialState => {
  if (initialState !== RESET_FROM_STATE) {
    throw new ContentResetError(`Content reset runs only from reviewed state ${RESET_FROM_STATE} (0000-0015 applied); found ${initialState}. Nothing was changed.`);
  }
};

const assertLocalIdentity = async (client, expectedOwner) => {
  const expectedDatabase = LOCAL_OWNERS[expectedOwner];
  const { rows: [identity] } = await client.query("SELECT current_user AS owner, current_database() AS database");
  if (!expectedDatabase || identity?.owner !== expectedOwner || identity.database !== expectedDatabase ||
    !LOCAL_HOSTS.includes(client.host)) {
    throw new ContentResetError("Content reset refused: require the local owner role, its own database and a loopback host.");
  }
};

// Runs inside the migration transaction (the `prepare` hook of applyReviewedMigration).
export const resetLocalContent = async (client, { owner, checkState }) => {
  assertResetStart(await checkState());
  await assertLocalIdentity(client, owner);
  await client.query("SELECT pg_advisory_xact_lock(76210990)");
  await client.query("SELECT pg_advisory_xact_lock(76210984)");
  await client.query("LOCK TABLE " + resetTables.map(table => "public." + table).join(",") + " IN ACCESS EXCLUSIVE MODE");
  const retained = await countRows(client, retainedTables);
  for (const table of resetTables) await client.query(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
  for (const table of resetTables) await client.query(`DELETE FROM public.${table}`);
  for (const table of resetTables) await client.query(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);
  await assertTriggersEnabled(client);
  return retained;
};

export const assertTriggersEnabled = async client => {
  const { rows: [row] } = await client.query(`SELECT count(*)::text AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled <> 'O'`);
  if (row.count !== "0") throw new ContentResetError("A guard trigger is not enabled after the content reset.");
};

export const assertResetResult = async (client, retainedBefore) => {
  const emptied = await countRows(client, resetTables);
  if (Object.values(emptied).some(count => count !== 0)) throw new ContentResetError("Content reset left rows behind.");
  const retained = await countRows(client, retainedTables);
  if (JSON.stringify(retained) !== JSON.stringify(retainedBefore)) throw new ContentResetError("Content reset changed retained tables.");
  await assertTriggersEnabled(client);
};

// Shared by migrate-test-db.mjs and migrate-dev-db.mjs for the 0016 step.
export const applyDropLanguageMigration = async ({ client, files, initialState, env = process.env, owner, checkHistory, label, log = console.log }) => {
  assertResetStart(initialState);
  const before = await countRows(client);
  log(`${label}: migration 0016 will DELETE hashed test content. Rows to delete: ${formatCounts(before, resetTables)}.`);
  log(`${label}: rows kept untouched: ${formatCounts(before, retainedTables)}.`);
  assertResetRequested(env);
  let retained;
  await applyReviewedMigration(client, files.slice(initialState, RESET_TO_STATE), async () => {
    if (await checkHistory(client) !== RESET_TO_STATE) throw new ContentResetError("Migration final state verification failed.");
    await assertResetResult(client, retained);
  }, async () => {
    retained = await resetLocalContent(client, { owner, checkState: () => checkHistory(client) });
  });
};

// Test fixtures and the unit test compare against the reviewed table inventory.
export const inventoryMatches = () => JSON.stringify([...resetTables, ...retainedTables.filter(name => allTables.includes(name))].sort()) ===
  JSON.stringify([...allTables].sort());
