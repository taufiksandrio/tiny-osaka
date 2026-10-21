// Pure builders for HTTP security headers. Loaded by next.config.mjs, so no "server-only" and no Next imports.
// CSP is enforced (PR-4; was Report-Only in PR-1); no nonce (script/style 'unsafe-inline').
// Google origins (ADR-041) are added only when GA4 is active (buildCsp({ analytics: true })); never otherwise.

import { isAnalyticsEnabled } from "../public/config.mjs";
import { isIndexingOpen } from "../public/indexing.mjs";

export const buildCsp = ({ dev = false, analytics = false } = {}) => {
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  // The Next dev server needs eval for React refresh; never in a production build.
  if (dev) scriptSrc.push("'unsafe-eval'");
  const imgSrc = ["'self'", "data:", "blob:"];
  const connectSrc = ["'self'"];
  if (analytics) {
    scriptSrc.push("https://www.googletagmanager.com");
    imgSrc.push("https://*.google-analytics.com");
    connectSrc.push("https://*.google-analytics.com", "https://*.analytics.google.com");
  }
  const directives = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", imgSrc],
    ["media-src", ["'self'"]],
    ["connect-src", connectSrc],
    ["frame-src", ["https://www.youtube-nocookie.com"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
};

// Same fail-closed rule as robots/sitemap/metadata: production + flag exactly "true" + valid https SITE_URL.
export const isIndexingActive = (env = process.env) => isIndexingOpen(env);

const NOINDEX = { key: "X-Robots-Tag", value: "noindex, nofollow" };

// Route rules for next.config.mjs. /api and /admin are permanently noindex on every target (AC-15).
export const buildHeaderRules = (env = process.env) => [
  { source: "/:path*", headers: buildSecurityHeaders(env) },
  { source: "/api/:path*", headers: [NOINDEX] },
  { source: "/admin/:path*", headers: [NOINDEX] },
  // OAuth discovery documents for the MCP server are machine endpoints, never search results.
  { source: "/.well-known/:path*", headers: [NOINDEX] },
];

export const buildSecurityHeaders = (env = process.env) => {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Content-Security-Policy", value: buildCsp({ dev: env.NODE_ENV === "development", analytics: isAnalyticsEnabled(env) }) },
  ];
  // HSTS only for the production target (always HTTPS); no includeSubDomains/preload until the final domain is decided.
  if (env.PUBLIC_DATABASE_TARGET === "production") {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=15552000" });
  }
  if (!isIndexingActive(env)) headers.push(NOINDEX);
  return headers;
};
