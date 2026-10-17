import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { reviewedMigrations, allTables, validateDevMigrationFiles,
  validateDevMigrationState, DevMigrationPlanError } from "../../scripts/lib/dev-migration-plan.mjs";

const artifacts = () => ({ journal: JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")),
  files: readMigrationFiles({ migrationsFolder: "drizzle" }) });
const state = (length) => ({
  metadataOwner: "tiny_osaka_dev_owner",
  history: reviewedMigrations.slice(0, length).map(row => ({ hash: row.hash, created_at: String(row.when) })),
  objects: (allTables).map(name => ({ name, kind: "r", owner: "tiny_osaka_dev_owner" })),
  relations: ["__drizzle_migrations", "__drizzle_migrations_id_seq", "__drizzle_migrations_pkey"]
    .map((name, idx) => ({ name, kind: ["r", "S", "i"][idx], owner: "tiny_osaka_dev_owner" })),
});
const reject = (run) => assert.throws(run, error => {
  assert.ok(error instanceof DevMigrationPlanError);
  assert.ok(!error.message.includes("untrusted-secret"));
  return true;
});

test("accepts actual reviewed SQL hashes and journal", () => {
  const { journal, files } = artifacts();
  validateDevMigrationFiles(journal, files);
});

test("rejects altered SQL hashes, timestamps, order and extra/missing files", () => {
  for (const mutate of [
    a => { a.files[0].hash = "untrusted-secret"; },
    a => { a.files[1].hash = "untrusted-secret"; },
    a => { a.files[2].hash = "untrusted-secret"; },
    a => { a.files[3].hash = "untrusted-secret"; },
    a => { a.files[4].hash = "untrusted-secret"; },
    a => { a.files[5].hash = "untrusted-secret"; },
    a => { a.files[6].hash = "untrusted-secret"; },
    a => { a.files[8].hash = "untrusted-secret"; },
    a => { a.files[1].folderMillis++; },
    a => { a.files.reverse(); }, a => { a.files.pop(); }, a => { a.files.push(a.files[1]); },
  ]) {
    const a = artifacts(); mutate(a);
    reject(() => validateDevMigrationFiles(a.journal, a.files));
  }
});

test("rejects altered journal identity, ordering, timestamps and extra entries", () => {
  for (const mutate of [
    a => { a.journal.dialect = "sqlite"; }, a => { a.journal.version = "8"; },
    a => { a.journal.entries[1].idx = 0; }, a => { a.journal.entries[1].version = "8"; },
    a => { a.journal.entries[1].when++; }, a => { a.journal.entries[1].tag = "untrusted-secret"; },
    a => { a.journal.entries[1].breakpoints = false; }, a => { a.journal.entries.reverse(); },
    a => { a.journal.entries.pop(); }, a => { a.journal.entries.push(a.journal.entries[1]); },
  ]) {
    const a = artifacts(); mutate(a);
    reject(() => validateDevMigrationFiles(a.journal, a.files));
  }
});

test("accepts reviewed auth baseline and CMS page final state", () => {
  assert.equal(validateDevMigrationState(state(9)), 9);
  assert.equal(validateDevMigrationState(state(8)), 8);
});

test("rejects absent, reordered, partial or modified migration history", () => {
  for (const mutate of [
    s => { s.history = []; }, s => { s.history.reverse(); }, s => { s.history[0].hash = "untrusted-secret"; },
    s => { s.history[1].created_at = "1"; }, s => { s.history.push(s.history[1]); },
    s => { s.history = [s.history[1]]; }, s => { s.history.pop(); s.history.pop(); },
  ]) {
    const s = state(9); mutate(s);
    reject(() => validateDevMigrationState(s));
  }
});

test("rejects ownership, relation kind and unexpected/missing objects", () => {
  for (const mutate of [
    s => { s.objects.pop(); }, s => { s.objects.push({ name: "unexpected", kind: "r", owner: "tiny_osaka_dev_owner" }); },
    s => { s.objects[0].owner = "postgres"; }, s => { s.objects[0].kind = "v"; },
    s => { s.relations[0].owner = "postgres"; }, s => { s.relations[1].kind = "r"; },
    s => { s.relations.pop(); }, s => { s.metadataOwner = "postgres"; },
    s => { s.metadataOwner = "tiny_osaka_test_owner"; },
    s => { s.objects[0].owner = "tiny_osaka_test_owner"; },
  ]) {
    const s = state(9); mutate(s);
    reject(() => validateDevMigrationState(s));
  }
});
