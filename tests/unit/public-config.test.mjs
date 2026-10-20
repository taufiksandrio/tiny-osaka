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

test("ADR-041: GA4 config is active only with a valid id and open production indexing", async () => {
  const { getAnalyticsConfig, isAnalyticsEnabled } = await import("../../src/server/public/config.mjs");
  const open = { PUBLIC_DATABASE_TARGET: "production", ALLOW_INDEXING: "true", SITE_URL: "https://tinyosaka.example" };
  assert.deepEqual({ ...getAnalyticsConfig({ ...open, GA4_MEASUREMENT_ID: " G-ABC123XYZ " }) }, { enabled: true, measurementId: "G-ABC123XYZ" });
  for (const id of [undefined, "", "  ", "UA-123456", "g-abc123", "G-", "G-AB", "G-ABC 123", "G-ABC123;alert(1)", "G-" + "A".repeat(30)]) {
    assert.equal(isAnalyticsEnabled({ ...open, GA4_MEASUREMENT_ID: id }), false, String(id));
  }
  const id = { GA4_MEASUREMENT_ID: "G-ABC123XYZ" };
  for (const env of [{}, { PUBLIC_DATABASE_TARGET: "staging", ALLOW_INDEXING: "true", SITE_URL: open.SITE_URL }, { PUBLIC_DATABASE_TARGET: "production", SITE_URL: open.SITE_URL }, { PUBLIC_DATABASE_TARGET: "production", ALLOW_INDEXING: "true" }]) {
    const cfg = getAnalyticsConfig({ ...env, ...id });
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.measurementId, null);
  }
});
