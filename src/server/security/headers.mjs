// Pure builders for HTTP security headers. Loaded by next.config.mjs, so no "server-only" and no Next imports.
// PR-1 ships CSP as Report-Only; no nonce (script/style 'unsafe-inline'); no Google origins until GA4 exists.

export const buildCsp = ({ dev = false } = {}) => {
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  // The Next dev server needs eval for React refresh; never in a production build.
  if (dev) scriptSrc.push("'unsafe-eval'");
  const directives = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["media-src", ["'self'"]],
    ["connect-src", ["'self'"]],
    ["frame-src", ["https://www.youtube-nocookie.com"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
};

// Indexing is active only for the production target with the flag exactly "true" (default closed).
export const isIndexingActive = (env = process.env) =>
  env.PUBLIC_DATABASE_TARGET === "production" && env.ALLOW_INDEXING === "true";

export const buildSecurityHeaders = (env = process.env) => {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Content-Security-Policy-Report-Only", value: buildCsp({ dev: env.NODE_ENV === "development" }) },
  ];
  // HSTS only for the production target (always HTTPS); no includeSubDomains/preload until the final domain is decided.
  if (env.PUBLIC_DATABASE_TARGET === "production") {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=15552000" });
  }
  if (!isIndexingActive(env)) headers.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  return headers;
};
