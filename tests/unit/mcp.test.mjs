import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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

test("10 tools only, in the approved set, each with a strict schema and listing metadata", () => {
  assert.deepEqual([...toolNames].sort(), ["media_get", "media_list", "media_register_youtube", "menu_create", "menu_delete", "menu_list", "menu_update", "page_get", "page_list", "page_save"]);
  assert.equal(listTools().length, 10);
  for (const item of listTools()) {
    assert.equal(item.inputSchema.type, "object"); assert.equal(item.inputSchema.additionalProperties, false, item.name); assert.ok(!("$schema" in item.inputSchema));
  }
  assert.ok(toolNames.every(name => !/sync|upload|merchant|account/.test(name)));
  assert.deepEqual(toolNames.filter(name => tools[name].write).sort(), ["media_register_youtube", "menu_create", "menu_delete", "menu_update", "page_save"]);
  assert.ok(toolNames.filter(name => !tools[name].write).every(name => tools[name].scope === "mcp:read"));
  assert.ok(toolNames.filter(name => tools[name].write).every(name => tools[name].scope === "mcp:write" && tools[name].refresh));
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
  for (const args of [{ name: "A", price: 5, expectedVersion: version }, { slug, name: "A", price: 5 }, { slug: "Bad Slug", expectedVersion: version, name: "A", price: 5 },
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
  assert.deepEqual(parseToolInput("media_list", {}), {}); assert.deepEqual(parseToolInput("media_list", { offset: 48 }), { offset: 48 });
  for (const bad of [{ offset: -1 }, { offset: 100001 }, { offset: 1.5 }, { offset: "1" }, { page: 1 }]) assert.equal(await code(() => parseToolInput("media_list", bad)), "INVALID_INPUT");
  assert.equal(await code(() => parseToolInput("media_get", { id: "x" })), "INVALID_INPUT");
  assert.deepEqual(parseToolInput("media_register_youtube", { videoId: "Abc_123-xyz", posterId: uuid }), { videoId: "Abc_123-xyz", posterId: uuid });
  assert.equal(await code(() => parseToolInput("media_register_youtube", { videoId: "Abc_123-xyz" })), "INVALID_INPUT");
  assert.ok(Object.keys(schemas).length === 10);
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
  assert.equal(listed.result.tools.length, 10);
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

test("no merchant client or outbound network code in the MCP module (AC-22)", () => {
  for (const file of ["tokens", "clients", "auth", "oauth", "tools", "server", "audit", "limits", "compose", "runtime", "http"]) {
    const lines = readFileSync(`src/server/mcp/${file}.mjs`, "utf8").split(String.fromCharCode(10));
    const source = lines.filter(line => !line.trim().startsWith("//")).join(" ");
    assert.ok(!/gofood|grabfood|shopeefood|merchant|axios|node-fetch|undici/i.test(source), file);
    assert.ok(!/(^|[^.\w])fetch\(/.test(source), file + " must not call fetch");
    assert.ok(!/NEXT_PUBLIC_|console\.(log|info|debug)/.test(source), file);
  }
});
