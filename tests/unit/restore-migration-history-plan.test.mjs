import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { remoteMigrations } from "../../scripts/lib/production-migration-plan.mjs";
import { tablesForState } from "../../scripts/lib/dev-migration-plan.mjs";
import { authTables } from "../../scripts/lib/auth-protection.mjs";
import {
  RestorePlanError, RESTORE_CONFIRM_ENV, assertRestoreConfirmation, assertRestoreTarget, assertRowCountsUnchanged,
  countedTables, guardedTables, historyRowsToWrite, validatePreRestoreState,
} from "../../scripts/lib/restore-migration-history-plan.mjs";

const owner = "tiny_osaka_staging_owner";
const rel = (name, extra = {}) => ({ name, kind: "r", owner, ...extra });
const valid = () => ({ target: "staging", schemas: [{ name: "cms_auth" }],
  objects: tablesForState(18).map(name => rel(name)), authObjects: authTables.map(name => rel(name)) });
const refused = run => assert.throws(run, error => error instanceof RestorePlanError && !/postgres(ql)?:\/\//.test(error.message));

test("only the staging target is accepted", () => {
  assertRestoreTarget("staging");
  for (const target of ["production", "dev", "", undefined]) refused(() => assertRestoreTarget(target));
  refused(() => validatePreRestoreState({ ...valid(), target: "production" }));
});

test("confirmation must be exactly staging-0017", () => {
  assertRestoreConfirmation({ [RESTORE_CONFIRM_ENV]: "staging-0017" });
  for (const value of [undefined, "", "staging-0019", "production-0017", "staging-0017 ", "STAGING-0017"]) {
    refused(() => assertRestoreConfirmation({ [RESTORE_CONFIRM_ENV]: value }));
  }
  refused(() => assertRestoreConfirmation({}));
});

test("history rows come only from the first 18 pinned remoteMigrations", () => {
  const rows = historyRowsToWrite();
  assert.equal(rows.length, 18);
  rows.forEach((row, idx) => {
    assert.equal(row.hash, remoteMigrations[idx].hash);
    assert.equal(row.createdAt, remoteMigrations[idx].when);
  });
  assert.equal(remoteMigrations[17].tag, "0017_public_read_order_links");
  refused(() => historyRowsToWrite(remoteMigrations.slice(0, 10)));
  refused(() => historyRowsToWrite([...remoteMigrations.slice(1), remoteMigrations[0]]));
});

test("pinned hashes equal the committed drizzle-remote files for 0000-0017", () => {
  const files = readMigrationFiles({ migrationsFolder: "drizzle-remote" });
  const journal = JSON.parse(readFileSync("drizzle-remote/meta/_journal.json", "utf8"));
  historyRowsToWrite().forEach((row, idx) => {
    assert.equal(files[idx].hash, row.hash);
    assert.equal(files[idx].folderMillis, row.createdAt);
    assert.equal(journal.entries[idx].when, row.createdAt);
  });
});

test("accepts the reviewed 0000-0017 shape without drizzle schema", () => {
  validatePreRestoreState(valid());
  assert.equal(valid().objects.length, 31);
  assert.equal(valid().authObjects.length, 9);
});

test("refuses when the drizzle schema already exists, even if empty", () => {
  refused(() => validatePreRestoreState({ ...valid(), schemas: [{ name: "cms_auth" }, { name: "drizzle" }] }));
});

test("refuses missing cms_auth, missing/extra tables and unexpected objects", () => {
  refused(() => validatePreRestoreState({ ...valid(), schemas: [] }));
  refused(() => validatePreRestoreState({ ...valid(), objects: valid().objects.slice(1) }));
  refused(() => validatePreRestoreState({ ...valid(), objects: [...valid().objects, rel("surprise")] }));
  refused(() => validatePreRestoreState({ ...valid(), authObjects: valid().authObjects.slice(1) }));
  refused(() => validatePreRestoreState({ ...valid(), authObjects: [...valid().authObjects, rel("extra_auth")] }));
  refused(() => validatePreRestoreState({ ...valid(), objects: [...valid().objects, rel("leftover_seq", { kind: "S" })] }));
});

test("refuses wrong owner or relation kind", () => {
  const objects = valid().objects;
  refused(() => validatePreRestoreState({ ...valid(), objects: objects.map((row, i) => i === 0 ? { ...row, owner: "postgres" } : row) }));
  refused(() => validatePreRestoreState({ ...valid(), objects: objects.map((row, i) => i === 0 ? { ...row, kind: "v" } : row) }));
  const auth = valid().authObjects;
  refused(() => validatePreRestoreState({ ...valid(), authObjects: auth.map((row, i) => i === 0 ? { ...row, owner: "tiny_osaka_staging_app" } : row) }));
});

test("refuses when oauth_clients or mcp_uploads (or any MCP table) exist", () => {
  for (const name of ["oauth_clients", "mcp_uploads", "mcp_audit", "oauth_codes", "oauth_tokens"]) {
    refused(() => validatePreRestoreState({ ...valid(), authObjects: [...valid().authObjects, rel(name)] }));
  }
});

test("refuses unreadable state", () => {
  refused(() => validatePreRestoreState({ target: "staging", schemas: null, objects: [], authObjects: [] }));
  refused(() => validatePreRestoreState({ target: "staging", schemas: [], objects: undefined, authObjects: [] }));
});

test("row counts: equal accepted; any change, missing or extra key refused", () => {
  const before = Object.fromEntries(countedTables().map(name => [name, "3"]));
  before["public.pages"] = "8"; before["public.media_assets"] = "31"; before["cms_auth.users"] = "1";
  assertRowCountsUnchanged(before, { ...before });
  assertRowCountsUnchanged(before, Object.fromEntries(Object.entries(before).map(([k, v]) => [k, Number(v)])));
  for (const name of guardedTables) refused(() => assertRowCountsUnchanged(before, { ...before, [name]: "0" }));
  refused(() => assertRowCountsUnchanged(before, { ...before, "public.other_table": "1" }));
  const { "public.pages": removed, ...partial } = before;
  refused(() => assertRowCountsUnchanged(before, partial));
  refused(() => assertRowCountsUnchanged(partial, partial));
  refused(() => assertRowCountsUnchanged({}, {}));
  assert.equal(removed, "8");
});

test("counted tables cover 31 public and 9 cms_auth tables including guarded ones", () => {
  const tables = countedTables();
  assert.equal(tables.length, 40);
  for (const name of guardedTables) assert.ok(tables.includes(name), name);
});
