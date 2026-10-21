import "server-only";
import { generateSecret, hashSecret, hasSecretShape, isValidChallenge, verifyPkce, normalizeScope, SCOPES } from "./tokens.mjs";
import { redirectMatches } from "./clients.mjs";
import { resourceUrl } from "./auth.mjs";
import { limitedResponse } from "./limits.mjs";
import { readCmsInput, CmsRequestError } from "../cms/request-policy.mjs";

export class OAuthError extends Error {
  // redirect=true only after redirect_uri was matched to the client's registration; otherwise errors never leave this origin.
  constructor(error, status = 400, { redirect = false, description } = {}) {
    super(error); this.error = error; this.status = status; this.redirect = redirect; this.description = description;
  }
}
const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache", "X-Robots-Tag": "noindex, nofollow" };
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
const oauthJson = error => json({ error: error.error, ...(error.description ? { error_description: error.description } : {}) }, error.status,
  error.status === 401 ? { "WWW-Authenticate": 'Bearer error="invalid_client"' } : {});

export const buildProtectedResourceMetadata = baseURL => ({ resource: resourceUrl(baseURL), authorization_servers: [baseURL],
  scopes_supported: [...SCOPES], bearer_methods_supported: ["header"], resource_name: "Tiny Osaka MCP" });
export const buildAuthorizationServerMetadata = baseURL => ({ issuer: baseURL,
  authorization_endpoint: `${baseURL}/api/mcp/oauth/authorize`, token_endpoint: `${baseURL}/api/mcp/oauth/token`, revocation_endpoint: `${baseURL}/api/mcp/oauth/revoke`,
  response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], response_modes_supported: ["query"],
  code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], revocation_endpoint_auth_methods_supported: ["none"],
  scopes_supported: [...SCOPES] });
export const metadataResponse = body => Response.json(body, { headers: { "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex, nofollow" } });

const AUTHORIZE_FIELDS = ["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource", "response_type"];
// Plain string map; repeated or oversized parameters are rejected (RFC 6749 section 3.1).
const plain = entries => {
  const out = {};
  for (const [key, value] of entries) {
    if (Object.hasOwn(out, key) || typeof value !== "string" || value.length > 2048) throw new OAuthError("invalid_request", 400);
    out[key] = value;
  }
  return out;
};
const readForm = async request => {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/x-www-form-urlencoded") throw new OAuthError("invalid_request", 415);
  if (Number(request.headers.get("content-length")) > 8192) throw new OAuthError("invalid_request", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new OAuthError("invalid_request");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new OAuthError("invalid_request", 413); }
      text += decoder.decode(value, { stream: true });
    }
    return plain(new URLSearchParams(text + decoder.decode()).entries());
  } catch (error) {
    throw error instanceof OAuthError ? error : new OAuthError("invalid_request");
  } finally { reader.releaseLock(); }
};
const withParams = (uri, params) => {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, value);
  return url.toString();
};
const clientKey = form => String(form.client_id ?? "").slice(0, 128);

export const createOAuth = ({ pool, baseURL, clients, tokens, audit, limits, authenticateSession, now = () => new Date() }) => {
  const resource = resourceUrl(baseURL);
  const isOwner = async userId => Boolean((await pool.query("SELECT 1 FROM cms_auth.roles WHERE user_id=$1 AND enabled AND role='owner'", [userId])).rowCount);

  // Validates an authorization request against the registered client. Throws OAuthError (redirect=true once the URI is trusted).
  const validateAuthorize = async params => {
    if (Object.keys(params).some(key => !AUTHORIZE_FIELDS.includes(key))) throw new OAuthError("invalid_request");
    const client = await clients.find(params.client_id);
    if (!client || client.disabled_at) throw new OAuthError("invalid_request", 400, { description: "Klien tidak dikenal." });
    if (!redirectMatches(client.redirect_uris, params.redirect_uri)) throw new OAuthError("invalid_request", 400, { description: "redirect_uri tidak cocok." });
    const fail = (error, description) => new OAuthError(error, 400, { redirect: true, description });
    if (params.state !== undefined && params.state.length > 512) throw fail("invalid_request", "state terlalu panjang.");
    if (params.response_type !== undefined && params.response_type !== "code") throw fail("unsupported_response_type");
    if (!isValidChallenge(params.code_challenge)) throw fail("invalid_request", "code_challenge S256 wajib.");
    if (params.code_challenge_method !== "S256") throw fail("invalid_request", "Hanya S256 yang didukung.");
    const scope = normalizeScope(params.scope);
    if (!scope) throw fail("invalid_scope");
    if (params.resource !== undefined && params.resource !== resource) throw fail("invalid_target");
    return { client, redirectUri: params.redirect_uri, state: params.state, scope, resource, codeChallenge: params.code_challenge };
  };
  const forwardParams = (params, valid) => ({ client_id: params.client_id, redirect_uri: params.redirect_uri, code_challenge: params.code_challenge,
    code_challenge_method: "S256", scope: valid.scope, resource, ...(params.state !== undefined ? { state: params.state } : {}) });

  const authorizeGet = async request => {
    try {
      const params = plain(new URL(request.url).searchParams.entries());
      let valid;
      try { valid = await validateAuthorize(params); }
      catch (error) {
        if (error instanceof OAuthError && error.redirect) {
          return new Response(null, { status: 302, headers: { ...NO_STORE,
            Location: withParams(params.redirect_uri, { error: error.error, error_description: error.description, state: params.state }) } });
        }
        throw error;
      }
      const limited = await limits.hit("authorize", "client:" + valid.client.client_id, { clientId: valid.client.client_id });
      if (!limited.allowed) return limitedResponse(limited.retryAfter);
      const target = new URL("/admin/mcp/authorize", baseURL);
      for (const [key, value] of Object.entries(forwardParams(params, valid))) target.searchParams.set(key, value);
      return new Response(null, { status: 302, headers: { ...NO_STORE, Location: target.toString() } });
    } catch (error) {
      if (error instanceof OAuthError) return oauthJson(error);
      return json({ error: "server_error" }, 503);
    }
  };

  // For the consent page (server component): what the Owner must see, plus the exact form to post back. Throws OAuthError.
  const describe = async searchParams => {
    const params = plain(Object.entries(searchParams ?? {}).flatMap(([key, value]) => Array.isArray(value) ? value.map(item => [key, item]) : [[key, value]]));
    const valid = await validateAuthorize(params);
    return { clientName: valid.client.name, clientId: valid.client.client_id, scope: valid.scope.split(" "), redirectUri: valid.redirectUri,
      form: forwardParams(params, valid) };
  };

  const authorizePost = async request => {
    let input;
    try {
      input = await readCmsInput(request, baseURL); // Origin + Sec-Fetch-Site + JSON + 80 KB cap (CSRF protection).
      const actor = await authenticateSession(request.headers);
      if (!actor) return json({ error: "login_required" }, 401);
      const limited = await limits.hit("authorize", "user:" + actor.subject, { userId: actor.subject });
      if (!limited.allowed) return limitedResponse(limited.retryAfter);
      if (actor.role !== "owner" || !await isOwner(actor.subject)) {
        await audit.safe({ userId: actor.subject, clientId: String(input.client_id ?? "").slice(0, 128), event: "authorize_rejected", outcome: "denied", code: "FORBIDDEN" });
        return json({ error: "access_denied" }, 403);
      }
      const { decision, ...params } = input;
      if (!["approve", "deny"].includes(decision)) throw new OAuthError("invalid_request");
      const valid = await validateAuthorize(plain(Object.entries(params)));
      if (decision === "deny") {
        await audit.record({ userId: actor.subject, clientId: valid.client.client_id, event: "authorize_denied", outcome: "denied", code: "access_denied" });
        return json({ redirectTo: withParams(valid.redirectUri, { error: "access_denied", state: valid.state }) });
      }
      const code = generateSecret("code");
      // Audit first: if the row cannot be written, no code is issued.
      await audit.record({ userId: actor.subject, clientId: valid.client.client_id, event: "code_issued", outcome: "ok" });
      await pool.query(`INSERT INTO cms_auth.oauth_codes(code_hash,client_id,user_id,family_id,redirect_uri,code_challenge,challenge_method,scope,resource,expires_at)
        VALUES ($1,$2,$3,gen_random_uuid(),$4,$5,'S256',$6,$7,now() + interval '60 seconds')`,
      [hashSecret(code), valid.client.client_id, actor.subject, valid.redirectUri, valid.codeChallenge, valid.scope, valid.resource]);
      await audit.safe({ userId: actor.subject, clientId: valid.client.client_id, event: "authorize_approved", outcome: "ok" });
      return json({ redirectTo: withParams(valid.redirectUri, { code, state: valid.state }) });
    } catch (error) {
      if (error instanceof CmsRequestError) return json({ error: error.code }, error.status);
      if (error instanceof OAuthError) {
        // Once the client and redirect URI are trusted, report to the client; otherwise answer on this origin only.
        if (error.redirect && typeof input?.redirect_uri === "string") {
          return json({ redirectTo: withParams(input.redirect_uri, { error: error.error, error_description: error.description, state: input.state }) });
        }
        return oauthJson(error);
      }
      return json({ error: "server_error" }, 503);
    }
  };

  const grantAuthorizationCode = async form => {
    const client = await clients.find(form.client_id);
    if (!client || client.disabled_at) throw new OAuthError("invalid_client", 401);
    if (!hasSecretShape("code", form.code) || typeof form.redirect_uri !== "string") throw new OAuthError("invalid_grant");
    const codeHash = hashSecret(form.code);
    const claimed = (await pool.query(`UPDATE cms_auth.oauth_codes SET used_at=clock_timestamp() WHERE code_hash=$1 AND used_at IS NULL
      RETURNING client_id,user_id,family_id,redirect_uri,code_challenge,scope,resource,expires_at`, [codeHash])).rows[0];
    if (!claimed) {
      const used = (await pool.query("SELECT family_id,user_id,client_id FROM cms_auth.oauth_codes WHERE code_hash=$1", [codeHash])).rows[0];
      if (used) {
        // Replay of a used code: retire anything it produced (AC-5).
        await tokens.revokeFamily(used.family_id);
        await audit.safe({ userId: used.user_id, clientId: used.client_id, event: "code_replay", outcome: "denied", code: "invalid_grant" });
      }
      throw new OAuthError("invalid_grant");
    }
    // The code is consumed from here on, whatever the outcome; every failure is a plain invalid_grant.
    if (claimed.client_id !== client.client_id || claimed.expires_at <= now() || form.redirect_uri !== claimed.redirect_uri ||
      !verifyPkce(form.code_verifier, claimed.code_challenge) || (form.resource !== undefined && form.resource !== claimed.resource) ||
      !await isOwner(claimed.user_id)) {
      await audit.safe({ userId: claimed.user_id, clientId: client.client_id, event: "request_denied", tool: "token", outcome: "denied", code: "invalid_grant" });
      throw new OAuthError("invalid_grant");
    }
    const issued = await tokens.issue({ familyId: claimed.family_id, clientId: client.client_id, userId: claimed.user_id, scope: claimed.scope, resource: claimed.resource });
    await audit.safe({ userId: claimed.user_id, clientId: client.client_id, event: "token_issued", outcome: "ok" });
    return issued;
  };
  const grantRefreshToken = async form => {
    const client = await clients.find(form.client_id);
    if (!client || client.disabled_at) throw new OAuthError("invalid_client", 401);
    let scope;
    if (form.scope !== undefined) { scope = normalizeScope(form.scope); if (!scope) throw new OAuthError("invalid_scope"); }
    const result = await tokens.rotate(form.refresh_token, { clientId: client.client_id, scope, resource: form.resource });
    if (!result.ok) {
      if (result.reason === "reuse") await audit.safe({ userId: result.row.user_id, clientId: client.client_id, event: "reuse_detected", outcome: "denied", code: "invalid_grant" });
      throw new OAuthError(result.reason === "scope" ? "invalid_scope" : "invalid_grant");
    }
    if (!await isOwner(result.row.user_id)) {
      await tokens.revokeFamily(result.row.family_id);
      throw new OAuthError("invalid_grant");
    }
    await audit.safe({ userId: result.row.user_id, clientId: client.client_id, event: "token_refreshed", outcome: "ok" });
    return result.tokens;
  };

  const token = async request => {
    try {
      const form = await readForm(request);
      const limited = await limits.hit("token", "client:" + clientKey(form), { clientId: clientKey(form) });
      if (!limited.allowed) return limitedResponse(limited.retryAfter);
      let issued;
      if (form.grant_type === "authorization_code") issued = await grantAuthorizationCode(form);
      else if (form.grant_type === "refresh_token") issued = await grantRefreshToken(form);
      else throw new OAuthError("unsupported_grant_type");
      return json({ access_token: issued.access, token_type: "Bearer", expires_in: issued.expiresIn, refresh_token: issued.refresh, scope: issued.scope });
    } catch (error) {
      if (error instanceof OAuthError) return oauthJson(error);
      return json({ error: "server_error" }, 503);
    }
  };

  // RFC 7009: 200 for every well-formed request; the whole token family is retired when the token belongs to the client.
  const revoke = async request => {
    try {
      const form = await readForm(request);
      const limited = await limits.hit("revoke", "client:" + clientKey(form), { clientId: clientKey(form) });
      if (!limited.allowed) return limitedResponse(limited.retryAfter);
      if (typeof form.token === "string" && (hasSecretShape("access", form.token) || hasSecretShape("refresh", form.token))) {
        const row = await tokens.find(form.token);
        if (row && row.client_id === form.client_id) {
          await tokens.revokeFamily(row.family_id);
          await audit.safe({ userId: row.user_id, clientId: row.client_id, event: "token_revoked", outcome: "ok" });
        }
      }
      return json({});
    } catch (error) {
      if (error instanceof OAuthError) return oauthJson(error);
      return json({ error: "server_error" }, 503);
    }
  };
  return Object.freeze({ authorizeGet, authorizePost, token, revoke, describe, validateAuthorize });
};
