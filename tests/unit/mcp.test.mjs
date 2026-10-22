import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { generateSecret, hashSecret, hasSecretShape, verifyPkce, challengeFor, normalizeScope, hasScope, isSubsetScope, expiryFor, isLive,
  createTokenStore, ACCESS_TTL_MS, REFRESH_IDLE_MS, FAMILY_TTL_MS, CODE_TTL_MS } from "../../src/server/mcp/tokens.mjs";
import { parseRedirectUri, redirectMatches, parseClientInput } from "../../src/server/mcp/clients.mjs";
import { schemas, parseToolInput, describeFailure, listTools, toolNames, tools } from "../../src/server/mcp/tools.mjs";
import { buildProtectedResourceMetadata, buildAuthorizationServerMetadata } from "../../src/server/mcp/oauth.mjs";
import { createBearerAuth, wwwAuthenticate } from "../../src/server/mcp/auth.mjs";
import { createMcpHandler } from "../../src/server/mcp/server.mjs";
import { MCP_RULES } from "../../src/server/mcp/limits.mjs";
import { buildHeaderRules, buildCsp } from "../../src/server/security/headers.mjs";
import { CmsRequestError } from "../../src/server/cms/request-policy.mjs";
import { createUploads, stateOf, uploadMessage, UPLOAD_HEADERS, UPLOAD_MESSAGES } from "../../src/server/mcp/uploads.mjs";
import { MediaError } from "../../src/server/media/validation.mjs";

const BASE = "http://127.0.0.1:3033";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const code = async run => { try { await run(); } catch (error) { return error.code; } return null; };

test("PKCE S256: RFC 7636 vector passes; wrong verifier, plain, short/odd verifiers and bad challenges fail", () => {
  assert.equal(challengeFor(VERIFIER), CHALLENGE);
  assert.equal(verifyPkce(VERIFIER, CHALLENGE), true);
  assert.equal(verifyPkce(VERIFIER.slice(0, -1) + "A", CHALLENGE), false);
  assert.equal(verifyPkce(CHALLENGE, CHALLENGE), false, "plain-style use of the challenge as verifier");
  assert.equal(verifyPkce("short", challengeFor("short")), false);
  assert.equal(verifyPkce("a".repeat(129), challengeFor("a".repeat(129))), false);
  assert.equal(verifyPkce("a".repeat(42) + "!", challengeFor("a".repeat(42) + "!")), false);
  for (const bad of [VERIFIER, "", null, undefined, "x".repeat(44)]) assert.equal(verifyPkce(VERIFIER, bad), false);
  assert.equal(verifyPkce(undefined, CHALLENGE), false);
  assert.equal(verifyPkce("a".repeat(128), challengeFor("a".repeat(128))), true);
});

test("opaque secrets are 256-bit, kind-prefixed, hashed with SHA-256 and shape-checked", () => {
  const access = generateSecret("access"), refresh = generateSecret("refresh"), authorization = generateSecret("code");
  assert.match(access, /^tomcp_at_[A-Za-z0-9_-]{43}$/); assert.match(refresh, /^tomcp_rt_[A-Za-z0-9_-]{43}$/); assert.match(authorization, /^tomcp_ac_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(generateSecret("access"), access);
  assert.equal(hashSecret("abc"), createHash("sha256").update("abc").digest("hex"));
  assert.match(hashSecret(access), /^[0-9a-f]{64}$/); assert.notEqual(hashSecret(access), access);
  assert.equal(hasSecretShape("access", access), true);
  assert.equal(hasSecretShape("refresh", access), false);
  for (const bad of [undefined, null, "", "tomcp_at_short", access + "x", access.replace("tomcp_at_", "Bearer ")]) assert.equal(hasSecretShape("access", bad), false);
});

test("TTL rules: access 15 min, refresh idle 1 h, family 24 h, code 60 s; nothing outlives the family", () => {
  assert.equal(ACCESS_TTL_MS, 900000); assert.equal(REFRESH_IDLE_MS, 3600000); assert.equal(FAMILY_TTL_MS, 86400000); assert.equal(CODE_TTL_MS, 60000);
  const now = new Date("2026-01-01T00:00:00Z");
  const family = new Date(now.getTime() + FAMILY_TTL_MS);
  const early = expiryFor(now, family);
  assert.equal(early.access.getTime() - now.getTime(), ACCESS_TTL_MS); assert.equal(early.refresh.getTime() - now.getTime(), REFRESH_IDLE_MS);
  const late = expiryFor(new Date(family.getTime() - 5 * 60000), family);
  assert.equal(late.access.getTime(), family.getTime()); assert.equal(late.refresh.getTime(), family.getTime());
  const row = { revoked_at: null, expires_at: new Date(now.getTime() + 1000), family_expires_at: family };
  assert.equal(isLive(row, now), true);
  assert.equal(isLive(row, new Date(now.getTime() + 1000)), false, "expired at the boundary");
  assert.equal(isLive({ ...row, revoked_at: now }, now), false);
  assert.equal(isLive({ ...row, family_expires_at: now }, now), false);
});

test("scope normalization, subset and membership logic", () => {
  assert.equal(normalizeScope(undefined), "mcp:read mcp:write");
  assert.equal(normalizeScope("mcp:write mcp:read"), "mcp:read mcp:write");
  assert.equal(normalizeScope("mcp:read"), "mcp:read");
  for (const bad of ["admin", "mcp:read admin", "mcp:delete", 5, "x".repeat(65)]) assert.equal(normalizeScope(bad), null);
  assert.equal(hasScope("mcp:read", "mcp:write"), false); assert.equal(hasScope("mcp:read mcp:write", "mcp:write"), true);
  assert.equal(isSubsetScope("mcp:read", "mcp:read mcp:write"), true); assert.equal(isSubsetScope("mcp:write", "mcp:read"), false);
});

test("redirect URI validator: https or loopback only, exact match, loopback port free, dangerous schemes rejected", () => {
  for (const ok of ["https://client.example/callback", "http://127.0.0.1:4567/cb", "http://localhost/cb", "http://[::1]:8080/cb"]) assert.ok(parseRedirectUri(ok), ok);
  for (const bad of ["http://client.example/cb", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "myapp://cb", "https://a.example/cb#frag", "https://user:pw@a.example/cb",
    "https://a.example/cb\\x", "https://a.example/ cb", "", null, 5, "https://" + "a".repeat(2100) + ".example/"]) assert.equal(parseRedirectUri(bad), null, String(bad).slice(0, 30));
  const registered = ["https://client.example/callback", "http://127.0.0.1/cb"];
  assert.equal(redirectMatches(registered, "https://client.example/callback"), true);
  assert.equal(redirectMatches(registered, "https://client.example/callback/"), false);
  assert.equal(redirectMatches(registered, "https://client.example/callback?x=1"), false);
  assert.equal(redirectMatches(registered, "https://client.example:8443/callback"), false);
  assert.equal(redirectMatches(registered, "https://evil.example/callback"), false);
  assert.equal(redirectMatches(registered, "http://127.0.0.1:51234/cb"), true, "loopback port is free");
  assert.equal(redirectMatches(registered, "http://127.0.0.1:51234/other"), false);
  assert.equal(redirectMatches(registered, "http://localhost:51234/cb"), false, "host must match");
  assert.equal(redirectMatches(["https://client.example/callback"], "https://client.example:1/callback"), false, "no port freedom for https");
  assert.equal(redirectMatches(registered, undefined), false);
  assert.deepEqual(parseClientInput({ name: " Claude ", redirectUris: ["https://client.example/callback"] }), { name: "Claude", redirectUris: ["https://client.example/callback"] });
  for (const bad of [{ name: "", redirectUris: ["https://a.example/"] }, { name: "x", redirectUris: [] }, { name: "x", redirectUris: ["http://a.example/"] }, { name: "x", redirectUris: ["https://a.example/", "https://a.example/"] },
    { name: "x", redirectUris: ["https://a.example/"], authMethod: "client_secret_basic" }, { name: "<b>", redirectUris: ["https://a.example/"] }]) {
    assert.throws(() => parseClientInput(bad), error => ["INVALID_INPUT", "INVALID_NAME", "INVALID_REDIRECT_URI"].includes(error.code));
  }
});

test("14 tools only, in the approved set, each with a strict schema and listing metadata", () => {
  assert.deepEqual([...toolNames].sort(), ["media_get", "media_import_url", "media_list", "media_register_youtube", "media_upload_request", "media_upload_status", "menu_create", "menu_delete", "menu_list", "menu_update", "page_get", "page_list", "page_save", "page_update"]);
  assert.equal(listTools().length, 14);
  for (const item of listTools()) {
    assert.equal(item.inputSchema.type, "object"); assert.equal(item.inputSchema.additionalProperties, false, item.name); assert.ok(!("$schema" in item.inputSchema));
  }
  assert.ok(toolNames.every(name => !/sync|merchant|account/.test(name)));
  assert.deepEqual(toolNames.filter(name => tools[name].write).sort(), ["media_import_url", "media_register_youtube", "media_upload_request", "menu_create", "menu_delete", "menu_update", "page_save", "page_update"]);
  assert.ok(toolNames.filter(name => !tools[name].write).every(name => tools[name].scope === "mcp:read"));
  assert.ok(toolNames.filter(name => tools[name].write).every(name => tools[name].scope === "mcp:write" && (tools[name].refresh || ["media_upload_request", "media_import_url"].includes(name))));
  assert.equal(tools.media_upload_request.refresh, false, "a request alone changes no public content");
});

test("tool input schemas reject extra fields, bad types and oversized values with CMS-compatible codes", async () => {
  const uuid = randomUUID(), slug = "salad-segar", version = "a".repeat(64);
  assert.deepEqual(parseToolInput("menu_list", {}), {}); assert.deepEqual(parseToolInput("menu_list", undefined), {});
  assert.equal(await code(() => parseToolInput("menu_list", { extra: 1 })), "INVALID_INPUT");
  assert.deepEqual(parseToolInput("menu_create", { name: "Takoyaki", price: 25000 }), { name: "Takoyaki", price: 25000 });
  for (const [args, expected] of [
    [{ name: "A", price: 1.5 }, "INVALID_PRICE"], [{ name: "A", price: -1 }, "INVALID_PRICE"], [{ name: "A", price: "100" }, "INVALID_PRICE"], [{ name: "A" }, "INVALID_PRICE"],
    [{ name: "", price: 1 }, "INVALID_NAME"], [{ name: "x".repeat(121), price: 1 }, "INVALID_NAME"], [{ name: 5, price: 1 }, "INVALID_NAME"],
    [{ name: "A", price: 1, description: "x".repeat(1001) }, "INVALID_DESCRIPTION"], [{ name: "A", price: 1, imageAssetId: "not-a-uuid", imageAlt: "x" }, "INVALID_IMAGE"],
    [{ name: "A", price: 1, imageAssetId: uuid, imageAlt: "x".repeat(501) }, "INVALID_IMAGE_ALT"],
    [{ name: "A", price: 1, grabfoodUrl: "https://x.example" }, "INVALID_INPUT"], [{ name: "A", price: 1, categoryId: uuid }, "INVALID_INPUT"], [{ name: "A", price: 1, role: "owner" }, "INVALID_INPUT"],
  ]) assert.equal(await code(() => parseToolInput("menu_create", args)), expected, JSON.stringify(args).slice(0, 80));
  assert.deepEqual(parseToolInput("menu_create", { name: "A", price: 0, imageAssetId: uuid, imageAlt: "Foto" }), { name: "A", price: 0, imageAssetId: uuid, imageAlt: "Foto" });
  assert.ok(parseToolInput("menu_update", { slug, expectedVersion: version, name: "A", price: 5, imageAssetId: null, imageAlt: null }));
  // Partial update (Q-1): only slug is required, expectedVersion is optional and absent keys stay absent.
  assert.deepEqual(parseToolInput("menu_update", { slug, price: 5 }), { slug, price: 5 });
  assert.deepEqual(parseToolInput("menu_update", { slug, description: "" }), { slug, description: "" });
  for (const args of [{ name: "A", price: 5, expectedVersion: version }, { slug: "Bad Slug", expectedVersion: version, name: "A", price: 5 },
    { slug, expectedVersion: "short", name: "A", price: 5 }, { slug, expectedVersion: version, name: "A", price: 5, extra: true }]) {
    assert.ok(["INVALID_INPUT"].includes(await code(() => parseToolInput("menu_update", args))), JSON.stringify(args).slice(0, 60));
  }
  assert.equal(await code(() => parseToolInput("page_get", { pageKey: "home", extra: 1 })), "INVALID_INPUT");
  assert.equal(await code(() => parseToolInput("page_get", {})), "INVALID_INPUT");
  const save = { pageKey: "about", expectedRevisionId: null, expectedVersion: 0, fields: { title: "x" }, mediaOperations: [] };
  assert.deepEqual(parseToolInput("page_save", save), save);
  assert.deepEqual(parseToolInput("page_save", { ...save, mediaOperations: undefined }).mediaOperations, []);
  for (const bad of [{ ...save, expectedRevisionId: "nope" }, { ...save, expectedVersion: -1 }, { ...save, expectedVersion: 1.2 }, { ...save, fields: "x" }, { ...save, fields: [] },
    { ...save, mediaOperations: Array.from({ length: 25 }, () => ({ action: "mediaRemove" })) }, { ...save, extra: 1 }, { pageKey: "about" }]) {
    assert.equal(await code(() => parseToolInput("page_save", bad)), "INVALID_INPUT");
  }
  // page_update (Q-3): only pageKey is required; expected revision/version are not accepted as input.
  assert.deepEqual(parseToolInput("page_update", { pageKey: "about" }), { pageKey: "about" });
  assert.deepEqual(parseToolInput("page_update", { pageKey: "about", fields: { title: "x" }, mediaOperations: [] }), { pageKey: "about", fields: { title: "x" }, mediaOperations: [] });
  for (const bad of [{}, { pageKey: "" }, { pageKey: "about", expectedVersion: 0 }, { pageKey: "about", expectedRevisionId: null }, { pageKey: "about", fields: "x" }, { pageKey: "about", extra: 1 }]) {
    assert.equal(await code(() => parseToolInput("page_update", bad)), "INVALID_INPUT", JSON.stringify(bad));
  }
  assert.deepEqual(parseToolInput("media_list", {}), {}); assert.deepEqual(parseToolInput("media_list", { offset: 48 }), { offset: 48 });
  for (const bad of [{ offset: -1 }, { offset: 100001 }, { offset: 1.5 }, { offset: "1" }, { page: 1 }]) assert.equal(await code(() => parseToolInput("media_list", bad)), "INVALID_INPUT");
  assert.equal(await code(() => parseToolInput("media_get", { id: "x" })), "INVALID_INPUT");
  assert.deepEqual(parseToolInput("media_register_youtube", { videoId: "Abc_123-xyz", posterId: uuid }), { videoId: "Abc_123-xyz", posterId: uuid });
  assert.equal(await code(() => parseToolInput("media_register_youtube", { videoId: "Abc_123-xyz" })), "INVALID_INPUT");
  assert.ok(Object.keys(schemas).length === 14);
});

test("menu_delete input: confirmName is mandatory text; any wrong, empty, missing or non-string value maps to CONFIRM_NAME_MISMATCH", async () => {
  assert.deepEqual(parseToolInput("menu_delete", { slug: "salad", confirmName: "Salad" }), { slug: "salad", confirmName: "Salad" });
  assert.deepEqual(parseToolInput("menu_delete", { slug: "salad", confirmName: "" }), { slug: "salad", confirmName: "" }, "empty reaches the server comparison, which rejects it");
  for (const args of [{ slug: "salad" }, { slug: "salad", confirmName: 5 }, { slug: "salad", confirmName: null }, { slug: "salad", confirmName: "x".repeat(201) }]) {
    assert.equal(await code(() => parseToolInput("menu_delete", args)), "CONFIRM_NAME_MISMATCH", JSON.stringify(args));
  }
  assert.equal(await code(() => parseToolInput("menu_delete", { confirmName: "Salad" })), "INVALID_INPUT");
  assert.equal(await code(() => parseToolInput("menu_delete", { slug: "salad", confirmName: "Salad", force: true })), "INVALID_INPUT");
  const source = readFileSync("src/server/cms/catalog.mjs", "utf8");
  assert.match(source, /confirmName !== card\.name\) cmsFail\("CONFIRM_NAME_MISMATCH", 400\)/, "comparison is exact and happens before deleteProduct");
  assert.ok(source.indexOf("CONFIRM_NAME_MISMATCH") < source.indexOf("await deleteProduct"));
});

test("failure mapping exposes only stable codes and statuses, never messages or stacks", () => {
  assert.deepEqual(describeFailure(new CmsRequestError("INVALID_PRICE", 400)), { code: "INVALID_PRICE", status: 400 });
  assert.deepEqual(describeFailure(new CmsRequestError("PRODUCT_CONFLICT", 409)), { code: "PRODUCT_CONFLICT", status: 409 });
  assert.deepEqual(describeFailure(Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432 password=secret"), { code: "ECONNREFUSED" })), { code: "CMS_UNAVAILABLE", status: 503 });
  assert.deepEqual(describeFailure(new TypeError("boom")), { code: "CMS_UNAVAILABLE", status: 503 });
  assert.ok(!JSON.stringify(describeFailure(Object.assign(new Error("secret"), { code: "23505" }))).includes("secret"));
});

test("OAuth metadata lists only existing endpoints, S256 and public clients", () => {
  const resource = buildProtectedResourceMetadata(BASE), server = buildAuthorizationServerMetadata(BASE);
  assert.equal(resource.resource, BASE + "/api/mcp"); assert.deepEqual(resource.authorization_servers, [BASE]); assert.deepEqual(resource.bearer_methods_supported, ["header"]);
  assert.deepEqual(server.code_challenge_methods_supported, ["S256"]); assert.deepEqual(server.token_endpoint_auth_methods_supported, ["none"]);
  assert.deepEqual(server.grant_types_supported, ["authorization_code", "refresh_token"]); assert.deepEqual(server.response_types_supported, ["code"]);
  assert.equal(server.issuer, BASE);
  for (const key of ["authorization_endpoint", "token_endpoint", "revocation_endpoint"]) assert.ok(server[key].startsWith(BASE + "/api/mcp/oauth/"));
  assert.ok(!("registration_endpoint" in server));
  assert.deepEqual(resource.scopes_supported, ["mcp:read", "mcp:write"]);
  assert.equal(wwwAuthenticate(BASE, "invalid_token"), `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource", error="invalid_token"`);
});

test("rate-limit rules match the spec starting points", () => {
  assert.deepEqual({ ...MCP_RULES.authorize }, { window: 60, max: 20 }); assert.deepEqual({ ...MCP_RULES.token }, { window: 60, max: 20 });
  assert.deepEqual({ ...MCP_RULES.call }, { window: 60, max: 60 }); assert.deepEqual({ ...MCP_RULES.write }, { window: 60, max: 20 });
});

// A scripted pool/client: records statements and answers by SQL text.
const scriptedPool = answers => {
  const calls = [];
  const run = async (text, values) => {
    calls.push({ text, values });
    const key = Object.keys(answers).find(item => text.includes(item));
    return key ? (typeof answers[key] === "function" ? answers[key](values) : answers[key]) : { rows: [], rowCount: 0 };
  };
  const client = { query: run, release() {} };
  return { query: run, connect: async () => client, calls };
};
const refreshRow = (over = {}) => ({ id: randomUUID(), kind: "refresh", family_id: randomUUID(), client_id: "mcpc_a", user_id: "u1", scope: "mcp:read mcp:write", resource: BASE + "/api/mcp",
  expires_at: new Date(Date.now() + 3600000), family_expires_at: new Date(Date.now() + 7200000), revoked_at: null, replaced_by: null, ...over });

test("refresh rotation: success rotates and links the pair; reuse revokes the family; expired, foreign-client, malformed and over-scoped are refused", async () => {
  const token = generateSecret("refresh");
  const live = refreshRow();
  let pool = scriptedPool({ "FROM cms_auth.oauth_tokens WHERE token_hash": { rows: [live], rowCount: 1 } });
  let store = createTokenStore({ pool });
  const ok = await store.rotate(token, { clientId: "mcpc_a" });
  assert.equal(ok.ok, true); assert.match(ok.tokens.access, /^tomcp_at_/); assert.match(ok.tokens.refresh, /^tomcp_rt_/); assert.equal(ok.tokens.expiresIn, 900);
  assert.ok(pool.calls.some(call => /SET replaced_by/.test(call.text)), "old refresh points to its replacement");
  assert.equal(pool.calls.filter(call => /INSERT INTO cms_auth.oauth_tokens/.test(call.text)).length, 2);
  assert.ok(pool.calls.some(call => call.text === "COMMIT"));
  for (const call of pool.calls.filter(item => /INSERT INTO/.test(item.text))) assert.ok(!call.values.includes(ok.tokens.access) && !call.values.includes(ok.tokens.refresh), "plaintext never reaches SQL");

  const reused = refreshRow({ revoked_at: new Date(), replaced_by: randomUUID() });
  pool = scriptedPool({ "FROM cms_auth.oauth_tokens WHERE token_hash": { rows: [reused], rowCount: 1 } });
  store = createTokenStore({ pool });
  const reuse = await store.rotate(token, { clientId: "mcpc_a" });
  assert.equal(reuse.reason, "reuse");
  const revoke = pool.calls.find(call => /WHERE family_id=\$1 AND revoked_at IS NULL/.test(call.text));
  assert.deepEqual(revoke.values, [reused.family_id]); assert.equal(pool.calls.filter(call => /INSERT INTO/.test(call.text)).length, 0);

  const cases = [[refreshRow({ expires_at: new Date(Date.now() - 1000) }), "expired", {}], [refreshRow({ family_expires_at: new Date(Date.now() - 1000) }), "expired", {}],
    [refreshRow({ client_id: "mcpc_other" }), "invalid", {}], [refreshRow({ revoked_at: new Date() }), "revoked", {}], [refreshRow({ scope: "mcp:read" }), "scope", { scope: "mcp:read mcp:write" }],
    [refreshRow(), "invalid", { resource: "https://other.example/api/mcp" }]];
  for (const [row, reason, extra] of cases) {
    pool = scriptedPool({ "FROM cms_auth.oauth_tokens WHERE token_hash": { rows: [row], rowCount: 1 } });
    const result = await createTokenStore({ pool }).rotate(token, { clientId: "mcpc_a", ...extra });
    assert.equal(result.ok, false); assert.equal(result.reason, reason);
    assert.equal(pool.calls.filter(call => /INSERT INTO/.test(call.text)).length, 0);
  }
  pool = scriptedPool({});
  assert.equal((await createTokenStore({ pool }).rotate("garbage", { clientId: "mcpc_a" })).reason, "invalid");
  assert.equal(pool.calls.length, 0, "malformed refresh tokens never reach the database");
});

test("Bearer validation: malformed or absent tokens never touch the database; expiry, revocation, resource, disabled client and role checks apply", async () => {
  let pool = scriptedPool({});
  const tokens = { revokeUser: async () => {} };
  const auth = createBearerAuth({ pool, baseURL: BASE, tokens });
  const call = headers => auth.authenticate(new Request(BASE + "/api/mcp", { method: "POST", headers }));
  assert.deepEqual(await call({}), { ok: false, status: 401, error: undefined });
  assert.equal((await call({ authorization: "Bearer nope" })).status, 401);
  assert.equal((await call({ cookie: "better-auth.session_token=abc" })).status, 401, "cookie-only is not a credential");
  assert.equal((await call({ authorization: "Basic abc" })).status, 401);
  assert.equal(pool.calls.length, 0);
  const token = generateSecret("access");
  const row = (over = {}) => ({ id: randomUUID(), user_id: "u1", client_id: "mcpc_a", scope: "mcp:read", resource: BASE + "/api/mcp", expires_at: new Date(Date.now() + 60000),
    family_expires_at: new Date(Date.now() + 120000), revoked_at: null, disabled_at: null, role: "owner", enabled: true, ...over });
  const attempt = async over => {
    pool = scriptedPool({ "FROM cms_auth.oauth_tokens t": { rows: [row(over)], rowCount: 1 } });
    return createBearerAuth({ pool, baseURL: BASE, tokens }).authenticate(new Request(BASE + "/api/mcp", { method: "POST", headers: { authorization: "Bearer " + token } }));
  };
  const good = await attempt({});
  assert.equal(good.ok, true); assert.deepEqual({ ...good.actor, tokenId: undefined }, { subject: "u1", role: "owner", clientId: "mcpc_a", scope: "mcp:read", tokenId: undefined });
  assert.ok(pool.calls[0].values[0] === hashSecret(token) && !pool.calls[0].values.includes(token), "lookup by hash only");
  for (const [over, status] of [[{ expires_at: new Date(Date.now() - 1) }, 401], [{ family_expires_at: new Date(Date.now() - 1) }, 401], [{ revoked_at: new Date() }, 401],
    [{ disabled_at: new Date() }, 401], [{ resource: "https://other.example/api/mcp" }, 401], [{ enabled: false }, 401], [{ enabled: null, role: null }, 401], [{ role: "staff" }, 403]]) {
    assert.equal((await attempt(over)).status, status, JSON.stringify(over));
  }
  pool = scriptedPool({ "FROM cms_auth.oauth_tokens t": { rows: [], rowCount: 0 } });
  assert.equal((await createBearerAuth({ pool, baseURL: BASE, tokens }).authenticate(new Request(BASE + "/api/mcp", { headers: { authorization: "Bearer " + token } }))).status, 401);
});

test("MCP endpoint order: Origin, method, Bearer before any CMS access or body parsing", async () => {
  let cmsTouched = 0, audits = [];
  const limits = { hit: async () => ({ allowed: true }) };
  const audit = { safe: async entry => { audits.push(entry); } };
  const bearer = { authenticate: async request => request.headers.get("authorization") === "Bearer ok" ? { ok: true, actor: { subject: "u1", clientId: "mcpc_a", scope: "mcp:read" } } : { ok: false, status: 401, error: "invalid_token" } };
  const handler = createMcpHandler({ baseURL: BASE, bearer, limits, audit, cmsFor: () => { cmsTouched++; throw new Error("must not run"); } });
  const post = (headers, body = { jsonrpc: "2.0", id: 1, method: "tools/list" }) => handler.handle(new Request(BASE + "/api/mcp", { method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) }));
  let response = await post({});
  assert.equal(response.status, 401); assert.match(response.headers.get("www-authenticate"), /resource_metadata=".*\/\.well-known\/oauth-protected-resource"/);
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.match(response.headers.get("x-robots-tag"), /noindex/);
  assert.equal((await post({ cookie: "session=1" })).status, 401);
  assert.equal((await post({ origin: "https://evil.example", authorization: "Bearer ok" })).status, 403);
  assert.equal((await handler.handle(new Request(BASE + "/api/mcp", { method: "GET", headers: { authorization: "Bearer ok" } }))).status, 405);
  assert.equal((await handler.handle(new Request(BASE + "/api/mcp", { method: "DELETE", headers: { authorization: "Bearer ok" } }))).status, 405);
  assert.equal(cmsTouched, 0);
  response = await post({ authorization: "Bearer ok", origin: BASE });
  assert.equal(response.status, 200);
  const listed = await response.json();
  assert.equal(listed.result.tools.length, 14);
  assert.equal(cmsTouched, 0, "listing tools needs no CMS access");
  assert.equal((await post({ authorization: "Bearer ok" }, [{ jsonrpc: "2.0", id: 1, method: "tools/list" }])).status, 400, "batches are refused");
  assert.equal((await handler.handle(new Request(BASE + "/api/mcp", { method: "POST", headers: { authorization: "Bearer ok", "content-type": "text/plain" }, body: "x" }))).status, 415);
  assert.equal((await handler.handle(new Request(BASE + "/api/mcp", { method: "POST", headers: { authorization: "Bearer ok", "content-type": "application/json" }, body: "x".repeat(80001) }))).status, 413);
  assert.ok(audits.some(entry => entry.event === "request_denied"));
  // Insufficient scope is refused in-band and never reaches the CMS.
  const write = await (await post({ authorization: "Bearer ok" }, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "menu_create", arguments: { name: "A", price: 1 } } })).json();
  assert.equal(write.result.isError, true); assert.equal(JSON.parse(write.result.content[0].text).code, "INSUFFICIENT_SCOPE"); assert.equal(cmsTouched, 0);
  const unknown = await (await post({ authorization: "Bearer ok" }, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "toString", arguments: {} } })).json();
  assert.equal(JSON.parse(unknown.result.content[0].text).code, "UNKNOWN_TOOL");
});

test("security headers: only noindex for /.well-known is added; CSP (form-action 'self') is unchanged", () => {
  const rules = buildHeaderRules({ PUBLIC_DATABASE_TARGET: "dev" });
  const wellKnown = rules.find(rule => rule.source === "/.well-known/:path*");
  assert.deepEqual(wellKnown.headers, [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
  assert.match(buildCsp(), /form-action 'self'/); assert.match(buildCsp(), /frame-ancestors 'none'/); assert.ok(!/localhost|127\.0\.0\.1/.test(buildCsp()));
  assert.ok(rules.some(rule => rule.source === "/api/:path*"));
});

// Only net-guard.mjs may open outbound connections (media_import_url, AC-33..37). The three files below are excluded from the generic
// AC-22 text scan (net-guard dials out by design; import-url and thumbnails are the Q-6/Q-7 modules with their own tests), but every
// file except net-guard.mjs is still checked by the network-code test right after.
const MCP_DIR = "src/server/mcp";
const EXCLUDED_FROM_NETWORK_SCAN = Object.freeze({ "net-guard.mjs": "the single place that dials out (https.request, dns)", "import-url.mjs": "calls net-guard.fetchImage only; no sockets of its own",
  "thumbnails.mjs": "image resizing with sharp on stored media; no network" });
const CHECKED_MCP_FILES = readdirSync(MCP_DIR).filter(file => file.endsWith(".mjs") && !Object.hasOwn(EXCLUDED_FROM_NETWORK_SCAN, file)).map(file => file.slice(0, -4));
test("only net-guard.mjs dials out; every other MCP module (including the excluded ones) has no sockets, http, dns or fetch", () => {
  assert.ok(CHECKED_MCP_FILES.includes("uploads") && CHECKED_MCP_FILES.includes("tools") && !CHECKED_MCP_FILES.includes("net-guard"));
  const strip = file => readFileSync(`${MCP_DIR}/${file}`, "utf8").split(String.fromCharCode(10)).filter(line => !line.trim().startsWith("//")).join(" ");
  for (const file of readdirSync(MCP_DIR).filter(name => name.endsWith(".mjs") && name !== "net-guard.mjs")) {
    assert.ok(!/node:(https?|net|tls|dns|dgram|http2)|from "(https?|net|tls|dns)"|XMLHttpRequest|WebSocket/.test(strip(file)), file + " must not import network modules");
    assert.ok(!/(^|[^.\w])fetch\(/.test(strip(file)), file + " must not call fetch");
  }
  assert.match(strip("net-guard.mjs"), /node:https/);
  assert.match(readFileSync(`${MCP_DIR}/import-url.mjs`, "utf8"), /from "\.\/net-guard\.mjs"/);
});

test("no merchant client or outbound network code in the MCP module (AC-22)", () => {
  for (const file of CHECKED_MCP_FILES) {
    const lines = readFileSync(`src/server/mcp/${file}.mjs`, "utf8").split(String.fromCharCode(10));
    const source = lines.filter(line => !line.trim().startsWith("//")).join(" ");
    assert.ok(!/gofood|grabfood|shopeefood|merchant|axios|node-fetch|undici/i.test(source), file);
    assert.ok(!/(^|[^.\w])fetch\(/.test(source), file + " must not call fetch");
    assert.ok(!/NEXT_PUBLIC_|console\.(log|info|debug)/.test(source), file);
  }
});

test("AC-18: every tool description has Wajib, Otomatis/Opsional and Contoh, and names the schema fields", () => {
  for (const name of toolNames) {
    const { description } = tools[name];
    for (const part of ["Wajib", "Otomatis/Opsional", "Contoh"]) assert.ok(description.includes(part), name + " lacks " + part);
    const [required, rest] = description.split("Otomatis/Opsional");
    const shape = schemas[name].shape;
    for (const [key, field] of Object.entries(shape)) {
      assert.ok(description.includes(key), name + " does not mention " + key);
      if (!field.isOptional()) assert.ok(required.includes(key), name + " must list required " + key + " under Wajib");
    }
    const example = description.slice(description.indexOf("Contoh"));
    const json = example.match(/\{.*\}/)?.[0];
    if (json && Object.keys(shape).length && !json.includes("<")) for (const key of Object.keys(JSON.parse(json.replace(/\.$/, "")))) assert.ok(key in shape || key === "", name + " example uses unknown key " + key);
    assert.ok(rest.length > 0);
  }
  assert.match(tools.page_save.description, /DEPRECATED.*page_update/);
});

// ---- Q-5 photo upload (AC-19..AC-27, AC-29, AC-30): logic against an in-memory stand-in for cms_auth.mcp_uploads. ----
const OWNER = "owner-1", CLIENT = "mcpc_a";
const uploadsPool = state => {
  const rows = [];
  const reply = list => ({ rows: list, rowCount: list.length });
  const query = async (text, v) => {
    if (text.startsWith("INSERT INTO cms_auth.mcp_uploads")) {
      const row = { id: randomUUID(), user_id: v[0], client_id: v[1], agent_token_hash: v[2], user_token_hash: v[3], target: v[4], mime_declared: v[5],
        byte_size_declared: v[6] === null ? null : String(v[6]), asset_id: null, status: "pending", expires_at: v[7], created_at: v[8], agent_used_at: null, user_used_at: null, failure_code: null };
      rows.push(row); return reply([{ id: row.id }]);
    }
    if (text.includes("WHERE agent_token_hash=$1")) return reply(rows.filter(row => row.agent_token_hash === v[0]));
    if (text.includes("WHERE user_token_hash=$1")) return reply(rows.filter(row => row.user_token_hash === v[0]));
    if (text.includes("AND user_id=$2 AND client_id=$3")) return reply(rows.filter(row => row.id === v[0] && row.user_id === v[1] && row.client_id === v[2]));
    if (text.includes("FROM cms_auth.roles r")) return reply(state.ownerActive ? [{ ok: 1 }] : []);
    const row = rows.find(item => item.id === v[0]);
    if (!row) return reply([]);
    if (text.includes("SET status='rejected'")) {
      const needsUnclaimed = text.includes("AND agent_used_at IS NULL AND user_used_at IS NULL");
      if (row.status !== "pending" || (needsUnclaimed && (row.agent_used_at || row.user_used_at))) return reply([]);
      Object.assign(row, { status: "rejected", failure_code: v[1] }); return reply([row]);
    }
    if (text.includes("SET agent_used_at=$2") || text.includes("SET user_used_at=$2")) {
      const column = text.includes("SET agent_used_at=$2") ? "agent_used_at" : "user_used_at";
      if (row.status !== "pending" || row.agent_used_at || row.user_used_at || row.created_at.getTime() + v[2] < v[1].getTime() || row.expires_at < v[1]) return reply([]);
      row[column] = v[1]; return reply([row]);
    }
    if (text.includes("SET agent_used_at=NULL")) { if (row.status === "pending") Object.assign(row, { agent_used_at: null, user_used_at: null }); return reply([row]); }
    if (text.includes("status='rejected',failure_code='RECORD_FAILED'")) {
      if (state.failRecordFallback) throw new Error("db down");
      if (row.status === "pending") Object.assign(row, { status: "rejected", asset_id: v[1], failure_code: "RECORD_FAILED" }); return reply([row]);
    }
    if (text.includes("status='done'")) {
      if (state.failDone > 0) { state.failDone--; state.doneAttempts = (state.doneAttempts ?? 0) + 1; throw new Error("db down"); }
      state.doneAttempts = (state.doneAttempts ?? 0) + 1;
      const column = text.includes("agent_used_at IS NOT NULL") ? "agent_used_at" : "user_used_at";
      if (row.status !== "pending" || !row[column]) return reply([]);
      Object.assign(row, { status: "done", asset_id: v[1], failure_code: null }); return reply([row]);
    }
    throw new Error("unexpected SQL: " + text.slice(0, 60));
  };
  return { query, rows };
};
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const uploadHarness = (over = {}) => {
  const state = { ownerActive: true, session: { subject: OWNER, role: "owner" }, uploads: [], failWith: null, clock: 0, ...over };
  const pool = uploadsPool(state), audits = [], hits = [];
  const limits = { hit: async (name, subject) => { hits.push([name, subject]); return state.limited ? { allowed: false, retryAfter: 60 } : { allowed: true }; } };
  const cmsFor = actor => ({ media: { upload: async (headers, body, mime) => {
    state.uploads.push({ actor, mime, cookie: headers.get("cookie") });
    if (state.failWith) throw state.failWith;
    await new Promise(resolve => setTimeout(resolve, 5));
    return { id: randomUUID() };
  } } });
  const uploads = createUploads({ pool, baseURL: BASE, limits, audit: { safe: async entry => { audits.push(entry); } }, cmsFor,
    authenticateSession: async () => state.session, now: () => new Date(Date.now() + state.clock) });
  const actor = { subject: OWNER, clientId: CLIENT };
  const send = (url, { headers = {}, body = PNG, type = "image/png" } = {}) => uploads.handle(new Request(url, { method: "POST",
    headers: { "content-type": type, "content-length": String(body.length), ...headers }, body }), url.split("/").pop());
  return { state, pool, audits, hits, uploads, actor, post: send };
};
const bodyOf = async response => response.json();
const tokenOf = url => url.split("/").pop();
// multipart body as bytes + headers, the way a browser form or an HTTP client sends it
const multipart = async form => {
  const probe = new Request(BASE + "/x", { method: "POST", body: form });
  const bytes = new Uint8Array(await probe.arrayBuffer());
  return { type: probe.headers.get("content-type"), body: bytes };
};

test("Q-5 AC-19/20: a request returns two 256-bit URLs; only hashes are stored; nothing secret reaches audit", async () => {
  const h = uploadHarness();
  const made = await h.uploads.request(h.actor, { target: "menu:roti-bakar", mime: "image/png", byteSize: PNG.length });
  assert.match(made.uploadId, /^[0-9a-f-]{36}$/);
  const agentToken = tokenOf(made.agentUploadUrl), userToken = tokenOf(made.userUploadUrl);
  assert.equal(made.agentUploadUrl, `${BASE}/api/mcp/upload/${agentToken}`); assert.equal(made.userUploadUrl, `${BASE}/admin/mcp/upload/${userToken}`);
  assert.match(agentToken, /^tomcp_ug_[A-Za-z0-9_-]{43}$/); assert.match(userToken, /^tomcp_uu_[A-Za-z0-9_-]{43}$/);
  assert.equal(hasSecretShape("uploadAgent", userToken), false); assert.equal(hasSecretShape("uploadUser", agentToken), false);
  const [row] = h.pool.rows;
  assert.equal(row.agent_token_hash, hashSecret(agentToken)); assert.equal(row.user_token_hash, hashSecret(userToken));
  assert.ok(!JSON.stringify(row).includes(agentToken) && !JSON.stringify(row).includes(userToken));
  assert.equal(new Date(made.expiresAt).getTime() - row.created_at.getTime(), 15 * 60000);
  assert.deepEqual(Object.keys(made).sort(), ["agentUploadUrl", "expiresAt", "uploadId", "userUploadUrl"], "exactly the four AC-19 fields");
  assert.deepEqual(h.audits.map(entry => [entry.event, entry.target, entry.outcome]), [["upload_requested", "menu:roti-bakar", "ok"]]);
  assert.ok(!JSON.stringify(h.audits).includes("tomcp_u"));
  const later = new Date(row.created_at.getTime() + 5 * 60000 + 1);
  assert.equal(stateOf(row, "agent", later), "expired"); assert.equal(stateOf(row, "user", later), "ready");
});

test("Q-5 AC-19: upload request schema accepts only jpeg/png/webp, 1..10 MB and menu:/page: targets", async () => {
  assert.deepEqual(parseToolInput("media_upload_request", {}), {});
  assert.deepEqual(parseToolInput("media_upload_request", { target: "menu:roti-bakar", mime: "image/webp", byteSize: 10000000 }), { target: "menu:roti-bakar", mime: "image/webp", byteSize: 10000000 });
  assert.ok(parseToolInput("media_upload_request", { target: "page:guide-takoyaki" }));
  for (const bad of [{ mime: "image/gif" }, { mime: "video/mp4" }, { byteSize: 0 }, { byteSize: 10000001 }, { byteSize: 1.5 }, { byteSize: "5" }, { target: "menu:Bad Slug" },
    { target: "product:x" }, { target: "menu:" }, { target: "page:" + "a".repeat(65) }, { extra: 1 }]) {
    assert.equal(await code(() => parseToolInput("media_upload_request", bad)), "INVALID_INPUT", JSON.stringify(bad));
  }
  assert.equal(await code(() => parseToolInput("media_upload_status", { uploadId: "nope" })), "INVALID_INPUT");
  assert.ok(parseToolInput("media_upload_status", { uploadId: randomUUID() }));
  assert.equal(tools.media_upload_status.scope, "mcp:read"); assert.equal(tools.media_upload_request.scope, "mcp:write");
});

test("Q-5 AC-21/23/29: agent URL uploads once without cookie through the one CMS upload and answers with privacy headers", async () => {
  const h = uploadHarness();
  const made = await h.uploads.request(h.actor, {});
  const response = await h.post(made.agentUploadUrl, { headers: { cookie: "session=abc", authorization: "Bearer x" } });
  assert.equal(response.status, 200); const { assetId } = await bodyOf(response); assert.match(assetId, /^[0-9a-f-]{36}$/);
  for (const [key, value] of Object.entries(UPLOAD_HEADERS)) assert.equal(response.headers.get(key), value, key);
  assert.equal(h.state.uploads.length, 1); assert.equal(h.state.uploads[0].cookie, null, "the session cookie is ignored");
  assert.deepEqual([h.state.uploads[0].actor.subject, h.state.uploads[0].actor.role, h.state.uploads[0].mime], [OWNER, "owner", "image/png"]);
  assert.deepEqual(await h.uploads.status(h.actor, { uploadId: made.uploadId }), { status: "done", assetId });
  const again = await h.post(made.agentUploadUrl);
  assert.deepEqual([again.status, (await bodyOf(again)).code], [410, "TOKEN_USED"]); assert.equal(h.state.uploads.length, 1);
  const userPath = await h.post(made.userUploadUrl, { headers: { origin: BASE } });
  assert.deepEqual([userPath.status, (await bodyOf(userPath)).code], [410, "TOKEN_USED"], "the other path is closed once one path succeeded");
  assert.deepEqual(h.audits.map(entry => entry.event), ["upload_requested", "upload_completed"]);
});

test("Q-5 AC-26: the same token used at the same time yields exactly one upload", async () => {
  const h = uploadHarness();
  const made = await h.uploads.request(h.actor, {});
  const results = await Promise.all(Array.from({ length: 6 }, () => h.post(made.agentUploadUrl)));
  assert.deepEqual(results.map(response => response.status).sort(), [200, 410, 410, 410, 410, 410]);
  assert.equal(h.state.uploads.length, 1);
  const raced = await h.uploads.request(h.actor, {});
  const both = await Promise.all([h.post(raced.agentUploadUrl), h.post(raced.userUploadUrl, { headers: { origin: BASE } })]);
  assert.deepEqual(both.map(response => response.status).sort(), [200, 410]);
  assert.equal(h.state.uploads.length, 2, "agent and user paths exclude each other");
});

test("Q-5 AC-21/22/25: expired, unknown and malformed tokens are refused and consume nothing", async () => {
  const h = uploadHarness();
  const made = await h.uploads.request(h.actor, {});
  h.state.clock = 5 * 60000 + 1000;
  const late = await h.post(made.agentUploadUrl);
  assert.deepEqual([late.status, (await bodyOf(late)).code], [410, "TOKEN_EXPIRED"]);
  assert.equal(h.pool.rows[0].status, "pending"); assert.equal(h.pool.rows[0].agent_used_at, null);
  const userLate = await h.post(made.userUploadUrl, { headers: { origin: BASE } });
  assert.equal(userLate.status, 200, "the user page window is 15 minutes");
  const other = await h.uploads.request(h.actor, {});
  h.state.clock += 15 * 60000 + 1000;
  assert.equal((await h.post(other.userUploadUrl, { headers: { origin: BASE } })).status, 410);
  assert.deepEqual(await h.uploads.status(h.actor, { uploadId: other.uploadId }), { status: "expired" });
  for (const url of [`${BASE}/api/mcp/upload/${generateSecret("uploadAgent")}`, `${BASE}/api/mcp/upload/nope`, `${BASE}/api/mcp/upload/${generateSecret("access")}`]) {
    const unknown = await h.post(url); assert.deepEqual([unknown.status, (await bodyOf(unknown)).code], [404, "TOKEN_INVALID"]);
  }
  assert.ok(h.hits.some(([name]) => name === "uploadToken"), "wrong tokens are counted");
  // AC-30: the bucket is derived from the hash of the requested token's prefix (never the raw token, never one global key).
  const prefixed = h.hits.filter(([name]) => name === "uploadToken").map(([, subject]) => subject);
  assert.ok(prefixed.every(subject => /^[0-9a-f]{32}$/.test(subject)), "hashed prefix keys");
  assert.ok(prefixed.length >= 2 && new Set(prefixed).size >= 2, "different tokens use different buckets");
  assert.ok(!JSON.stringify(h.hits).includes("tomcp_u"), "no raw token in limiter keys");
  const same = h.hits.length;
  await h.post(`${BASE}/api/mcp/upload/tomcp_ug_AAAAAAAAAAAA-one`); await h.post(`${BASE}/api/mcp/upload/tomcp_ug_AAAAAAAAAAAA-two`);
  const [a, b] = h.hits.slice(same).filter(([name]) => name === "uploadToken").map(([, subject]) => subject);
  assert.equal(a, b, "the same 20-character prefix shares a bucket");
  h.state.limited = true;
  const limited = await h.post(`${BASE}/api/mcp/upload/${generateSecret("uploadAgent")}`);
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60"); assert.equal(limited.headers.get("cache-control"), "no-store");
});

test("Q-5 AC-22: the user path needs the same Owner session and a same-origin post; refusals consume nothing", async () => {
  const h = uploadHarness();
  const made = await h.uploads.request(h.actor, {});
  const attempt = async (session, headers = { origin: BASE }) => { h.state.session = session; const response = await h.post(made.userUploadUrl, { headers }); return [response.status, (await bodyOf(response)).code]; };
  assert.deepEqual(await attempt(null), [401, "AUTH_REQUIRED"]);
  assert.deepEqual(await attempt({ subject: OWNER, role: "staff" }), [403, "FORBIDDEN"]);
  assert.deepEqual(await attempt({ subject: "owner-2", role: "owner" }), [403, "FORBIDDEN"]);
  assert.deepEqual(await attempt({ subject: OWNER, role: "owner" }, {}), [403, "CSRF_REJECTED"]);
  assert.deepEqual(await attempt({ subject: OWNER, role: "owner" }, { origin: "https://evil.example" }), [403, "CSRF_REJECTED"]);
  assert.deepEqual(await attempt({ subject: OWNER, role: "owner" }, { origin: BASE, "sec-fetch-site": "cross-site" }), [403, "CSRF_REJECTED"]);
  assert.equal(h.state.uploads.length, 0); assert.equal(h.pool.rows[0].status, "pending"); assert.equal(h.pool.rows[0].user_used_at, null);
  assert.deepEqual(await attempt({ subject: OWNER, role: "owner" }), [200, undefined]);
  assert.equal(h.pool.rows[0].user_used_at instanceof Date, true); assert.equal(h.pool.rows[0].agent_used_at, null);
  // A browser form post is sent back to the page instead of showing JSON.
  const page = uploadHarness(); const second = await page.uploads.request(page.actor, {});
  const form = await page.post(second.userUploadUrl, { headers: { origin: BASE, accept: "text/html" } });
  assert.equal(form.status, 303); assert.equal(form.headers.get("location"), `/admin/mcp/upload/${tokenOf(second.userUploadUrl)}?r=ok`);
});

test("Q-5 AC-24: Owner membership is re-read on each upload; a disabled Owner is rejected", async () => {
  const h = uploadHarness();
  const made = await h.uploads.request(h.actor, {});
  h.state.ownerActive = false;
  const response = await h.post(made.agentUploadUrl);
  assert.equal(response.status, 401); assert.equal(h.state.uploads.length, 0);
  assert.deepEqual(await h.uploads.status(h.actor, { uploadId: made.uploadId }), { status: "rejected", failureCode: "REJECTED" });
  assert.deepEqual(h.audits.map(entry => [entry.event, entry.code ?? null]), [["upload_requested", null], ["upload_rejected", "REJECTED"]]);
});

test("Q-5 AC-25: declared mime/size, non-images and oversize reject (token consumed); a 5xx keeps the token", async () => {
  const stage = async (input, post, mutate) => {
    const h = uploadHarness(); if (mutate) mutate(h);
    const made = await h.uploads.request(h.actor, input);
    const response = await h.post(made.agentUploadUrl, post);
    return { h, made, response, body: await bodyOf(response) };
  };
  let r = await stage({ mime: "image/jpeg" }, {});
  assert.deepEqual([r.response.status, r.body.code, r.h.pool.rows[0].status, r.h.pool.rows[0].failure_code], [400, "MIME_MISMATCH", "rejected", "MIME_MISMATCH"]); assert.equal(r.h.state.uploads.length, 0);
  r = await stage({ byteSize: PNG.length + 1 }, {});
  assert.deepEqual([r.response.status, r.body.code, r.h.pool.rows[0].status], [400, "SIZE_MISMATCH", "rejected"]);
  r = await stage({}, { body: new Uint8Array(10000001) });
  assert.deepEqual([r.response.status, r.body.code, r.h.pool.rows[0].failure_code], [413, "OVERSIZED", "OVERSIZED"]);
  r = await stage({}, {}, h => { h.state.failWith = new MediaError("INVALID_MEDIA", "Declared MIME does not match decoded file."); });
  assert.deepEqual([r.response.status, r.body.code, r.h.pool.rows[0].status, r.h.pool.rows[0].failure_code], [400, "NOT_IMAGE", "rejected", "NOT_IMAGE"]);
  assert.deepEqual(await r.h.uploads.status(r.h.actor, { uploadId: r.made.uploadId }), { status: "rejected", failureCode: "NOT_IMAGE" });
  assert.equal((await r.h.post(r.made.agentUploadUrl)).status, 410, "a content rejection consumes the token");
  assert.deepEqual(r.h.audits.map(entry => entry.event), ["upload_requested", "upload_rejected"]);
  r = await stage({}, {}, h => { h.state.failWith = new MediaError("INPUT_TOO_LARGE", "x"); });
  assert.deepEqual([r.response.status, r.body.code], [413, "OVERSIZED"]);
  r = await stage({}, { type: "text/plain" });
  assert.deepEqual([r.response.status, r.body.code, r.h.pool.rows[0].status], [415, "UNSUPPORTED_MEDIA_TYPE", "pending"]);
  r = await stage({}, {}, h => { h.state.failWith = new MediaError("STORAGE_UNAVAILABLE", "disk"); });
  assert.deepEqual([r.response.status, r.body.code, r.h.pool.rows[0].status, r.h.pool.rows[0].agent_used_at], [503, "UPLOAD_FAILED", "pending", null]);
  assert.ok(!JSON.stringify(r.body).includes("disk"));
  r.h.state.failWith = new Error("socket reset"); assert.equal((await r.h.post(r.made.agentUploadUrl)).status, 503); assert.equal(r.h.pool.rows[0].status, "pending");
  r.h.state.failWith = null; assert.equal((await r.h.post(r.made.agentUploadUrl)).status, 200); assert.equal(r.h.pool.rows[0].status, "done");
});

test("Q-5 AC-22/23: multipart takes exactly one file and uses the same upload", async () => {
  const h = uploadHarness();
  const made = await h.uploads.request(h.actor, { mime: "image/png" });
  const sendForm = async form => { const { type, body } = await multipart(form); return h.post(made.agentUploadUrl, { type, body }); };
  const two = new FormData(); two.append("a", new File([PNG], "a.png", { type: "image/png" })); two.append("b", new File([PNG], "b.png", { type: "image/png" }));
  assert.equal((await sendForm(two)).status, 400);
  const text = new FormData(); text.append("file", "not a file");
  assert.equal((await sendForm(text)).status, 400);
  assert.equal(h.pool.rows[0].status, "pending", "a malformed form consumes nothing");
  const one = new FormData(); one.append("file", new File([PNG], "foto.png", { type: "image/png" }));
  const ok = await sendForm(one);
  assert.equal(ok.status, 200); assert.equal(h.state.uploads.length, 1); assert.equal(h.state.uploads[0].mime, "image/png");
  const second = await h.uploads.request(h.actor, {});
  const heic = new FormData(); heic.append("file", new File([PNG], "a.heic", { type: "image/heic" }));
  const { type, body } = await multipart(heic);
  assert.equal((await h.post(second.agentUploadUrl, { type, body })).status, 400);
  assert.equal(h.pool.rows[1].failure_code, "NOT_IMAGE");
});

test("Q-5 AC-27: status is visible to the requesting user and client only", async () => {
  const h = uploadHarness();
  const made = await h.uploads.request(h.actor, {});
  assert.deepEqual(await h.uploads.status(h.actor, { uploadId: made.uploadId }), { status: "pending" });
  for (const stranger of [{ subject: "owner-2", clientId: CLIENT }, { subject: OWNER, clientId: "mcpc_other" }]) {
    assert.equal(await code(() => h.uploads.status(stranger, { uploadId: made.uploadId })), "NOT_FOUND");
  }
  assert.equal(await code(() => h.uploads.status(h.actor, { uploadId: randomUUID() })), "NOT_FOUND");
  h.state.clock = 15 * 60000 + 1000;
  assert.deepEqual(await h.uploads.status(h.actor, { uploadId: made.uploadId }), { status: "expired" });
  assert.equal((await h.uploads.describe(tokenOf(made.userUploadUrl), { subject: OWNER, role: "owner" })).state, "expired");
  assert.equal((await h.uploads.describe(tokenOf(made.userUploadUrl), { subject: "owner-2", role: "owner" })).state, "invalid");
  assert.equal((await h.uploads.describe(tokenOf(made.agentUploadUrl), { subject: OWNER, role: "owner" })).state, "invalid", "the agent token never opens the user page");
});

test("Q-5 AC-30: upload requests are limited per Owner with 429 + Retry-After before the tool runs", async () => {
  assert.deepEqual({ ...MCP_RULES.upload }, { window: 60, max: 10 });
  const hits = [];
  const limits = { hit: async (name, subject) => { hits.push([name, subject]); return name === "upload" ? { allowed: false, retryAfter: 42 } : { allowed: true }; } };
  const bearer = { authenticate: async () => ({ ok: true, actor: { subject: "u1", clientId: CLIENT, scope: "mcp:read mcp:write" } }) };
  const handler = createMcpHandler({ baseURL: BASE, bearer, limits, audit: { safe: async () => {} }, cmsFor: () => { throw new Error("must not run"); }, uploads: { request: () => { throw new Error("must not run"); } } });
  const response = await handler.handle(new Request(BASE + "/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer ok" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "media_upload_request", arguments: {} } }) }));
  assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), "42");
  assert.deepEqual(hits.map(([name]) => name), ["call", "write", "upload"]);
});

test("Q-5 AC-29: upload routes and page carry no-store, noindex and no-referrer headers", () => {
  const rules = buildHeaderRules({ PUBLIC_DATABASE_TARGET: "dev" });
  for (const source of ["/api/mcp/upload/:token*", "/admin/mcp/upload/:token*"]) {
    const rule = rules.find(item => item.source === source);
    assert.deepEqual(rule.headers.map(header => [header.key, header.value]), [["X-Robots-Tag", "noindex, nofollow"], ["Cache-Control", "no-store"], ["Referrer-Policy", "no-referrer"]]);
  }
});

test("Q-5: an upload stored but not recorded never gets its token back (no duplicate or orphan asset)", async () => {
  // Two failures then success: the retry loop records the outcome with the same asset.
  const retry = uploadHarness({ failDone: 2 });
  const made = await retry.uploads.request(retry.actor, {});
  const ok = await retry.post(made.agentUploadUrl);
  assert.equal(ok.status, 200); assert.equal(retry.state.doneAttempts, 3); assert.equal(retry.state.uploads.length, 1);
  assert.equal(retry.pool.rows[0].status, "done"); assert.equal(retry.pool.rows[0].asset_id, (await bodyOf(ok)).assetId);
  // Every attempt fails: the row is marked failed with the stored asset, the token stays consumed, and a retry stores nothing new.
  const h = uploadHarness({ failDone: 99 });
  const second = await h.uploads.request(h.actor, {});
  const failed = await h.post(second.agentUploadUrl);
  assert.deepEqual([failed.status, (await bodyOf(failed)).code], [500, "RECORD_FAILED"]);
  assert.equal(h.state.doneAttempts, 3, "bounded retries");
  const [row] = h.pool.rows;
  assert.deepEqual([row.status, row.failure_code, row.agent_used_at !== null, typeof row.asset_id], ["rejected", "RECORD_FAILED", true, "string"]);
  assert.equal((await h.post(second.agentUploadUrl)).status, 410);
  assert.equal(h.state.uploads.length, 1, "no second asset");
  // Even if the fallback write fails too, the token is not released.
  const worst = uploadHarness({ failDone: 99, failRecordFallback: true });
  const third = await worst.uploads.request(worst.actor, {});
  assert.equal((await worst.post(third.agentUploadUrl)).status, 500);
  assert.notEqual(worst.pool.rows[0].agent_used_at, null);
  assert.equal((await worst.post(third.agentUploadUrl)).status, 410); assert.equal(worst.state.uploads.length, 1);
});

test("user page: only own-property codes map to a message (?r=__proto__ is safe)", () => {
  for (const hostile of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "", null, undefined, 5, ["TOKEN_USED"]]) assert.equal(uploadMessage(hostile), null, String(hostile));
  assert.equal(uploadMessage("TOKEN_USED"), UPLOAD_MESSAGES.TOKEN_USED);
  assert.match(readFileSync("src/app/admin/mcp/upload/[token]/page.jsx", "utf8"), /uploadMessage\(r\)/);
  assert.ok(!/UPLOAD_MESSAGES\[/.test(readFileSync("src/app/admin/mcp/upload/[token]/page.jsx", "utf8")));
});
