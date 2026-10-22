import "server-only";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

// Opaque MCP OAuth credentials. Only SHA-256 hashes are stored; plaintext exists once, in the token response.
export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_IDLE_MS = 60 * 60 * 1000;
export const FAMILY_TTL_MS = 24 * 60 * 60 * 1000;
export const CODE_TTL_MS = 60 * 1000;
export const SCOPES = Object.freeze(["mcp:read", "mcp:write"]);

const PREFIX = Object.freeze({ access: "tomcp_at_", refresh: "tomcp_rt_", code: "tomcp_ac_",
  // Single-use photo upload credentials (agent URL and user page); stored only as hashes.
  uploadAgent: "tomcp_ug_", uploadUser: "tomcp_uu_" });
const SHAPE = Object.freeze(Object.fromEntries(Object.entries(PREFIX).map(([kind, prefix]) => [kind, new RegExp(`^${prefix}[A-Za-z0-9_-]{43}$`)])));

export const generateSecret = kind => PREFIX[kind] + randomBytes(32).toString("base64url");
export const hashSecret = value => createHash("sha256").update(String(value)).digest("hex");
// Cheap shape check before any DB lookup; malformed credentials never reach the database.
export const hasSecretShape = (kind, value) => typeof value === "string" && SHAPE[kind].test(value);

// PKCE S256 only (RFC 7636). The verifier is 43-128 unreserved characters; `plain` does not exist here.
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
export const isValidChallenge = value => typeof value === "string" && CHALLENGE.test(value);
export const challengeFor = verifier => createHash("sha256").update(verifier).digest("base64url");
export const verifyPkce = (verifier, challenge) => {
  if (typeof verifier !== "string" || !VERIFIER.test(verifier) || !isValidChallenge(challenge)) return false;
  return timingSafeEqual(Buffer.from(challengeFor(verifier)), Buffer.from(challenge));
};

// Scope strings are space-delimited subsets of SCOPES. Returns the canonical string or null when invalid.
export const normalizeScope = value => {
  if (value === undefined || value === null || value === "") return SCOPES.join(" ");
  if (typeof value !== "string" || value.length > 64) return null;
  const parts = value.split(" ").filter(Boolean);
  if (!parts.length || parts.some(part => !SCOPES.includes(part))) return null;
  return SCOPES.filter(scope => parts.includes(scope)).join(" ");
};
export const hasScope = (granted, needed) => typeof granted === "string" && granted.split(" ").includes(needed);
export const isSubsetScope = (requested, granted) => requested.split(" ").every(scope => hasScope(granted, scope));

// Expiry rules shared by issue and refresh: access <= 15 minutes, refresh idle <= 1 hour, family <= 24 hours.
export const expiryFor = (now, familyExpiresAt) => {
  const cap = familyExpiresAt.getTime();
  return { access: new Date(Math.min(now.getTime() + ACCESS_TTL_MS, cap)), refresh: new Date(Math.min(now.getTime() + REFRESH_IDLE_MS, cap)) };
};
export const isLive = (row, now) => !row.revoked_at && row.expires_at > now && row.family_expires_at > now;

const SELECT_TOKEN = `SELECT id,kind,family_id,client_id,user_id,scope,resource,expires_at,family_expires_at,revoked_at,replaced_by FROM cms_auth.oauth_tokens WHERE token_hash=$1`;
const INSERT_TOKEN = `INSERT INTO cms_auth.oauth_tokens(id,token_hash,kind,family_id,client_id,user_id,scope,resource,expires_at,family_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`;

export const createTokenStore = ({ pool, now = () => new Date() }) => {
  const insertPair = async (client, { familyId, clientId, userId, scope, resource, familyExpiresAt }) => {
    const at = now();
    const expires = expiryFor(at, familyExpiresAt);
    const access = generateSecret("access"), refresh = generateSecret("refresh");
    const accessId = randomUUID(), refreshId = randomUUID();
    await client.query(INSERT_TOKEN, [accessId, hashSecret(access), "access", familyId, clientId, userId, scope, resource, expires.access, familyExpiresAt]);
    await client.query(INSERT_TOKEN, [refreshId, hashSecret(refresh), "refresh", familyId, clientId, userId, scope, resource, expires.refresh, familyExpiresAt]);
    return { access, refresh, refreshId, expiresIn: Math.max(1, Math.round((expires.access.getTime() - at.getTime()) / 1000)), scope };
  };
  const transaction = async work => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  };
  const revokeFamily = async (familyId, db = pool) =>
    (await db.query("UPDATE cms_auth.oauth_tokens SET revoked_at=clock_timestamp() WHERE family_id=$1 AND revoked_at IS NULL", [familyId])).rowCount;
  return Object.freeze({
    // First token pair for an authorization code; the family starts here and ends 24 hours later.
    issue: params => transaction(client => insertPair(client, { ...params, familyExpiresAt: new Date(now().getTime() + FAMILY_TTL_MS) })),
    // Rotates a refresh token. Reuse of an already-rotated token revokes the whole family.
    // Returns { ok:true, tokens, row } | { ok:false, reason, row? }.
    rotate: async (refreshToken, { clientId, scope, resource }) => {
      if (!hasSecretShape("refresh", refreshToken)) return { ok: false, reason: "invalid" };
      return transaction(async client => {
        const row = (await client.query(SELECT_TOKEN + " FOR UPDATE", [hashSecret(refreshToken)])).rows[0];
        if (!row || row.kind !== "refresh" || row.client_id !== clientId) return { ok: false, reason: "invalid" };
        if (row.replaced_by) {
          await revokeFamily(row.family_id, client);
          return { ok: false, reason: "reuse", row };
        }
        if (row.revoked_at) return { ok: false, reason: "revoked", row };
        if (row.expires_at <= now() || row.family_expires_at <= now()) return { ok: false, reason: "expired", row };
        if (resource && resource !== row.resource) return { ok: false, reason: "invalid", row };
        const nextScope = scope ?? row.scope;
        if (!isSubsetScope(nextScope, row.scope)) return { ok: false, reason: "scope", row };
        // One live access token per family: retire the previous one together with the old refresh token.
        await client.query("UPDATE cms_auth.oauth_tokens SET revoked_at=clock_timestamp() WHERE family_id=$1 AND kind='access' AND revoked_at IS NULL", [row.family_id]);
        await client.query("UPDATE cms_auth.oauth_tokens SET revoked_at=clock_timestamp() WHERE id=$1", [row.id]);
        const tokens = await insertPair(client, { familyId: row.family_id, clientId, userId: row.user_id, scope: nextScope, resource: row.resource, familyExpiresAt: row.family_expires_at });
        await client.query("UPDATE cms_auth.oauth_tokens SET replaced_by=$1 WHERE id=$2", [tokens.refreshId, row.id]);
        return { ok: true, tokens, row };
      });
    },
    find: token => pool.query(SELECT_TOKEN, [hashSecret(token)]).then(result => result.rows[0] ?? null),
    revokeFamily,
    revokeUser: userId => pool.query("UPDATE cms_auth.oauth_tokens SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL", [userId]),
    revokeClient: clientId => pool.query("UPDATE cms_auth.oauth_tokens SET revoked_at=clock_timestamp() WHERE client_id=$1 AND revoked_at IS NULL", [clientId]),
    prune: async () => {
      await pool.query("DELETE FROM cms_auth.oauth_codes WHERE expires_at < clock_timestamp() - interval '1 hour'");
      await pool.query("DELETE FROM cms_auth.oauth_tokens WHERE family_expires_at < clock_timestamp() - interval '1 day'");
    },
  });
};
