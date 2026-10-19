// Pure indexing policy (ADR-038 amendment, hardening PR-2). No "server-only": unit-testable, env injectable.
// Indexing is open only for target "production" + ALLOW_INDEXING exactly "true" + a valid https SITE_URL origin.
// Everything else fails closed: noindex, no canonical, empty sitemap, "Disallow: /".

const LOOPBACK = /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0)$/i;
const isPrivateIp = host =>
  /^\[.*\]$/.test(host) || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

// Returns a normalized origin (no trailing slash) or null. Production requires https, a public-looking host,
// and no credentials/path/query/hash.
export const parseSiteUrl = value => {
  if (typeof value !== "string" || !value.trim()) return null;
  let url;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) return null;
  const host = url.hostname;
  if (!host.includes(".") || LOOPBACK.test(host) || isPrivateIp(host) || /^\d+(\.\d+){3}$/.test(host)) return null;
  return url.origin;
};

// Origin used for absolute URLs; null unless indexing is open.
export const getIndexingState = (env = process.env) => {
  const production = env.PUBLIC_DATABASE_TARGET === "production";
  const flag = env.ALLOW_INDEXING === "true";
  const origin = production && flag ? parseSiteUrl(env.SITE_URL) : null;
  return Object.freeze({ production, flag, origin, open: Boolean(origin) });
};

export const isIndexingOpen = (env = process.env) => getIndexingState(env).open;
export const getSiteOrigin = (env = process.env) => getIndexingState(env).origin;

// Next metadata `robots` for a public page that is live. Pages that are unpublished/404/admin must use ROBOTS_NOINDEX.
export const ROBOTS_NOINDEX = Object.freeze({ index: false, follow: false });
export const ROBOTS_INDEX = Object.freeze({ index: true, follow: true });
export const getPublicRobotsMetadata = (env = process.env) => isIndexingOpen(env) ? ROBOTS_INDEX : ROBOTS_NOINDEX;

const normalizePath = path => {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[?#\s\\]/.test(path)) return null;
  return path;
};

// Absolute canonical URL for a live public path ("/", "/menu", "/menu/slug"), or null (closed or bad path).
export const getCanonicalUrl = (path, env = process.env) => {
  const origin = getSiteOrigin(env);
  const safe = normalizePath(path);
  return origin && safe ? origin + safe : null;
};
// Next `alternates` value: { canonical } when open, undefined otherwise. Never emits hreflang/languages.
export const getCanonicalAlternates = (path, env = process.env) => {
  const canonical = getCanonicalUrl(path, env);
  return canonical ? { canonical } : undefined;
};

// Single "is this public page live" rule shared by page metadata and the sitemap.
// Live only with content: a page row, or (for "menu") a non-empty catalog. Guides index needs its own page row.
export const isPageLive = (key, { page = null, productCount = 0 } = {}) =>
  Boolean(page) || (key === "menu" && productCount > 0);

// Value for src/app/robots.js (MetadataRoute.Robots).
export const getRobotsRules = (env = process.env) => {
  const origin = getSiteOrigin(env);
  if (!origin) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }], sitemap: `${origin}/sitemap.xml` };
};

// Value for src/app/sitemap.js. `paths` are live public paths only (caller filters). Empty when closed.
// No lastmod / alternates / hreflang are ever produced here.
export const getSitemapEntries = (paths, env = process.env) => {
  const origin = getSiteOrigin(env);
  if (!origin || !Array.isArray(paths)) return [];
  const seen = new Set();
  const entries = [];
  for (const path of paths) {
    const safe = normalizePath(path);
    if (!safe || seen.has(safe)) continue;
    seen.add(safe);
    entries.push({ url: origin + safe });
  }
  return entries;
};
