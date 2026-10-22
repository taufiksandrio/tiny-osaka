import "server-only";
import { generateSecret, hashSecret, hasSecretShape } from "./tokens.mjs";
import { limitedResponse } from "./limits.mjs";
import { CmsRequestError, cmsFail, verifyCmsOrigin } from "../cms/request-policy.mjs";
import { MediaError } from "../media/validation.mjs";

// Photo upload for MCP (docs/specs/mcp-owner-v2.md Q-5). One cms_auth.mcp_uploads row = one upload with two single-use paths:
//   agent: POST /api/mcp/upload/<token>  (no cookie, 5 min)      user: page /admin/mcp/upload/<token> (Owner session, 15 min)
// Both end in the same createCmsMedia.upload (JPG/PNG/WebP, 10 MB, 4096 px, Railway volume): no parallel validation or storage.
// Tokens are 256-bit and stored as SHA-256 hashes only; they never reach logs, audit rows or error messages.
export const AGENT_TTL_MS = 5 * 60 * 1000;
export const USER_TTL_MS = 15 * 60 * 1000;
export const MAX_UPLOAD_BYTES = 10000000;
export const UPLOAD_MIMES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
// Slack for multipart framing around a file of MAX_UPLOAD_BYTES.
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 1000000;
export const UPLOAD_HEADERS = Object.freeze({ "Cache-Control": "no-store", "Pragma": "no-cache", "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
// Messages for the user page, keyed by stable code (Indonesian).
export const UPLOAD_MESSAGES = Object.freeze({
  TOKEN_EXPIRED: "Tautan unggah sudah kedaluwarsa. Minta Claude membuat permintaan baru.",
  TOKEN_USED: "Token sudah dipakai.",
  TOKEN_INVALID: "Tautan unggah tidak dikenali.",
  MIME_MISMATCH: "Jenis berkas tidak sama dengan yang diminta.",
  SIZE_MISMATCH: "Ukuran berkas tidak sama dengan yang diminta.",
  NOT_IMAGE: "Berkas bukan gambar JPG, PNG, atau WebP yang valid.",
  OVERSIZED: "Berkas melebihi batas 10 MB.",
  REJECTED: "Unggahan ditolak.",
  AUTH_REQUIRED: "Sesi Owner tidak valid. Masuk lagi lalu coba kembali.",
  FORBIDDEN: "Halaman ini hanya untuk Owner yang membuat permintaan.",
  CSRF_REJECTED: "Permintaan ditolak. Muat ulang halaman lalu coba lagi.",
  INVALID_INPUT: "Pilih satu berkas foto lalu coba lagi.",
  UPLOAD_FAILED: "Penyimpanan sedang bermasalah. Coba lagi beberapa saat; tautan masih berlaku.",
  RECORD_FAILED: "Foto tersimpan tetapi hasilnya gagal dicatat. Tautan tidak berlaku lagi; periksa pustaka media sebelum meminta unggahan baru agar tidak ada foto ganda.",
});

// Own-property lookup only: ?r=__proto__ or ?r=constructor must never reach Object.prototype members.
export const uploadMessage = code => typeof code === "string" && Object.hasOwn(UPLOAD_MESSAGES, code) ? UPLOAD_MESSAGES[code] : null;

const COLUMNS = "id,user_id,client_id,target,mime_declared,byte_size_declared,asset_id,status,expires_at,agent_used_at,user_used_at,created_at,failure_code";
const PATHS = Object.freeze({ agent: Object.freeze({ kind: "uploadAgent", hash: "agent_token_hash", used: "agent_used_at", ttl: AGENT_TTL_MS }),
  user: Object.freeze({ kind: "uploadUser", hash: "user_token_hash", used: "user_used_at", ttl: USER_TTL_MS }) });

// Where an upload stands for one path. "ready" is the only state that may still be used.
export const stateOf = (row, path, at) => {
  const mine = row[PATHS[path].used];
  if (row.status === "done") return mine ? "done" : "used";
  if (row.status === "rejected") return "rejected";
  if (row.agent_used_at || row.user_used_at) return "used";
  if (at.getTime() > row.created_at.getTime() + PATHS[path].ttl || at.getTime() > row.expires_at.getTime()) return "expired";
  return "ready";
};
const UNSUPPORTED = Object.freeze({ status: 415, body: { code: "UNSUPPORTED_MEDIA_TYPE" } });

export const createUploads = ({ pool, baseURL, limits, audit, cmsFor, authenticateSession, now = () => new Date() }) => {
  const find = async (token, only) => {
    for (const path of only ? [only] : ["agent", "user"]) {
      if (!hasSecretShape(PATHS[path].kind, token)) continue;
      const row = (await pool.query(`SELECT ${COLUMNS} FROM cms_auth.mcp_uploads WHERE ${PATHS[path].hash}=$1`, [hashSecret(token)])).rows[0];
      if (row) return { path, row };
    }
    return null;
  };
  const event = (row, name, outcome, code = null) => audit.safe({ userId: row.user_id, clientId: row.client_id, event: name, tool: "media_upload", target: row.target, outcome, code });
  // Owner membership and the OAuth client are re-read for EVERY upload (AC-24); a demoted/disabled Owner cannot finish one.
  const ownerActive = async row => (await pool.query(
    `SELECT 1 FROM cms_auth.roles r, cms_auth.oauth_clients c WHERE r.user_id=$1 AND r.role='owner' AND r.enabled AND c.client_id=$2 AND c.disabled_at IS NULL`,
    [row.user_id, row.client_id])).rowCount === 1;
  // Marks the row rejected. Before a claim it only applies while neither path is taken; after a claim the caller owns the row.
  const reject = async (row, code, claimed = false) => {
    const done = (await pool.query(`UPDATE cms_auth.mcp_uploads SET status='rejected',failure_code=$2 WHERE id=$1 AND status='pending'${claimed ? "" : " AND agent_used_at IS NULL AND user_used_at IS NULL"}`,
      [row.id, code])).rowCount === 1;
    if (done) await event(row, "upload_rejected", "denied", code);
    return done;
  };
  // Atomic single-use claim: exactly one caller gets the row (AC-26). Both TTLs are checked against the same clock value.
  const claim = async (row, path, at) => (await pool.query(
    `UPDATE cms_auth.mcp_uploads SET ${PATHS[path].used}=$2 WHERE id=$1 AND status='pending' AND agent_used_at IS NULL AND user_used_at IS NULL
      AND created_at + ($3 * interval '1 millisecond') >= $2 AND expires_at >= $2 RETURNING id`, [row.id, at, PATHS[path].ttl])).rowCount === 1;
  // A transient failure (5xx) returns the token: nothing was stored, the caller may retry (AC-25).
  const release = row => pool.query("UPDATE cms_auth.mcp_uploads SET agent_used_at=NULL,user_used_at=NULL WHERE id=$1 AND status='pending'", [row.id]);

  const request = async (actor, input) => {
    const agentToken = generateSecret("uploadAgent"), userToken = generateSecret("uploadUser");
    const at = now(), expires = new Date(at.getTime() + USER_TTL_MS);
    const row = (await pool.query(`INSERT INTO cms_auth.mcp_uploads(user_id,client_id,agent_token_hash,user_token_hash,target,mime_declared,byte_size_declared,expires_at,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [actor.subject, actor.clientId, hashSecret(agentToken), hashSecret(userToken),
      input.target ?? null, input.mime ?? null, input.byteSize ?? null, expires, at])).rows[0];
    await audit.safe({ userId: actor.subject, clientId: actor.clientId, event: "upload_requested", tool: "media_upload_request", target: input.target ?? null, outcome: "ok" });
    return { uploadId: row.id, expiresAt: expires.toISOString(), agentUploadUrl: `${baseURL}/api/mcp/upload/${agentToken}`, userUploadUrl: `${baseURL}/admin/mcp/upload/${userToken}` };
  };

  // Only the owner of the request (same user and same OAuth client) can read it; anything else is NOT_FOUND (AC-27).
  const status = async (actor, { uploadId }) => {
    const row = (await pool.query(`SELECT ${COLUMNS} FROM cms_auth.mcp_uploads WHERE id=$1 AND user_id=$2 AND client_id=$3`, [uploadId, actor.subject, actor.clientId])).rows[0];
    if (!row) cmsFail("NOT_FOUND", 404);
    if (row.status === "done") return { status: "done", assetId: row.asset_id };
    if (row.status === "rejected") return { status: "rejected", failureCode: row.failure_code };
    return { status: now().getTime() > row.expires_at.getTime() ? "expired" : "pending" };
  };

  // Wrong/unknown token attempts (AC-30). Service auth deliberately ignores forwarded IP headers, so there is no trustworthy source
  // address: the bucket key is the hash of the first 20 characters of the requested token (same prefix = same bucket), plus a
  // generous global backstop. Valid tokens never reach this path, so these limits cannot block a legitimate upload.
  const wrongToken = async token => {
    const prefix = hashSecret(String(token ?? "").slice(0, 20)).slice(0, 32);
    const byPrefix = await limits.hit("uploadToken", prefix);
    return byPrefix.allowed ? limits.hit("uploadTokenAll", "all") : byPrefix;
  };

  // Data for the user page. Unknown, foreign or malformed tokens look identical ("invalid"); nothing is consumed here.
  const describe = async (token, actor) => {
    const found = await find(token, "user");
    if (!found) {
      const limited = await wrongToken(token);
      return { state: limited.allowed ? "invalid" : "limited" };
    }
    if (!actor || actor.role !== "owner" || actor.subject !== found.row.user_id) return { state: "invalid" };
    const state = stateOf(found.row, "user", now());
    return { state, failureCode: found.row.failure_code, target: found.row.target, mime: found.row.mime_declared, byteSize: found.row.byte_size_declared === null ? null : Number(found.row.byte_size_declared) };
  };

  // Request body -> { stream, mime, size } or a ready-made refusal. multipart carries exactly one file; binary carries the file itself.
  const readFile = async request => {
    const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    const header = request.headers.get("content-length");
    const length = header !== null && /^\d+$/.test(header) ? Number(header) : null;
    if (type === "multipart/form-data") {
      if (length === null) return { refusal: { status: 411, body: { code: "LENGTH_REQUIRED" } } };
      if (length > MAX_MULTIPART_BYTES) return { reject: "OVERSIZED", status: 413 };
      let form;
      try { form = await request.formData(); } catch { return { refusal: { status: 400, body: { code: "INVALID_INPUT" } } }; }
      const entries = [...form.entries()];
      if (entries.length !== 1 || typeof entries[0][1] === "string") return { refusal: { status: 400, body: { code: "INVALID_INPUT" } } };
      const file = entries[0][1];
      const mime = file.type.split(";", 1)[0].trim().toLowerCase();
      if (file.size > MAX_UPLOAD_BYTES) return { reject: "OVERSIZED", status: 413 };
      if (!UPLOAD_MIMES.includes(mime)) return { reject: "NOT_IMAGE", status: 400 };
      return { stream: file.stream(), mime, size: file.size };
    }
    if (!UPLOAD_MIMES.includes(type)) return { refusal: UNSUPPORTED };
    if (length !== null && length > MAX_UPLOAD_BYTES) return { reject: "OVERSIZED", status: 413 };
    if (!request.body) return { refusal: { status: 400, body: { code: "INVALID_INPUT" } } };
    return { stream: request.body, mime: type, size: length };
  };

  // Maps what createCmsMedia.upload threw to: a content rejection (token consumed) or a transient failure (token returned).
  const classify = error => {
    if (error instanceof MediaError) {
      if (error.code === "INVALID_MEDIA" || error.code === "INSPECTION_FAILED") return { code: "NOT_IMAGE", status: 400 };
      if (error.code === "INPUT_TOO_LARGE") return { code: "OVERSIZED", status: 413 };
      if (["PERSISTENCE_FAILED", "STORAGE_UNAVAILABLE", "VIDEO_UNAVAILABLE", "UPLOAD_TIMEOUT"].includes(error.code)) return null;
      return { code: "REJECTED", status: 400 };
    }
    if (error instanceof CmsRequestError && error.status < 500) return { code: "REJECTED", status: error.status === 401 ? 401 : 400 };
    return null;
  };

  // Writes the final outcome after the asset was stored. A few quick attempts; if they all fail, the row is marked rejected
  // (RECORD_FAILED, asset_id kept for the operator) on a best-effort basis and the token remains consumed.
  const RECORD_ATTEMPTS = 3;
  const recordDone = async (row, path, assetId) => {
    for (let attempt = 0; attempt < RECORD_ATTEMPTS; attempt++) {
      try {
        const saved = await pool.query(`UPDATE cms_auth.mcp_uploads SET asset_id=$2,status='done',failure_code=NULL WHERE id=$1 AND status='pending' AND ${PATHS[path].used} IS NOT NULL`, [row.id, assetId]);
        if (saved.rowCount === 1) return true;
        break; // the row is no longer pending: retrying cannot help
      } catch { /* transient database trouble: try again */ }
    }
    try {
      await pool.query("UPDATE cms_auth.mcp_uploads SET asset_id=$2,status='rejected',failure_code='RECORD_FAILED' WHERE id=$1 AND status='pending'", [row.id, assetId]);
      await event(row, "upload_rejected", "denied", "RECORD_FAILED");
    } catch { /* nothing more can be done; the token is still not released */ }
    return false;
  };

  const complete = async (request, token) => {
    const found = await find(token);
    if (!found) {
      const limited = await wrongToken(token);
      return limited.allowed ? { status: 404, body: { code: "TOKEN_INVALID" } } : { limited };
    }
    const { path, row } = found;
    if (path === "user") {
      // Cookie path: Owner session of the same user, same-origin form post (existing CMS CSRF rule). Nothing is consumed on refusal.
      try { verifyCmsOrigin(request, baseURL); } catch { return { path, status: 403, body: { code: "CSRF_REJECTED" } }; }
      const session = await authenticateSession(request.headers);
      if (!session) return { path, status: 401, body: { code: "AUTH_REQUIRED" } };
      if (session.role !== "owner" || session.subject !== row.user_id) return { path, status: 403, body: { code: "FORBIDDEN" } };
    }
    const at = now();
    const state = stateOf(row, path, at);
    if (state === "expired") return { path, status: 410, body: { code: "TOKEN_EXPIRED" } };
    if (state !== "ready") return { path, status: 410, body: { code: "TOKEN_USED" } };
    if (!await ownerActive(row)) {
      await reject(row, "REJECTED");
      return { path, status: 401, body: { code: "AUTH_REQUIRED" } };
    }
    const file = await readFile(request);
    if (file.refusal) return { path, ...file.refusal };
    const refuse = async (code, status) => { await reject(row, code); return { path, status, body: { code } }; };
    if (file.reject) return refuse(file.reject, file.status);
    if (row.mime_declared && file.mime !== row.mime_declared) return refuse("MIME_MISMATCH", 400);
    if (row.byte_size_declared !== null) {
      if (file.size === null) return { path, status: 411, body: { code: "LENGTH_REQUIRED" } };
      if (file.size !== Number(row.byte_size_declared)) return refuse("SIZE_MISMATCH", 400);
    }
    if (!await claim(row, path, at)) return { path, status: 410, body: { code: "TOKEN_USED" } };
    let asset;
    try {
      asset = await cmsFor({ subject: row.user_id, role: "owner", clientId: row.client_id }).media.upload(new Headers(), file.stream, file.mime);
    } catch (error) {
      const failure = classify(error);
      if (!failure) {
        await release(row).catch(() => {});
        console.error("MCP upload failed; token kept for retry.");
        return { path, status: 503, body: { code: "UPLOAD_FAILED" } };
      }
      await reject(row, failure.code, true);
      return { path, status: failure.status, body: { code: failure.code } };
    }
    // From here the asset EXISTS: the token is never released again, or a retry would store a duplicate and orphan this one.
    if (!await recordDone(row, path, asset.id)) {
      console.error("MCP upload stored but its outcome was not recorded; token stays used.");
      return { path, status: 500, body: { code: "RECORD_FAILED" } };
    }
    await event(row, "upload_completed", "ok").catch(() => {});
    return { path, status: 200, body: { assetId: asset.id } };
  };

  const respond = (result, token, request) => {
    const headers = { ...UPLOAD_HEADERS };
    if (result.limited) return withHeaders(limitedResponse(result.limited.retryAfter, { code: "RATE_LIMITED" }), headers);
    // Browser form post from the user page: send the Owner back to the page, which shows the outcome from the database.
    if (result.path === "user" && (request.headers.get("accept") ?? "").includes("text/html")) {
      const code = result.status === 200 ? "ok" : result.body.code;
      return new Response(null, { status: 303, headers: { ...headers, Location: `/admin/mcp/upload/${token}?r=${encodeURIComponent(code)}` } });
    }
    return Response.json(result.body, { status: result.status, headers });
  };
  const withHeaders = (response, headers) => { for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; };

  const handle = async (request, token) => {
    try { return respond(await complete(request, token), token, request); }
    catch {
      console.error("MCP upload failed.");
      return Response.json({ code: "UPLOAD_FAILED" }, { status: 503, headers: UPLOAD_HEADERS });
    }
  };
  return Object.freeze({ request, status, describe, handle });
};
