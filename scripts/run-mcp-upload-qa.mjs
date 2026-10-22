import { spawn } from "node:child_process";
import { unlink } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { callAuth, cookieJar, createAuthFixture } from "../tests/fixtures/auth.mjs";
import { assertEmptyTestDatabase, cleanupPublicFixture, emptyTracking } from "../tests/fixtures/published-data.mjs";
import { buildMcp } from "../src/server/mcp/compose.mjs";
import { storageRoot } from "../src/server/media/storage.mjs";
import { validStorageKey } from "../src/server/media/validation.mjs";
import { verifyCmsProtection } from "./lib/cms-protection.mjs";

// Owner photo-upload page (Q-5, AC-28). Tokens are minted through the same server module as the integration tests
// (buildMcp().uploads.request), one set per viewport project, and handed to Playwright through QA_MCP_UPLOAD_URLS.
// Runs against the local test database only (guarded by the test migrator/owner connection), never production.
const TARGET = "menu:roti-bakar";
const STALE_MS = 16 * 60 * 1000; // a token minted this long ago is past its 15-minute user TTL

const mintSet = async ({ live, stale, actor }) => {
  const view = await live.uploads.request(actor, { target: TARGET });
  const png = await live.uploads.request(actor, { target: TARGET, mime: "image/png" });
  const jpg = await live.uploads.request(actor, { target: TARGET, mime: "image/jpeg" });
  const notImage = await live.uploads.request(actor, { target: TARGET, mime: "image/jpeg" });
  const expired = await stale.uploads.request(actor, { target: TARGET });
  const usedFlow = await live.uploads.request(actor, { target: TARGET });
  const ids = { view: view.uploadId, png: png.uploadId, jpg: jpg.uploadId, notImage: notImage.uploadId, expired: expired.uploadId, usedFlow: usedFlow.uploadId };
  const urls = { view: view.userUploadUrl, png: png.userUploadUrl, jpg: jpg.userUploadUrl, notImage: notImage.userUploadUrl,
    expired: expired.userUploadUrl, usedAgent: usedFlow.agentUploadUrl, usedUser: usedFlow.userUploadUrl };
  return { ids, urls };
};

// Outcome read back from the database after the browser run (the spec cannot see the rows itself).
const verifyOutcomes = async (owner, ids) => {
  const rows = (await owner.query("SELECT id,status,failure_code,asset_id,agent_used_at,user_used_at FROM cms_auth.mcp_uploads WHERE id=ANY($1::uuid[])",
    [Object.values(ids)])).rows;
  const byId = new Map(rows.map(row => [row.id, row]));
  const row = key => byId.get(ids[key]);
  assert.equal(row("view").status, "pending", "view token must not be consumed by viewing or by the anonymous POST");
  assert.equal(row("view").user_used_at, null); assert.equal(row("view").agent_used_at, null);
  assert.equal(row("expired").user_used_at, null, "expired token must not be consumed");
  for (const key of ["png", "jpg"]) {
    assert.equal(row(key).status, "done", key + " status");
    assert.notEqual(row(key).asset_id, null, key + " asset");
  }
  assert.equal(row("notImage").status, "rejected"); assert.equal(row("notImage").failure_code, "NOT_IMAGE");
  assert.equal(row("usedFlow").status, "done"); assert.notEqual(row("usedFlow").agent_used_at, null); assert.equal(row("usedFlow").user_used_at, null);
  const assetIds = [row("png").asset_id, row("jpg").asset_id, row("usedFlow").asset_id];
  const assets = (await owner.query("SELECT id,kind FROM public.media_assets WHERE id=ANY($1::uuid[])", [assetIds])).rows;
  assert.equal(assets.length, 3, "one media asset per completed upload");
  assert.ok(assets.every(asset => asset.kind === "image"), "completed uploads must be image assets");
  return assetIds;
};

const runBrowser = (env, project) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.mcp-upload.config.mjs", "--project=" + project],
    { env, stdio: "inherit", windowsHide: true });
  child.on("error", reject);
  child.on("exit", code => code === 0 ? resolve() : reject(new Error("MCP upload browser QA failed on " + project + ": " + code)));
});

const fixture = await createAuthFixture();
const assetIds = [], failures = [];
try {
  await fixture.owner.query("SELECT pg_advisory_lock(76210992)");
  await assertEmptyTestDatabase(fixture.owner);
  await verifyCmsProtection(fixture.owner, "tiny_osaka_test_owner");
  const [owner, staff] = fixture.accounts;
  const common = { pool: fixture.pool, consume: fixture.service.consume, baseURL: fixture.env.BETTER_AUTH_URL,
    authenticateSession: headers => fixture.service.authenticate(headers),
    cmsFor: () => { throw new Error("CMS services are not used by uploads.request"); }, refreshPublic: () => {} };
  const live = buildMcp({ ...common, now: () => new Date() });
  const stale = buildMcp({ ...common, now: () => new Date(Date.now() - STALE_MS) });
  const client = await live.clients.create({ createdBy: owner.id, input: { name: "QA upload page", redirectUris: ["http://127.0.0.1:41234/callback"] } });
  const actor = { subject: owner.id, clientId: client.clientId };

  // Browser sessions are injected as cookies (one sign-in each, same server path as the integration tests) so the
  // login rate limit is not spent on every test; the UI login is still exercised once per project by the spec.
  const sessionCookies = async account => {
    const jar = cookieJar();
    assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar)).status, 200, "sign-in");
    return jar.header().split("; ").filter(Boolean).map(pair => { const i = pair.indexOf("="); return { name: pair.slice(0, i), value: pair.slice(i + 1), url: fixture.env.BETTER_AUTH_URL }; });
  };
  const sessions = { owner: await sessionCookies(owner), staff: await sessionCookies(staff) };
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/DATABASE|MIGRAT|PASSWORD|SECRET|TOKEN|API_KEY|NODE_OPTIONS/i.test(key)));
  Object.assign(env, { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL, TEST_CMS_DATABASE_URL: process.env.TEST_CMS_DATABASE_URL,
    PUBLIC_DATABASE_TARGET: "test", PUBLIC_CONTENT_SOURCE: "published", BETTER_AUTH_SECRET: fixture.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: fixture.env.BETTER_AUTH_URL, NEXT_TELEMETRY_DISABLED: "1", QA_AUTH_OWNER_EMAIL: owner.email,
    QA_AUTH_STAFF_EMAIL: staff.email, QA_AUTH_PASSWORD: fixture.password, QA_MCP_SESSIONS: JSON.stringify(sessions) });

  for (const project of ["desktop", "mobile", "small-mobile"]) {
    await fixture.expireLimits();
    const { ids, urls } = await mintSet({ live, stale, actor });
    env.QA_AUTH_PROJECT = project;
    env.QA_MCP_UPLOAD_URLS = JSON.stringify(urls);
    // Every project runs even if an earlier one failed; the failures are reported together at the end.
    try { await runBrowser(env, project); } catch (error) { failures.push(error.message); }
    try { assetIds.push(...await verifyOutcomes(fixture.owner, ids)); } catch (error) { failures.push(project + " outcomes: " + error.message); }
  }
  if (failures.length) throw new Error(failures.join("\n"));
} finally {
  try {
    // Assets created by the real upload path are committed (not rolled back): remove the files and rows this run created.
    const created = (await fixture.owner.query("SELECT DISTINCT a.id,a.storage_key FROM public.media_assets a WHERE a.id IN (SELECT asset_id FROM cms_auth.mcp_uploads WHERE user_id=ANY($1::text[]) AND asset_id IS NOT NULL)", [fixture.accounts.map(account => account.id)])).rows;
    for (const asset of created) {
      if (asset.storage_key && validStorageKey(asset.storage_key)) await unlink(path.join(storageRoot({ PUBLIC_DATABASE_TARGET: "test" }), asset.storage_key)).catch(() => {});
    }
    const tracked = emptyTracking(); tracked.assets = created.map(asset => asset.id);
    await cleanupPublicFixture(fixture.owner, tracked);
    await verifyCmsProtection(fixture.owner, "tiny_osaka_test_owner");
    await assertEmptyTestDatabase(fixture.owner);
  } finally { await fixture.cleanup(); }
}
