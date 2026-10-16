export const ABSOLUTE_SESSION_MS = 24 * 60 * 60 * 1000;
export const IDLE_SESSION_MS = 60 * 60 * 1000;
export const isLiveSession = (session, lastActiveAt, now = new Date()) => {
  const current = +new Date(now), created = +new Date(session.createdAt), active = +new Date(lastActiveAt), expires = +new Date(session.expiresAt);
  return [current, created, active, expires].every(Number.isFinite) && created <= current && active <= current &&
    current < created + ABSOLUTE_SESSION_MS && current < active + IDLE_SESSION_MS && current < expires;
};
export const authPaths = new Set([
  "/sign-in/email", "/sign-out", "/get-session", "/request-password-reset", "/reset-password", "/send-verification-email", "/verify-email", "/change-password",
  "/two-factor/enable", "/two-factor/disable", "/two-factor/verify-totp", "/two-factor/verify-backup-code", "/two-factor/generate-backup-codes",
]);
export const ownerMfaPaths = new Set(["/two-factor/enable", "/two-factor/disable", "/two-factor/generate-backup-codes"]);
export const isSafeCallback = (value, origin) => {
  if (value == null) return true;
  try { const url = new URL(value, origin); return url.origin === origin && (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) && !url.username && !url.password; }
  catch { return false; }
};
