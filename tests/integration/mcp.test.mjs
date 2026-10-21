import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { inspectedImage } from "../fixtures/media.mjs";
import { buildMcp } from "../../src/server/mcp/compose.mjs";
import { challengeFor, hashSecret } from "../../src/server/mcp/tokens.mjs";
import { createCmsPages } from "../../src/server/cms/pages.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { createCmsMedia } from "../../src/server/cms/media.mjs";
import { createMediaAssets } from "../../src/server/media/assets.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { getPublishedCatalog } from "../../src/server/catalog/published.mjs";
import { getPublishedPage } from "../../src/server/pages/published.mjs";
import { toolNames } from "../../src/server/mcp/tools.mjs";

// MCP Owner end to end against the local test database: real OAuth rows (cleaned by the fixture) and CMS writes inside
// a rolled-back transaction. Requires migration 0018 (npm run db:migrate:test).
let fixture, cmsPool, mcp, base, owner, staff, ownerJar, staffJar, currentDb = null, refreshes = 0, clock = 0;
const fields = { title: "QA simpan lewat MCP", body: { blocks: [{ type: "paragraph", content: [{ text: "QA konten Indonesia" }] }] } };
const redirectUri = "http://127.0.0.1:41234/callback";
const baseNow = () => new Date(Date.now() + clock);
before(async () => {
  fixture = await createAuthFixture();
  cmsPool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  [owner, staff] = fixture.accounts; base = fixture.env.BETTER_AUTH_URL;
  mcp = buildMcp({ pool: fixture.pool, consume: fixture.service.consume, baseURL: base, now: baseNow,
    authenticateSession: headers => fixture.service.authenticate(headers),
    cmsFor: actor => {
      assert.ok(currentDb, "CMS access outside a rolled-back transaction");
      const context = { db: currentDb, authenticate: async () => ({ subject: actor.subject, role: actor.role }) };
      return { pages: createCmsPages(context), catalog: createCmsCatalog(context), media: createCmsMedia(context) };
    },
    refreshPublic: () => { refreshes++; } });
  ownerJar = cookieJar(); staffJar = cookieJar();
  assert.equal((await callAuth(fixture, "/sign-in/email", { email: owner.email, password: fixture.password }, ownerJar)).status, 200);
  assert.equal((await callAuth(fixture, "/sign-in/email", { email: staff.email, password: fixture.password }, staffJar)).status, 200);
});
after(async () => { await cmsPool?.end(); await fixture?.cleanup(); });
beforeEach(async () => { clock = 0; refreshes = 0; await fixture.expireLimits(); });

const rollback = new Error("rollback QA transaction");
const inTransaction = async callback => {
  try { await drizzle(cmsPool).transaction(async tx => { currentDb = tx; await callback(tx); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; } finally { currentDb = null; }
};

const newClient = (name = "QA MCP client", uris = [redirectUri]) => mcp.clients.create({ createdBy: owner.id, input: { name, redirectUris: uris } });
const pkce = () => { const verifier = randomBytes(48).toString("base64url"); return { verifier, challenge: challengeFor(verifier) }; };
const authorizeBody = (client, challenge, extra = {}) => ({ client_id: client.clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256",
  state: "st-" + randomUUID(), resource: base + "/api/mcp", decision: "approve", ...extra });
const postAuthorize = (body, jar = ownerJar, headers = {}) => mcp.oauth.authorizePost(new Request(base + "/api/mcp/oauth/authorize", { method: "POST",
  headers: { "content-type": "application/json", origin: base, cookie: jar?.header() ?? "", ...headers }, body: JSON.stringify(body) }));
const codeFrom = async response => { assert.equal(response.status, 200); const { redirectTo } = await response.json(); return new URL(redirectTo).searchParams; };
const tokenRequest = form => mcp.oauth.token(new Request(base + "/api/mcp/oauth/token", { method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() }));
const exchange = (client, params, verifier, extra = {}) => tokenRequest({ grant_type: "authorization_code", client_id: client.clientId, code: params.get("code"),
  redirect_uri: redirectUri, code_verifier: verifier, ...extra });
const login = async (options = {}) => {
  const client = options.client ?? await newClient();
  const { verifier, challenge } = pkce();
  const params = await codeFrom(await postAuthorize(authorizeBody(client, challenge, options.extra)));
  const response = await exchange(client, params, verifier);
  assert.equal(response.status, 200);
  return { client, tokens: await response.json(), params, verifier };
};
const refreshRequest = (client, refresh, extra = {}) => tokenRequest({ grant_type: "refresh_token", client_id: client.clientId, refresh_token: refresh, ...extra });
const rpc = async (token, method, params, headers = {}, id = 1) => mcp.server.handle(new Request(base + "/api/mcp", { method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: "Bearer " + token } : {}), ...headers },
  body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) }));
const call = async (token, name, args) => {
  const response = await rpc(token, "tools/call", { name, arguments: args });
  assert.equal(response.status, 200);
  const { result } = await response.json();
  const body = JSON.parse(result.content[0].text);
  return result.isError ? { error: body } : { ok: body };
};
const audits = async (event, clientId) => (await fixture.owner.query("SELECT * FROM cms_auth.mcp_audit WHERE ($1::text IS NULL OR event=$1) AND ($2::text IS NULL OR client_id=$2) ORDER BY at", [event ?? null, clientId ?? null])).rows;
const asOwner = async (sql, values) => fixture.owner.query(sql, values);

test("all 10 tools work end to end through authorize -> code -> token -> tools/call, with the real Owner as actor and cache invalidation", async () => {
  const { tokens } = await login();
  assert.equal(tokens.token_type, "Bearer"); assert.equal(tokens.expires_in, 900); assert.equal(tokens.scope, "mcp:read mcp:write");
  assert.match(tokens.access_token, /^tomcp_at_/); assert.match(tokens.refresh_token, /^tomcp_rt_/);
  const listed = await (await rpc(tokens.access_token, "tools/list")).json();
  assert.deepEqual(listed.result.tools.map(item => item.name).sort(), [...toolNames].sort());
  await inTransaction(async tx => {
    const token = tokens.access_token;
    assert.deepEqual((await call(token, "menu_list", {})).ok.products, []);
    const created = (await call(token, "menu_create", { name: "QA MCP Takoyaki", description: "Uji", price: 25000 })).ok.product;
    assert.equal(created.slug, "qa-mcp-takoyaki"); assert.equal(created.price, 25000); assert.equal(refreshes, 1);
    assert.deepEqual((await getPublishedCatalog(tx)).products.map(row => row.slug), ["qa-mcp-takoyaki"], "saved = live");
    // Image + alt through an asset that exists in the library.
    const asset = await createMediaAssets({ db: tx, resolveActor: async () => ({ subject: owner.id, role: "owner" }), inspectFile: async key => inspectedImage(key) })
      .registerFile({ storageKey: randomUUID() + ".png", posterId: null });
    const withImage = (await call(token, "menu_create", { name: "QA MCP Okonomiyaki", price: 30000, imageAssetId: asset.id, imageAlt: "Foto uji" })).ok.product;
    assert.equal(withImage.image.alt, "Foto uji");
    assert.equal((await call(token, "menu_create", { name: "QA Gambar", price: 1, imageAssetId: asset.id })).error.code, "INVALID_IMAGE_ALT");
    assert.equal(refreshes, 2, "a failed write does not refresh");
    // Update: stale version is a 409-equivalent and writes nothing.
    const updated = (await call(token, "menu_update", { slug: created.slug, expectedVersion: created.version, name: "QA MCP Takoyaki", price: 27000 })).ok.product;
    assert.equal(updated.price, 27000); assert.equal(refreshes, 3);
    const stale = await call(token, "menu_update", { slug: created.slug, expectedVersion: created.version, name: "QA Lama", price: 1 });
    assert.deepEqual([stale.error.code, stale.error.status], ["PRODUCT_CONFLICT", 409]); assert.equal(refreshes, 3);
    assert.equal((await call(token, "menu_list", {})).ok.products.find(row => row.slug === created.slug).price, 27000);
    assert.equal((await call(token, "menu_create", { name: "QA", price: 1.5 })).error.code, "INVALID_PRICE");
    assert.equal((await call(token, "menu_create", { name: "QA", price: 1, grabfoodUrl: "https://grab.example" })).error.code, "INVALID_INPUT");
    // Delete needs the exact name; a wrong, empty or missing name deletes nothing.
    for (const confirmName of ["qa mcp takoyaki", "", "QA MCP", "QA MCP Takoyaki "]) {
      const refused = await call(token, "menu_delete", { slug: created.slug, confirmName });
      assert.deepEqual([refused.error.code, refused.error.status], ["CONFIRM_NAME_MISMATCH", 400]);
    }
    assert.equal((await call(token, "menu_delete", { slug: created.slug })).error.code, "CONFIRM_NAME_MISMATCH");
    assert.equal((await call(token, "menu_delete", { slug: "tidak-ada", confirmName: "x" })).error.code, "NOT_FOUND");
    assert.equal((await tx.execute("SELECT 1 FROM public.catalog_deletion_log")).rows.length, 0);
    assert.equal(refreshes, 3, "refused deletes do not refresh");
    assert.deepEqual((await call(token, "menu_delete", { slug: created.slug, confirmName: "QA MCP Takoyaki" })).ok, { success: true, slug: created.slug });
    assert.equal(refreshes, 4);
    assert.equal((await tx.execute("SELECT 1 FROM public.catalog_deletion_log")).rows.length, 1);
    assert.ok(!(await call(token, "menu_list", {})).ok.products.some(row => row.slug === created.slug), "permanently gone");

    await fixture.expireLimits(); // keep the per-minute write budget out of the way of the page and media steps
    // Pages.
    const pages = (await call(token, "page_list", {})).ok;
    assert.ok(pages.some(row => row.pageKey === "about" && row.publishedRevisionId === null));
    assert.equal((await call(token, "page_get", { pageKey: "nope" })).error.code, "NOT_FOUND");
    const empty = (await call(token, "page_get", { pageKey: "about" })).ok;
    assert.deepEqual([empty.id, empty.version], [null, 0]);
    const saved = (await call(token, "page_save", { pageKey: "about", expectedRevisionId: empty.id, expectedVersion: empty.version, fields, mediaOperations: [] })).ok;
    assert.ok(saved.id); assert.equal(refreshes, 5);
    assert.equal((await getPublishedPage(tx, { pageKey: "about" })).fields.title, fields.title);
    const conflict = await call(token, "page_save", { pageKey: "about", expectedRevisionId: empty.id, expectedVersion: empty.version, fields, mediaOperations: [] });
    assert.deepEqual([conflict.error.code, conflict.error.status], ["REVISION_CONFLICT", 409]); assert.equal(refreshes, 5);
    assert.equal((await call(token, "page_get", { pageKey: "about" })).ok.id, saved.id);
    assert.equal((await call(token, "page_save", { pageKey: "about", expectedRevisionId: saved.id, expectedVersion: saved.version, fields, mediaOperations: [], extra: 1 })).error.code, "INVALID_INPUT");

    // Media: metadata only; YouTube registration needs an image poster.
    const listedMedia = (await call(token, "media_list", {})).ok;
    assert.ok(listedMedia.rows.some(row => row.id === asset.id));
    const meta = (await call(token, "media_get", { id: asset.id })).ok;
    assert.equal(meta.id, asset.id); assert.ok(!JSON.stringify(meta).includes("storageKey") && !JSON.stringify(meta).includes(".png") && !("bytes" in meta));
    assert.equal((await call(token, "media_get", { id: randomUUID() })).error.code, "NOT_FOUND");
    const youtube = (await call(token, "media_register_youtube", { videoId: "Abc_123-xyz", posterId: asset.id })).ok;
    assert.equal(youtube.kind, "youtube"); assert.equal(youtube.posterId, asset.id); assert.equal(refreshes, 6);
    assert.equal((await call(token, "media_register_youtube", { videoId: "Abc_123-xyz", posterId: randomUUID() })).error.code, "INVALID_POSTER");

    // Workflow actors are the real Owner, never a service account.
    const actors = (await tx.execute("SELECT DISTINCT actor_id FROM public.catalog_workflow_events UNION SELECT DISTINCT actor_id FROM public.page_workflow_events")).rows.map(row => row.actor_id);
    assert.deepEqual(actors, [owner.id]);
    const receipts = (await tx.execute("SELECT DISTINCT approved_by FROM public.catalog_approvals UNION SELECT DISTINCT approved_by FROM public.page_approvals")).rows.map(row => row.approved_by);
    assert.deepEqual(receipts, [owner.id]);
  });
});

test("audit: one row per OAuth and tool event, only identifiers (no tokens, codes, verifiers or field content); runtime cannot read, edit or delete it", async () => {
  const { tokens, params, verifier, client } = await login();
  await inTransaction(async () => {
    await call(tokens.access_token, "menu_create", { name: "Rahasia Konten Uji", description: "Isi rahasia", price: 5 });
    await call(tokens.access_token, "menu_create", { name: "Rahasia", price: -5 });
    await call(tokens.access_token, "menu_list", {});
  });
  const rows = await audits(null, client.clientId);
  const events = rows.map(row => row.event);
  for (const event of ["code_issued", "authorize_approved", "token_issued", "tool_call"]) assert.ok(events.includes(event), event);
  assert.equal(rows.filter(row => row.event === "tool_call").length, 3);
  const toolRows = rows.filter(row => row.event === "tool_call");
  assert.deepEqual(toolRows.map(row => [row.tool, row.outcome, row.code]), [["menu_create", "ok", null], ["menu_create", "denied", "INVALID_PRICE"], ["menu_list", "ok", null]]);
  assert.equal(toolRows[0].target, "rahasia-konten-uji"); assert.ok(toolRows.every(row => row.user_id === owner.id && row.client_id === client.clientId && row.request_id));
  const dump = JSON.stringify(rows);
  for (const secret of [tokens.access_token, tokens.refresh_token, params.get("code"), verifier, "Isi rahasia", "Rahasia Konten Uji", fixture.password]) assert.ok(!dump.includes(secret), "secret leaked into audit");
  // Hashes only in token tables.
  const stored = (await asOwner("SELECT token_hash FROM cms_auth.oauth_tokens WHERE client_id=$1", [client.clientId])).rows.map(row => row.token_hash);
  assert.deepEqual(stored.sort(), [hashSecret(tokens.access_token), hashSecret(tokens.refresh_token)].sort());
  assert.ok(!JSON.stringify(stored).includes(tokens.access_token));
  assert.equal((await asOwner("SELECT code_hash FROM cms_auth.oauth_codes WHERE code_hash=$1", [hashSecret(params.get("code"))])).rows.length, 1);
  assert.equal((await asOwner("SELECT 1 FROM cms_auth.oauth_codes WHERE code_hash=$1", [params.get("code")])).rows.length, 0);
  // Privilege boundary: auth role appends only; the CMS role has nothing on any MCP table.
  const denied = query => assert.rejects(fixture.pool.query(query), error => error.code === "42501");
  await denied("SELECT * FROM cms_auth.mcp_audit"); await denied("UPDATE cms_auth.mcp_audit SET outcome='ok'"); await denied("DELETE FROM cms_auth.mcp_audit");
  await denied("TRUNCATE cms_auth.mcp_audit"); await denied("UPDATE cms_auth.oauth_clients SET name='x'"); await denied("UPDATE cms_auth.oauth_tokens SET scope='x'");
  await denied("UPDATE cms_auth.oauth_codes SET resource='x'");
  await assert.rejects(fixture.owner.query("UPDATE cms_auth.mcp_audit SET outcome='ok'"), error => error.code === "23514", "append-only trigger, even for the owner role");
  for (const table of ["oauth_clients", "oauth_codes", "oauth_tokens", "mcp_audit"]) {
    await assert.rejects(cmsPool.query(`SELECT 1 FROM cms_auth.${table}`), error => error.code === "42501", table);
    await assert.rejects(cmsPool.query(`DELETE FROM cms_auth.${table}`), error => error.code === "42501", table);
  }
  await assert.rejects(fixture.pool.query("INSERT INTO cms_auth.oauth_clients(client_id,name,redirect_uris,created_by,auth_method) VALUES ('x','x',ARRAY['https://a.example/'],$1,'client_secret_basic')", [owner.id]), error => error.code === "42501");
  await assert.rejects(asOwner("INSERT INTO cms_auth.oauth_clients(client_id,name,redirect_uris,created_by,auth_method) VALUES ('x','x',ARRAY['https://a.example/'],$1,'client_secret_basic')", [owner.id]), error => error.code === "23514");
});

test("authorize: only an Owner session approves; Staff, anonymous, cross-origin and malformed requests issue no code", async () => {
  const client = await newClient(); const { challenge } = pkce();
  const codes = async () => Number((await asOwner("SELECT count(*) FROM cms_auth.oauth_codes WHERE client_id=$1", [client.clientId])).rows[0].count);
  const staffDenied = await postAuthorize(authorizeBody(client, challenge), staffJar);
  assert.equal(staffDenied.status, 403); assert.equal((await staffDenied.json()).error, "access_denied");
  assert.equal((await postAuthorize(authorizeBody(client, challenge), null)).status, 401);
  assert.equal((await postAuthorize(authorizeBody(client, challenge), ownerJar, { origin: "https://evil.example" })).status, 403);
  assert.equal((await postAuthorize(authorizeBody(client, challenge), ownerJar, { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await mcp.oauth.authorizePost(new Request(base + "/api/mcp/oauth/authorize", { method: "POST", headers: { origin: base, cookie: ownerJar.header(), "content-type": "text/plain" }, body: "x" }))).status, 415);
  assert.equal((await postAuthorize({ ...authorizeBody(client, challenge), decision: "maybe" })).status, 400);
  assert.equal((await postAuthorize({ ...authorizeBody(client, challenge), extra: "x" })).status, 400);
  assert.equal(await codes(), 0);
  assert.ok((await audits("authorize_rejected")).some(row => row.user_id === staff.id && row.outcome === "denied"));
  // Owner can deny: access_denied goes back to the client with state, and no code exists.
  const state = "keep-me";
  const denied = await postAuthorize(authorizeBody(client, challenge, { decision: "deny", state }));
  const target = new URL((await denied.json()).redirectTo);
  assert.equal(target.origin + target.pathname, redirectUri); assert.equal(target.searchParams.get("error"), "access_denied"); assert.equal(target.searchParams.get("state"), state);
  assert.equal(await codes(), 0);
  const approved = await codeFrom(await postAuthorize(authorizeBody(client, challenge, { state })));
  assert.equal(approved.get("state"), state); assert.equal(await codes(), 1);
  const row = (await asOwner("SELECT * FROM cms_auth.oauth_codes WHERE client_id=$1", [client.clientId])).rows[0];
  assert.equal(row.challenge_method, "S256"); assert.equal(row.user_id, owner.id); assert.ok(row.expires_at.getTime() - row.created_at.getTime() <= 60000);
});

test("authorize GET: invalid client or redirect never redirects; PKCE/response errors go to the trusted redirect; valid requests go to the consent page", async () => {
  const client = await newClient(); const { challenge } = pkce();
  const get = params => mcp.oauth.authorizeGet(new Request(base + "/api/mcp/oauth/authorize?" + new URLSearchParams(params)));
  const good = { response_type: "code", client_id: client.clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256", state: "s1" };
  const ok = await get(good);
  assert.equal(ok.status, 302);
  const location = new URL(ok.headers.get("location"));
  assert.equal(location.origin + location.pathname, base + "/admin/mcp/authorize"); assert.equal(location.searchParams.get("client_id"), client.clientId);
  assert.equal(location.searchParams.get("scope"), "mcp:read mcp:write"); assert.equal(location.searchParams.get("resource"), base + "/api/mcp");
  for (const bad of [{ ...good, client_id: "mcpc_unknown" }, { ...good, redirect_uri: "https://evil.example/cb" }, { ...good, redirect_uri: redirectUri + "/x" }, { ...good, client_id: undefined }]) {
    const response = await get(Object.fromEntries(Object.entries(bad).filter(([, value]) => value !== undefined)));
    assert.equal(response.status, 400, JSON.stringify(bad)); assert.equal(response.headers.get("location"), null);
  }
  for (const [bad, error] of [[{ ...good, code_challenge: undefined }, "invalid_request"], [{ ...good, code_challenge_method: "plain" }, "invalid_request"], [{ ...good, code_challenge: "short" }, "invalid_request"],
    [{ ...good, response_type: "token" }, "unsupported_response_type"], [{ ...good, scope: "admin" }, "invalid_scope"], [{ ...good, resource: "https://other.example/api/mcp" }, "invalid_target"]]) {
    const response = await get(Object.fromEntries(Object.entries(bad).filter(([, value]) => value !== undefined)));
    assert.equal(response.status, 302); const target = new URL(response.headers.get("location"));
    assert.equal(target.origin + target.pathname, redirectUri); assert.equal(target.searchParams.get("error"), error); assert.equal(target.searchParams.get("state"), "s1");
  }
  assert.equal((await get({ ...good, client_id: [client.clientId, client.clientId].join("&client_id=") })).status, 400);
  const duplicate = await mcp.oauth.authorizeGet(new Request(base + "/api/mcp/oauth/authorize?" + new URLSearchParams(good) + "&state=again"));
  assert.equal(duplicate.status, 400);
  // The consent page helper shows the client and scopes, and refuses an unknown client.
  const described = await mcp.oauth.describe(Object.fromEntries(location.searchParams));
  assert.equal(described.clientName, client.name); assert.deepEqual(described.scope, ["mcp:read", "mcp:write"]); assert.equal(described.form.code_challenge_method, "S256");
  await assert.rejects(mcp.oauth.describe({ ...good, client_id: "mcpc_unknown" }), error => error.error === "invalid_request");
});

test("token endpoint: replay, wrong verifier, wrong redirect_uri, expired code, disabled client and foreign client all fail with invalid_grant/client", async () => {
  const client = await newClient(); const other = await newClient("Klien lain");
  const authorize = async () => { const { verifier, challenge } = pkce(); return { verifier, params: await codeFrom(await postAuthorize(authorizeBody(client, challenge))) }; };
  // Replay revokes what the first exchange produced (AC-5).
  let { verifier, params } = await authorize();
  const first = await (await exchange(client, params, verifier)).json();
  assert.equal((await rpc(first.access_token, "tools/list")).status, 200, "token works before replay");
  const replay = await exchange(client, params, verifier);
  assert.equal(replay.status, 400); assert.equal((await replay.json()).error, "invalid_grant");
  assert.equal((await rpc(first.access_token, "tools/list")).status, 401, "access token revoked by replay");
  assert.equal((await refreshRequest(client, first.refresh_token)).status, 400, "refresh token revoked by replay");
  assert.ok((await audits("code_replay")).length >= 1);
  // Wrong verifier burns the code.
  ({ verifier, params } = await authorize());
  assert.equal((await (await exchange(client, params, pkce().verifier)).json()).error, "invalid_grant");
  assert.equal((await exchange(client, params, verifier)).status, 400, "the code is consumed even after a failed attempt");
  // Wrong redirect_uri.
  ({ verifier, params } = await authorize());
  assert.equal((await exchange(client, params, verifier, { redirect_uri: "http://127.0.0.1:41234/other" })).status, 400);
  // Wrong or missing resource, missing verifier.
  ({ verifier, params } = await authorize());
  assert.equal((await exchange(client, params, verifier, { resource: "https://other.example/api/mcp" })).status, 400);
  ({ verifier, params } = await authorize());
  assert.equal((await exchange(client, params, undefined)).status, 400);
  // Expired code (clock pushed past the 60 s limit on the stored row).
  ({ verifier, params } = await authorize());
  await asOwner("UPDATE cms_auth.oauth_codes SET expires_at=clock_timestamp()-interval '1 second' WHERE code_hash=$1", [hashSecret(params.get("code"))]);
  assert.equal((await (await exchange(client, params, verifier)).json()).error, "invalid_grant");
  // Another client cannot redeem the code.
  ({ verifier, params } = await authorize());
  assert.equal((await (await exchange(other, params, verifier)).json()).error, "invalid_grant");
  // Disabled client: no exchange, no refresh.
  ({ verifier, params } = await authorize());
  await mcp.clients.disable(client.clientId);
  const disabled = await exchange(client, params, verifier);
  assert.equal(disabled.status, 401); assert.equal((await disabled.json()).error, "invalid_client");
  assert.equal((await tokenRequest({ grant_type: "password", client_id: other.clientId, username: "a", password: "b" })).status, 400);
  assert.equal((await tokenRequest({ grant_type: "client_credentials", client_id: other.clientId })).status, 400);
  assert.equal((await tokenRequest({ client_id: other.clientId })).status, 400);
  assert.equal((await mcp.oauth.token(new Request(base + "/api/mcp/oauth/token", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }))).status, 415);
});

test("refresh tokens rotate; reusing a rotated token revokes the whole family and is audited; the response carries no-store", async () => {
  const { client, tokens } = await login();
  const rotated = await refreshRequest(client, tokens.refresh_token);
  assert.equal(rotated.status, 200); assert.equal(rotated.headers.get("cache-control"), "no-store");
  const next = await rotated.json();
  assert.notEqual(next.access_token, tokens.access_token); assert.notEqual(next.refresh_token, tokens.refresh_token);
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401, "previous access token retired with the rotation");
  assert.equal((await rpc(next.access_token, "tools/list")).status, 200);
  const reuse = await refreshRequest(client, tokens.refresh_token);
  assert.equal(reuse.status, 400); assert.equal((await reuse.json()).error, "invalid_grant");
  assert.equal((await rpc(next.access_token, "tools/list")).status, 401, "family revoked");
  assert.equal((await refreshRequest(client, next.refresh_token)).status, 400);
  assert.ok((await audits("reuse_detected")).some(row => row.client_id === client.clientId && row.user_id === owner.id));
  assert.ok((await audits("token_refreshed")).length >= 1);
  // A refresh token cannot be used with another client, nor widened in scope.
  const second = await login(); const stranger = await newClient("Asing");
  assert.equal((await refreshRequest(stranger, second.tokens.refresh_token)).status, 400);
  const narrowed = await refreshRequest(second.client, second.tokens.refresh_token, { scope: "mcp:read" });
  assert.equal(narrowed.status, 200); const narrow = await narrowed.json(); assert.equal(narrow.scope, "mcp:read");
  assert.equal((await refreshRequest(second.client, narrow.refresh_token, { scope: "mcp:read mcp:write" })).status, 400, "no scope widening");
});

test("controlled clock: access ends at 15 minutes, refresh idles out at 1 hour, the family ends at 24 hours", async () => {
  let { client, tokens } = await login();
  clock = 14 * 60000; assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200);
  clock = 15 * 60000 + 1000; assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401);
  clock = 61 * 60000; assert.equal((await refreshRequest(client, tokens.refresh_token)).status, 400, "idle for more than 1 hour");
  clock = 0; ({ client, tokens } = await login());
  let rotations = 0, at = 0;
  while (rotations < 60) {
    at += 50 * 60000; clock = at;
    await fixture.expireLimits(); // 28 refreshes would otherwise hit the 20 per minute token limit
    const response = await refreshRequest(client, tokens.refresh_token);
    if (response.status !== 200) break;
    tokens = await response.json(); rotations++;
    const row = (await asOwner("SELECT max(expires_at) AS latest,max(family_expires_at) AS family FROM cms_auth.oauth_tokens WHERE client_id=$1 AND revoked_at IS NULL", [client.clientId])).rows[0];
    assert.ok(row.latest.getTime() <= row.family.getTime(), "nothing outlives the 24 hour family");
  }
  assert.equal(rotations, 28, "rotations stop at the 24 hour absolute limit (50 min steps)");
  clock = 24 * 3600000 + 60000; assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401);
});

test("Owner checks on every call: disabled account is 401 and loses all tokens, demoted account is 403, restored Owner works again", async () => {
  const { client: ownerClient, tokens } = await login();
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200);
  try {
    await asOwner("UPDATE cms_auth.roles SET role='staff' WHERE user_id=$1", [owner.id]);
    const demoted = await rpc(tokens.access_token, "tools/list");
    assert.equal(demoted.status, 403); assert.ok(demoted.headers.get("www-authenticate"));
    await asOwner("UPDATE cms_auth.roles SET role='owner' WHERE user_id=$1", [owner.id]);
    assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200, "role restored: token unaffected by a mere demotion");
    await asOwner("UPDATE cms_auth.roles SET enabled=false WHERE user_id=$1", [owner.id]);
    assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401);
    await asOwner("UPDATE cms_auth.roles SET enabled=true WHERE user_id=$1", [owner.id]);
    assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401, "tokens were retired when the account was found disabled");
    assert.equal((await refreshRequest(ownerClient, tokens.refresh_token)).status, 400);
  } finally { await asOwner("UPDATE cms_auth.roles SET role='owner',enabled=true WHERE user_id=$1", [owner.id]); }
  // An account that stopped being an Owner cannot authorize or redeem a code either.
  const client = await newClient(); const { verifier, challenge } = pkce();
  const params = await codeFrom(await postAuthorize(authorizeBody(client, challenge)));
  try {
    await asOwner("UPDATE cms_auth.roles SET enabled=false WHERE user_id=$1", [owner.id]);
    assert.equal((await exchange(client, params, verifier)).status, 400);
  } finally { await asOwner("UPDATE cms_auth.roles SET enabled=true WHERE user_id=$1", [owner.id]); }
});

test("credentials: cookie-only, bad, foreign-resource and read-only tokens are refused; writes need mcp:write", async () => {
  const cookie = ownerJar.header();
  const cookieOnly = await rpc(null, "tools/list", undefined, { cookie });
  assert.equal(cookieOnly.status, 401); assert.match(cookieOnly.headers.get("www-authenticate"), /oauth-protected-resource/);
  assert.equal((await rpc("tomcp_at_" + "A".repeat(43), "tools/list", undefined, { cookie })).status, 401);
  assert.equal((await rpc("garbage", "tools/list")).status, 401);
  assert.equal((await rpc(null, "tools/list")).status, 401);
  assert.equal((await rpc(null, "tools/list")).headers.get("cache-control"), "no-store");
  const { tokens } = await login({ extra: { scope: "mcp:read" } });
  assert.equal(tokens.scope, "mcp:read");
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200);
  await inTransaction(async () => { assert.ok((await call(tokens.access_token, "page_list", {})).ok.length > 0); });
  const write = await call(tokens.access_token, "menu_create", { name: "Tidak", price: 1 });
  assert.deepEqual([write.error.code, write.error.status], ["INSUFFICIENT_SCOPE", 403]);
  assert.equal(refreshes, 0);
  // Tokens are bound to this resource: a row for another audience is rejected.
  await asOwner("UPDATE cms_auth.oauth_tokens SET resource='https://other.example/api/mcp' WHERE family_id=(SELECT family_id FROM cms_auth.oauth_tokens WHERE token_hash=$1)", [hashSecret(tokens.access_token)]);
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401);
  assert.equal((await rpc((await login()).tokens.access_token, "tools/list", undefined, { origin: "https://evil.example" })).status, 403);
  assert.equal((await rpc((await login()).tokens.access_token, "tools/list", undefined, { origin: base })).status, 200);
});

test("client management: disabling a client revokes its tokens at once; registrations are validated; revoke endpoint retires a family", async () => {
  const { client, tokens } = await login();
  const listed = (await mcp.clients.list()).find(row => row.clientId === client.clientId);
  assert.equal(listed.activeConnections, 1); assert.equal(listed.disabledAt, null);
  await assert.rejects(newClient("x", ["http://evil.example/cb"]), { code: "INVALID_REDIRECT_URI" });
  await assert.rejects(newClient("", [redirectUri]), { code: "INVALID_NAME" });
  await assert.rejects(mcp.clients.disable("mcpc_unknown"), { code: "NOT_FOUND" });
  const revokeRequest = (form) => mcp.oauth.revoke(new Request(base + "/api/mcp/oauth/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() }));
  const stranger = await newClient("Asing");
  assert.equal((await revokeRequest({ token: tokens.refresh_token, client_id: stranger.clientId })).status, 200);
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200, "another client cannot revoke it");
  assert.equal((await revokeRequest({ token: tokens.refresh_token, client_id: client.clientId })).status, 200);
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401, "revoking the refresh token retires the family");
  assert.equal((await revokeRequest({ token: "garbage", client_id: client.clientId })).status, 200);
  assert.ok((await audits("token_revoked")).length >= 1);
  const again = await login();
  await mcp.clients.disable(again.client.clientId);
  assert.equal((await rpc(again.tokens.access_token, "tools/list")).status, 401);
  assert.equal((await refreshRequest(again.client, again.tokens.refresh_token)).status, 401);
  assert.ok((await mcp.clients.list()).find(row => row.clientId === again.client.clientId).disabledAt);
});

test("rate limits: authorize, token and /api/mcp return 429 with Retry-After and are audited", async () => {
  const client = await newClient(); const { challenge } = pkce();
  const authorizeGet = () => mcp.oauth.authorizeGet(new Request(base + "/api/mcp/oauth/authorize?" + new URLSearchParams({ client_id: client.clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256" })));
  for (let n = 0; n < 20; n++) assert.equal((await authorizeGet()).status, 302);
  const limitedAuthorize = await authorizeGet();
  assert.equal(limitedAuthorize.status, 429); assert.ok(Number(limitedAuthorize.headers.get("retry-after")) > 0);
  await fixture.expireLimits();
  for (let n = 0; n < 20; n++) assert.equal((await postAuthorize({ ...authorizeBody(client, challenge), decision: "deny" })).status, 200);
  assert.equal((await postAuthorize({ ...authorizeBody(client, challenge), decision: "deny" })).status, 429);
  await fixture.expireLimits();
  for (let n = 0; n < 20; n++) assert.equal((await tokenRequest({ grant_type: "authorization_code", client_id: client.clientId, code: "x" })).status, 400);
  const limitedToken = await tokenRequest({ grant_type: "authorization_code", client_id: client.clientId, code: "x" });
  assert.equal(limitedToken.status, 429); assert.ok(limitedToken.headers.get("retry-after"));
  await fixture.expireLimits();
  const { tokens } = await login();
  await fixture.expireLimits();
  let status = 200, count = 0;
  while (status === 200 && count < 80) { status = (await rpc(tokens.access_token, "tools/list")).status; count++; }
  assert.equal(status, 429); assert.equal(count, 61, "60 calls per minute per user");
  const limited = await rpc(tokens.access_token, "tools/list"); assert.ok(limited.headers.get("retry-after"));
  await fixture.expireLimits();
  let writes = 0, writeStatus = 200;
  while (writeStatus === 200 && writes < 40) { writeStatus = (await rpc(tokens.access_token, "tools/call", { name: "menu_create", arguments: {} })).status; writes++; }
  assert.equal(writeStatus, 429); assert.equal(writes, 21, "20 writes per minute per user");
  assert.ok((await audits("rate_limited")).length >= 3);
});

test("password change retires every MCP token of that account", async () => {
  const { tokens } = await login();
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200);
  const jar = cookieJar();
  assert.equal((await callAuth(fixture, "/sign-in/email", { email: owner.email, password: fixture.password }, jar)).status, 200);
  const next = "QA-new-" + randomBytes(24).toString("hex");
  assert.equal((await callAuth(fixture, "/change-password", { currentPassword: fixture.password, newPassword: next }, jar)).status, 200);
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401);
  assert.equal(Number((await asOwner("SELECT count(*) FROM cms_auth.oauth_tokens WHERE user_id=$1 AND revoked_at IS NULL", [owner.id])).rows[0].count), 0);
});
