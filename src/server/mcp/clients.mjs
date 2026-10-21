import "server-only";
import { randomBytes } from "node:crypto";

// Owner-registered public OAuth clients (no secret, no dynamic registration). Redirect URIs are https or loopback only.
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
export const MAX_REDIRECTS = 5;

export const parseRedirectUri = value => {
  const unsafe = ch => ch.charCodeAt(0) <= 32 || ch.charCodeAt(0) === 127 || ch === "\\";
  if (typeof value !== "string" || value.length > 2048 || [...value].some(unsafe)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.hash || url.username || url.password || value.includes("#")) return null;
  if (url.protocol === "https:") return url.hostname ? url : null;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return url;
  return null;
};
export const isLoopbackUri = value => { const url = parseRedirectUri(value); return Boolean(url && url.protocol === "http:"); };
// Exact match; loopback clients may choose any port at request time (RFC 8252 section 7.3).
export const redirectMatches = (registered, requested) => {
  if (typeof requested !== "string" || !parseRedirectUri(requested)) return false;
  if (registered.includes(requested)) return true;
  const target = new URL(requested);
  if (target.protocol !== "http:") return false;
  return registered.some(item => {
    const url = parseRedirectUri(item);
    return url && url.protocol === "http:" && url.hostname === target.hostname && url.pathname === target.pathname && url.search === target.search;
  });
};

export class ClientError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const parseClientInput = input => {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["name", "redirectUris"].includes(key))) throw new ClientError("INVALID_INPUT");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80 || /[<>\u0000-\u001f\u007f]/.test(name)) throw new ClientError("INVALID_NAME");
  const uris = input.redirectUris;
  if (!Array.isArray(uris) || !uris.length || uris.length > MAX_REDIRECTS || new Set(uris).size !== uris.length || uris.some(uri => !parseRedirectUri(uri))) throw new ClientError("INVALID_REDIRECT_URI");
  return { name, redirectUris: uris };
};

export const createClients = ({ pool }) => {
  const dto = row => ({ clientId: row.client_id, name: row.name, redirectUris: row.redirect_uris, createdAt: row.created_at.toISOString(),
    disabledAt: row.disabled_at ? row.disabled_at.toISOString() : null, activeConnections: Number(row.active ?? 0) });
  return Object.freeze({
    find: async clientId => typeof clientId === "string" && clientId.length <= 128 ?
      (await pool.query("SELECT client_id,name,redirect_uris,disabled_at FROM cms_auth.oauth_clients WHERE client_id=$1", [clientId])).rows[0] ?? null : null,
    list: async () => (await pool.query(`SELECT c.client_id,c.name,c.redirect_uris,c.created_at,c.disabled_at,
      (SELECT count(DISTINCT t.family_id) FROM cms_auth.oauth_tokens t WHERE t.client_id=c.client_id AND t.revoked_at IS NULL AND t.kind='refresh'
        AND t.expires_at>clock_timestamp() AND t.family_expires_at>clock_timestamp()) AS active
      FROM cms_auth.oauth_clients c ORDER BY c.created_at DESC LIMIT 100`)).rows.map(dto),
    create: async ({ createdBy, input }) => {
      const { name, redirectUris } = parseClientInput(input);
      const clientId = "mcpc_" + randomBytes(16).toString("base64url");
      const row = (await pool.query("INSERT INTO cms_auth.oauth_clients(client_id,name,redirect_uris,created_by) VALUES ($1,$2,$3,$4) RETURNING client_id,name,redirect_uris,created_at,disabled_at",
        [clientId, name, redirectUris, createdBy])).rows[0];
      return dto(row);
    },
    // Disabling revokes every token of the client immediately (AC-9).
    disable: async clientId => {
      if (typeof clientId !== "string" || clientId.length > 128) throw new ClientError("NOT_FOUND", 404);
      const done = (await pool.query("UPDATE cms_auth.oauth_clients SET disabled_at=clock_timestamp() WHERE client_id=$1 AND disabled_at IS NULL", [clientId])).rowCount;
      if (!done) {
        const exists = (await pool.query("SELECT 1 FROM cms_auth.oauth_clients WHERE client_id=$1", [clientId])).rowCount;
        if (!exists) throw new ClientError("NOT_FOUND", 404);
      }
      await pool.query("UPDATE cms_auth.oauth_tokens SET revoked_at=clock_timestamp() WHERE client_id=$1 AND revoked_at IS NULL", [clientId]);
      return { disabled: true, clientId };
    },
  });
};
