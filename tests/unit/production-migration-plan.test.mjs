import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { remoteMigrations, validateRemoteMigrationFiles, validateRemoteMigrationState,
  confirmationFor, RemoteMigrationPlanError } from "../../scripts/lib/production-migration-plan.mjs";
import { tablesForState } from "../../scripts/lib/dev-migration-plan.mjs";
import { REMOTE_MIGRATION_LIMIT } from "../../scripts/lib/remote-migration-sql.mjs";

const artifacts = () => ({ journal: JSON.parse(readFileSync("drizzle-remote/meta/_journal.json", "utf8")),
  files: readMigrationFiles({ migrationsFolder: "drizzle-remote" }) });
const owner = "tiny_osaka_staging_owner";
const state = length => ({ target: "staging", metadataOwner: owner,
  history: remoteMigrations.slice(0, length).map(row => ({ hash: row.hash, created_at: String(row.when) })),
  objects: tablesForState(18).map(name => ({ name, kind: "r", owner })),
  schemas: [{ name: "cms_auth" }, { name: "drizzle" }],
  relations: ["__drizzle_migrations", "__drizzle_migrations_id_seq", "__drizzle_migrations_pkey"].map((name, idx) => ({ name, kind: ["r", "S", "i"][idx], owner })) });
const refused = run => assert.throws(run, error => error instanceof RemoteMigrationPlanError);

test("limit, confirmation and pinned plan cover 0000-0019", () => {
  assert.equal(REMOTE_MIGRATION_LIMIT, 20);
  assert.equal(remoteMigrations.length, 20);
  assert.equal(confirmationFor("staging"), "staging-0019");
  assert.equal(confirmationFor("production"), "production-0019");
});

test("accepts the real 20-entry drizzle-remote journal and hashes", () => {
  const { journal, files } = artifacts();
  validateRemoteMigrationFiles(journal, files);
  const bad = artifacts(); bad.files[19].hash = "x"; refused(() => validateRemoteMigrationFiles(bad.journal, bad.files));
  const short = artifacts(); short.journal.entries.pop(); short.files.pop(); refused(() => validateRemoteMigrationFiles(short.journal, short.files));
});

test("remote 0018 and 0019 carry staging and production owner branches", () => {
  for (const file of ["0018_mcp_oauth", "0019_mcp_uploads"]) {
    const sql = readFileSync(`drizzle-remote/${file}.sql`, "utf8");
    assert.match(sql, /tiny_osaka_staging_owner' THEN app_name := 'tiny_osaka_staging_app'/);
    assert.match(sql, /tiny_osaka_production_owner' THEN app_name := 'tiny_osaka_production_app'/);
  }
});

test("database state: empty, 18 and 20 accepted; 19 and others refused", () => {
  assert.equal(validateRemoteMigrationState({ target: "staging", history: null, objects: [], relations: [], schemas: [] }), 0);
  assert.equal(validateRemoteMigrationState(state(18)), 18);
  assert.equal(validateRemoteMigrationState(state(20)), 20);
  refused(() => validateRemoteMigrationState(state(19)));
  refused(() => validateRemoteMigrationState(state(17)));
  refused(() => validateRemoteMigrationState({ ...state(20), metadataOwner: "someone" }));
  refused(() => validateRemoteMigrationState({ ...state(20), history: state(20).history.map((row, i) => i === 19 ? { ...row, hash: "x" } : row) }));
});
