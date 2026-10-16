import assert from "node:assert/strict";
import test from "node:test";
import { getPublicSource, getPublicDatabaseConfig } from "../../src/server/public/config.mjs";

test("public source defaults to published, with explicit fixture preview only", () => {
  assert.equal(getPublicSource({}), "published");
  assert.equal(getPublicSource({ PUBLIC_CONTENT_SOURCE: "fixture" }), "fixture");
  assert.throws(() => getPublicSource({ PUBLIC_CONTENT_SOURCE: "unknown" }));
  assert.throws(() => getPublicSource({ PUBLIC_CONTENT_SOURCE: "fixture", PUBLIC_DATABASE_TARGET: "test" }));
});
test("public connections reject migrator credentials and invalid targets", () => {
  for (const target of ["dev", "test"]) {
    const key = target === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL";
    const url = `postgresql://tiny_osaka_${target}_app:synthetic@127.0.0.1:5432/tiny_osaka_${target}`;
    assert.equal(getPublicDatabaseConfig({ PUBLIC_DATABASE_TARGET: target, [key]: url }).connectionString, url);
    assert.throws(() => getPublicDatabaseConfig({ PUBLIC_DATABASE_TARGET: target, [key]: url.replace("_app:", "_migrator:") }));
  }
  assert.throws(() => getPublicDatabaseConfig({ PUBLIC_DATABASE_TARGET: "production" }));
});
