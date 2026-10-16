import "server-only";
import { createHmac } from "node:crypto";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { twoFactor } from "better-auth/plugins/two-factor";
import { APIError } from "better-auth/api";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/auth-schema.mjs";
import { getAuthConfig } from "./config.mjs";
import { authPaths, ownerMfaPaths, isSafeCallback, isLiveSession, ABSOLUTE_SESSION_MS, IDLE_SESSION_MS } from "./policy.mjs";

const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
const failure = (status = 400) => json({ message: "Permintaan tidak dapat diproses. Periksa isian atau coba lagi." }, status);
const resetResponse = () => json({ status: true, message: "Jika akun memenuhi syarat, tautan reset akan dikirim." });
const readBody = async request => {
  if (Number(request.headers.get("content-length")) > 8192) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); return null; }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
};

export const createAuthService = ({ pool, env = process.env, sendEmail } = {}) => {
  const config = getAuthConfig(env);
  const db = drizzle(pool, { schema });
  const audit = (event, userId = null) => pool.query("INSERT INTO cms_auth.audit(user_id,event) VALUES ($1,$2)", [userId, event]);
  const membership = async userId => (await pool.query("SELECT role FROM cms_auth.roles WHERE user_id=$1 AND enabled", [userId])).rows[0];
  // Atomic bounded fixed-window counters; keys are HMACs, never raw email/IP.
  const consume = async (input, rule) => {
    const key = createHmac("sha256", config.secret).update(input).digest("hex");
    const rows = (await pool.query(`INSERT INTO cms_auth.request_limits(key,count,window_start) VALUES ($1,1,clock_timestamp())
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN cms_auth.request_limits.window_start <= clock_timestamp()-($2 * interval '1 second') THEN 1 ELSE cms_auth.request_limits.count+1 END,
      window_start=CASE WHEN cms_auth.request_limits.window_start <= clock_timestamp()-($2 * interval '1 second') THEN clock_timestamp() ELSE cms_auth.request_limits.window_start END
      WHERE cms_auth.request_limits.count<$3 OR cms_auth.request_limits.window_start <= clock_timestamp()-($2 * interval '1 second') RETURNING count`, [key, rule.window, rule.max])).rows;
    return { allowed: rows.length === 1, retryAfter: rows.length ? null : rule.window };
  };
  const deliver = async (kind, user, url) => {
    if (typeof sendEmail !== "function") throw new Error("Email delivery is not configured.");
    if (kind === "reset" && !user.emailVerified) return;
    await sendEmail({ kind, to: user.email, url });
  };
  const auth = betterAuth({
    appName: "Tiny Osaka CMS", secret: config.secret, baseURL: config.baseURL, basePath: "/api/auth",
    trustedOrigins: [config.baseURL], telemetry: { enabled: false }, logger: { disabled: true },
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 6, maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 900, revokeSessionsOnPasswordReset: true,
      sendResetPassword: typeof sendEmail === "function" ? async ({ user, token }) => deliver("reset", user, `${config.baseURL}/admin/reset-password#token=${encodeURIComponent(token)}`) : undefined,
      onPasswordReset: async ({ user }) => audit("password_reset", user.id),
    },
    emailVerification: { sendOnSignUp: false, autoSignInAfterVerification: false,
      sendVerificationEmail: typeof sendEmail === "function" ? async ({ user, url }) => deliver("verify", user,
        `${config.baseURL}/admin/verify-email#token=${encodeURIComponent(new URL(url).searchParams.get("token"))}`) : undefined,
      afterEmailVerification: async user => audit("email_verified", user.id),
    },
    session: { expiresIn: ABSOLUTE_SESSION_MS / 1000, disableSessionRefresh: true, cookieCache: { enabled: false }, freshAge: 300 },
    advanced: { useSecureCookies: config.baseURL.startsWith("https:"), ipAddress: { ipAddressHeaders: [] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" } },
    rateLimit: { enabled: true, window: 60, max: 100, customStorage: { consume }, customRules: {
      "/sign-in/email": { window: 60, max: 10 }, "/request-password-reset": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 5 }, "/two-factor/*": { window: 60, max: 10 },
    } },
    plugins: [twoFactor({ issuer: "Tiny Osaka", trustDeviceMaxAge: 0, totpOptions: { digits: 6, period: 30 } })],
    databaseHooks: { session: { create: { before: async session => {
      if (!await membership(session.userId)) throw new APIError("UNAUTHORIZED", { message: "Account unavailable." });
      return { data: session };
    } } } },
  });

  const authenticate = async headers => {
    const result = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
    if (!result) return null;
    const row = (await pool.query(`UPDATE cms_auth.session_activity a SET last_active_at=clock_timestamp()
      FROM cms_auth.sessions s,cms_auth.roles r WHERE a.session_id=$1 AND s.id=a.session_id AND r.user_id=s.user_id AND r.enabled
      AND s.created_at>clock_timestamp()-($2 * interval '1 second') AND s.expires_at>clock_timestamp()
      AND a.last_active_at>clock_timestamp()-($3 * interval '1 second') RETURNING r.role,a.last_active_at,clock_timestamp() AS now`,
    [result.session.id, ABSOLUTE_SESSION_MS / 1000, IDLE_SESSION_MS / 1000])).rows[0];
    if (!row || !isLiveSession(result.session, row.last_active_at, row.now)) {
      await pool.query("DELETE FROM cms_auth.sessions WHERE id=$1", [result.session.id]);
      await audit("session_expired", result.user.id);
      return null;
    }
    return { subject: result.user.id, role: row.role, name: result.user.name,
      emailVerified: result.user.emailVerified, twoFactorEnabled: result.user.twoFactorEnabled };
  };

  const handle = async request => {
    try {
      const url = new URL(request.url), path = url.pathname.slice("/api/auth".length);
      if (!authPaths.has(path)) return failure(404);
      if (!isSafeCallback(url.searchParams.get("callbackURL"), config.baseURL)) return failure();
      if (!["GET", "POST"].includes(request.method)) return failure(405);
      if (request.method === "GET" && path !== "/get-session") return failure(405);
      if (request.method === "POST" && request.headers.get("origin") !== config.baseURL) return failure(403);
      let body = {};
      if (request.method === "POST") {
        if (!request.headers.get("content-type")?.startsWith("application/json")) return failure(415);
        const raw = await readBody(request);
        if (raw === null) return failure(413);
        try { body = JSON.parse(raw); } catch { return failure(); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return failure();
        if (body.trustDevice || body.method === "otp" || [body.callbackURL, body.redirectTo, url.searchParams.get("callbackURL")].some(value => !isSafeCallback(value, config.baseURL))) return failure();
        request = new Request(request, { body: raw });
      }
      if (!(await consume("route:" + path, { window: 60, max: ["/request-password-reset", "/send-verification-email"].includes(path) ? 5 : 100 })).allowed) {
        await audit("rate_limited"); return failure(429);
      }
      const actor = await authenticate(request.headers);
      if (ownerMfaPaths.has(path) && actor?.role !== "owner") return failure(actor ? 403 : 401);
      const sessionRequired = ["/sign-out", "/change-password", "/send-verification-email"].includes(path);
      if (sessionRequired && !actor) return failure(401);
      if (["/two-factor/verify-totp", "/two-factor/verify-backup-code"].includes(path) && actor && actor.role !== "owner") return failure(403);
      if (path === "/get-session") return json(actor ? { user: actor } : null);
      if (["/request-password-reset", "/send-verification-email"].includes(path) && typeof sendEmail !== "function") return failure(503);
      if (path === "/request-password-reset") {
        if (typeof body.email !== "string" || body.email.length > 254) return failure();
        const limited = await consume("reset-account:" + body.email.toLowerCase(), { window: 900, max: 3 });
        if (!limited.allowed) { await audit("rate_limited"); return failure(429); }
        const account = (await pool.query("SELECT email_verified FROM cms_auth.users u JOIN cms_auth.roles r ON r.user_id=u.id WHERE lower(u.email)=lower($1) AND r.enabled", [body.email])).rows[0];
        await audit("reset_requested");
        if (!account?.email_verified) return resetResponse();
      }
      if (path === "/sign-in/email" && typeof body.email === "string") {
        if (!(await consume("login-account:" + body.email.toLowerCase(), { window: 900, max: 5 })).allowed) {
          await audit("rate_limited"); return failure(429);
        }
      }
      if (path === "/change-password") {
        // The library revokes other sessions; this endpoint requires that behavior.
        request = new Request(request, { body: JSON.stringify({ ...body, revokeOtherSessions: true }) });
      }
      if (path === "/verify-email") {
        if (typeof body.token !== "string" || body.token.length > 4096) return failure();
        // Translate internally; no token is sent in an HTTP URL or server access log.
        request = new Request(`${config.baseURL}/api/auth/verify-email?token=${encodeURIComponent(body.token)}&callbackURL=${encodeURIComponent(config.baseURL + "/admin/login")}`,
          { headers: request.headers });
      }
      const response = await auth.handler(request);
      const headers = new Headers(response.headers); headers.set("Cache-Control", "no-store"); headers.set("Pragma", "no-cache");
      if (path === "/verify-email" && response.status >= 300 && response.status < 400) {
        const location = new URL(headers.get("location"), config.baseURL);
        return location.searchParams.has("error") ? failure() : json({ status: true });
      }
      if (!response.ok) {
        if (path === "/sign-in/email") await audit("login_failed");
        const safe = failure(response.status); safe.headers.delete("set-cookie");
        for (const cookie of headers.getSetCookie()) safe.headers.append("set-cookie", cookie);
        return safe;
      }
      const event = { "/sign-out": "logout", "/change-password": "password_changed", "/two-factor/disable": "mfa_disabled",
        "/two-factor/verify-totp": actor && !actor.twoFactorEnabled ? "mfa_enabled" : "mfa_verified", "/two-factor/verify-backup-code": "mfa_verified" }[path];
      let eventActor = actor;
      if (event === "mfa_verified" && !actor) {
        const cookie = headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
        eventActor = await authenticate(new Headers({ cookie }));
        if (eventActor) await audit("login_success", eventActor.subject);
      }
      if (event) await audit(event, eventActor?.subject);
      if (path === "/request-password-reset") return resetResponse();
      if (!headers.get("content-type")?.includes("application/json")) return new Response(response.body, { status: response.status, headers });
      const data = await response.json();
      if (path === "/sign-in/email" && !data.twoFactorRedirect) await audit("login_success", data.user?.id);
      // Session tokens stay in HttpOnly cookies; never duplicate them in JSON.
      delete data.token;
      if (data.session) delete data.session.token;
      return new Response(JSON.stringify(data), { status: response.status, headers });
    } catch { return failure(503); }
  };
  return Object.freeze({ handle, authenticate });
};
