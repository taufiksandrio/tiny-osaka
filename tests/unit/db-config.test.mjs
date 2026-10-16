import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";

const dev = "postgresql://tiny_osaka_dev_app:fake-test-secret@127.0.0.1:5432/tiny_osaka_dev";
const testing = "postgresql://tiny_osaka_test_app:different-fake-secret@127.0.0.1:5432/tiny_osaka_test";

test("selects explicit dev/test credentials without falling back", () => {
  const env = { DATABASE_URL: dev, TEST_DATABASE_URL: testing };
  assert.equal(getDatabaseConfig(env).connectionString, dev);
  assert.equal(getDatabaseConfig(env, "test").connectionString, testing);
  assert.throws(() => getDatabaseConfig({ DATABASE_URL: dev }, "test"));
  assert.throws(() => getDatabaseConfig(env, "production"));
});

test("rejects cross-database and privileged connections", () => {
  for (const value of [
    testing,
    dev.replace("tiny_osaka_dev_app", "postgres"),
    dev.replace("tiny_osaka_dev_app", "tiny_osaka_dev_owner"),
    dev.replace("tiny_osaka_dev_app", "tiny_osaka_test_app"),
    dev.replace("tiny_osaka_dev", "other_db"),
  ]) assert.throws(() => getDatabaseConfig({ DATABASE_URL: value }));
  assert.throws(() => getDatabaseConfig({ TEST_DATABASE_URL: dev }, "test"));
});

test("rejects remote hosts, redirects/options, invalid ports and missing secrets", () => {
  for (const value of [
    undefined, "", "broken", dev.replace("127.0.0.1", "example.com"),
    dev.replace(":5432", ":5433"), dev.replace("postgresql:", "https:"),
    `${dev}?host=example.com`, `${dev}#fragment`,
    dev.replace("fake-test-secret", ""), dev.replace("fake-test-secret", "REPLACE_LOCALLY"),
  ]) {
    assert.throws(() => getDatabaseConfig({ DATABASE_URL: value }), (error) => {
      assert.equal(error.message, "Invalid local database configuration; check the environment template.");
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test("accepts IPv6 loopback and an explicitly named migration role", () => {
  assert.ok(getDatabaseConfig({ DATABASE_URL: dev.replace("127.0.0.1", "[::1]") }));
  assert.ok(getDatabaseConfig({ DATABASE_URL: dev.replace("_app:", "_migrator:") }));
});

test("server-only marker blocks ordinary Node/client-like imports", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e",
    'import "./src/server/db/client.mjs";'], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /server-only|Client Component/);
});

test("server import constructs and closes without opening a connection", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", `
    import { createDatabaseClient } from "./src/server/db/client.mjs";
    const client = createDatabaseClient({ DATABASE_URL: ${JSON.stringify(dev)} });
    await client.close();
  `], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" }, timeout: 10000 });
  assert.equal(result.status, 0, "Server import/client initialization failed.");
});

test("Drizzle Kit loads the MJS configuration without database credentials", () => {
  const env = { ...process.env, NODE_OPTIONS: "" };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import config from "./drizzle.config.mjs";
    assert.equal(config.dialect, "postgresql");
    assert.equal(config.dbCredentials, undefined);
    for (const file of config.schema) await import(file);
  `], { encoding: "utf8", env, timeout: 10000 });
  assert.equal(result.status, 0, "Drizzle configuration import failed.");
});
