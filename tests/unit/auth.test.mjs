import assert from "node:assert/strict";
import test from "node:test";
import { getAuthConfig } from "../../src/server/auth/config.mjs";
import { isSafeCallback, authPaths, isLiveSession, IDLE_SESSION_MS, ABSOLUTE_SESSION_MS } from "../../src/server/auth/policy.mjs";

const env = { BETTER_AUTH_SECRET: "a".repeat(48), BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://tiny_osaka_dev_app:synthetic-value@127.0.0.1:5432/tiny_osaka_dev" };
test("auth configuration rejects missing secret, remote origin and privileged DB login", () => {
  assert.equal(getAuthConfig(env).baseURL, "http://localhost:3000");
  assert.equal(getAuthConfig({ ...env, BETTER_AUTH_URL: "https://localhost:3000" }).baseURL, "https://localhost:3000");
  for (const change of [{ BETTER_AUTH_SECRET: "short" }, { BETTER_AUTH_SECRET: undefined },
    { BETTER_AUTH_URL: "https://example.invalid" }, { BETTER_AUTH_URL: "http://localhost:3000/evil" },
    { BETTER_AUTH_URL: "http://user:secret@localhost:3000" }, { DATABASE_URL: env.DATABASE_URL.replace("_app:", "_migrator:") }]) {
    assert.throws(() => getAuthConfig({ ...env, ...change }), error => !error.message.includes("synthetic-value"));
  }
});
test("callbacks only reach internal CMS paths; registration and user mutation are not routed", () => {
  for (const value of ["/admin", "/admin/security", "http://localhost:3000/admin/reset-password"]) assert.ok(isSafeCallback(value, env.BETTER_AUTH_URL));
  for (const value of ["https://evil.invalid/admin", "//evil.invalid/admin", "javascript:alert(1)", "/administer", "/id", "http://user:pass@localhost:3000/admin"]) assert.equal(isSafeCallback(value, env.BETTER_AUTH_URL), false);
  for (const path of ["/sign-up/email", "/update-user", "/change-email", "/sign-in/social", "/two-factor/get-backup-codes"]) assert.equal(authPaths.has(path), false);
});
test("session boundary policy rejects exact idle/absolute expiry and malformed clocks", () => {
  const now = new Date("2026-10-16T00:00:00Z");
  const session = { createdAt: new Date(+now - 10000), expiresAt: new Date(+now + 10000) };
  assert.ok(isLiveSession(session, now, now));
  assert.equal(isLiveSession(session, new Date(+now - IDLE_SESSION_MS), now), false);
  assert.equal(isLiveSession({ ...session, createdAt: new Date(+now - ABSOLUTE_SESSION_MS) }, now, now), false);
  assert.equal(isLiveSession({ ...session, expiresAt: now }, now, now), false);
  assert.equal(isLiveSession(session, new Date(+now + 1000), now), false);
  assert.equal(isLiveSession(session, "invalid", now), false);
});
