import "server-only";
import { hasSecretShape, hashSecret, hasScope } from "./tokens.mjs";

export const resourceUrl = baseURL => `${baseURL}/api/mcp`;
export const metadataUrl = baseURL => `${baseURL}/.well-known/oauth-protected-resource`;
export const wwwAuthenticate = (baseURL, error, scope) =>
  `Bearer resource_metadata="${metadataUrl(baseURL)}"${error ? `, error="${error}"` : ""}${scope ? `, scope="${scope}"` : ""}`;

const reject = (status, error) => ({ ok: false, status, error });

// Bearer validation on every call: token hash, expiry, revocation, resource and client state, then the CURRENT
// Owner membership from the database (AC-7). A cookie session is never accepted here (AC-2).
export const createBearerAuth = ({ pool, baseURL, tokens, now = () => new Date() }) => Object.freeze({
  authenticate: async request => {
    const header = request.headers.get("authorization") ?? "";
    const match = /^Bearer ([^\s]+)$/.exec(header);
    if (!match || !hasSecretShape("access", match[1])) return reject(401, header ? "invalid_token" : undefined);
    const row = (await pool.query(`SELECT t.id,t.user_id,t.client_id,t.scope,t.resource,t.expires_at,t.family_expires_at,t.revoked_at,
        c.disabled_at,r.role,r.enabled
      FROM cms_auth.oauth_tokens t JOIN cms_auth.oauth_clients c ON c.client_id=t.client_id
      LEFT JOIN cms_auth.roles r ON r.user_id=t.user_id WHERE t.token_hash=$1 AND t.kind='access'`, [hashSecret(match[1])])).rows[0];
    const at = now();
    if (!row || row.revoked_at || row.expires_at <= at || row.family_expires_at <= at || row.disabled_at || row.resource !== resourceUrl(baseURL)) {
      return reject(401, "invalid_token");
    }
    if (!row.enabled) {
      // Disabled or removed account: retire every token it holds, not only this one.
      await tokens.revokeUser(row.user_id).catch(() => {});
      return reject(401, "invalid_token");
    }
    if (row.role !== "owner") return reject(403);
    await pool.query("UPDATE cms_auth.oauth_tokens SET last_used_at=clock_timestamp() WHERE id=$1", [row.id]).catch(() => {});
    return { ok: true, actor: { subject: row.user_id, role: "owner", clientId: row.client_id, scope: row.scope, tokenId: row.id } };
  },
  hasScope,
});
