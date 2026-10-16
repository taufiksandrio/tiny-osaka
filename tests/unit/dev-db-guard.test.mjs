import assert from "node:assert/strict";
import test from "node:test";
import { getDevMigrationConfig } from "../../scripts/lib/dev-db.mjs";

const good = "postgresql://tiny_osaka_dev_migrator:fake-unit-secret@127.0.0.1:5432/tiny_osaka_dev";

test("requires dedicated dev-migrator variable without app/test fallback", () => {
  for (const env of [{}, { TEST_DATABASE_URL: good }, { DATABASE_URL: good }, { TEST_MIGRATION_DATABASE_URL: good }]) {
    assert.throws(() => getDevMigrationConfig(env), /Refusing migration/);
  }
  assert.equal(getDevMigrationConfig({ DEV_MIGRATION_DATABASE_URL: good }).connectionString, good);
});

test("refuses wrong database, login, network target and URL options without echoing secrets", () => {
  for (const value of [
    good.replace("/tiny_osaka_dev", "/tiny_osaka_test"),
    good.replace("tiny_osaka_dev_migrator:", "tiny_osaka_test_migrator:"),
    good.replace("tiny_osaka_dev_migrator:", "tiny_osaka_dev_app:"),
    good.replace("tiny_osaka_dev_migrator:", "postgres:"),
    good.replace("127.0.0.1", "example.com"), `${good}?host=example.com`, "invalid",
  ]) {
    assert.throws(() => getDevMigrationConfig({ DEV_MIGRATION_DATABASE_URL: value }), (error) => {
      assert.equal(error.message, "Refusing migration: require explicit local dev migrator credentials.");
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});
