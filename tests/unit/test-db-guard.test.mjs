import assert from "node:assert/strict";
import test from "node:test";
import { getTestMigrationConfig } from "../../scripts/lib/test-db.mjs";

const good = "postgresql://tiny_osaka_test_migrator:fake-unit-secret@127.0.0.1:5432/tiny_osaka_test";

test("requires dedicated test-migrator variable without app/dev fallback", () => {
  for (const env of [{}, { TEST_DATABASE_URL: good }, { DATABASE_URL: good }]) {
    assert.throws(() => getTestMigrationConfig(env), /Refusing migration/);
  }
  assert.equal(getTestMigrationConfig({ TEST_MIGRATION_DATABASE_URL: good }).connectionString, good);
});

test("refuses wrong database, login, network target and URL options without echoing secrets", () => {
  for (const value of [
    good.replace("/tiny_osaka_test", "/tiny_osaka_dev"),
    good.replace("tiny_osaka_test_migrator:", "tiny_osaka_dev_migrator:"),
    good.replace("tiny_osaka_test_migrator:", "tiny_osaka_test_app:"),
    good.replace("tiny_osaka_test_migrator:", "postgres:"),
    good.replace("127.0.0.1", "example.com"), `${good}?host=example.com`, "invalid",
  ]) {
    assert.throws(() => getTestMigrationConfig({ TEST_MIGRATION_DATABASE_URL: value }), (error) => {
      assert.equal(error.message, "Refusing migration: require explicit local test migrator credentials.");
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});
