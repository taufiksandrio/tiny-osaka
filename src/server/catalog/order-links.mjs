// Optional per-product order links (GrabFood / GoFood / ShopeeFood). Pure functions: no server-only,
// no network access, no cookies. The link is only stored text; nothing here opens or fetches the URL.
export const ORDER_LINK_KEYS = Object.freeze(["grabfoodUrl", "gofoodUrl", "shopeefoodUrl"]);
export const ORDER_LINK_LABELS = Object.freeze({ grabfoodUrl: "GrabFood", gofoodUrl: "GoFood", shopeefoodUrl: "ShopeeFood" });
export const ORDER_URL_MAX = 2048;

// SINGLE place for the host check. An empty list means "not enforced": any https host is accepted for now.
// The official host list per platform is added here later, BEFORE these links are shown on the public site.
// Hosts must be exact lowercase hostnames (no wildcard, no suffix match, punycode for IDN).
// Filled 2026-10-18 from hosts observed in dev data and clearly owned by the platform. ShopeeFood stays empty
// (no link seen, no host approved yet): the public path fails closed for it. Keep in sync with the CMS copy.
export const OFFICIAL_ORDER_HOSTS = Object.freeze({
  grabfoodUrl: Object.freeze(["app.grab.com"]),
  gofoodUrl: Object.freeze(["gofood.link"]),
  shopeefoodUrl: Object.freeze([]),
});

export const isOfficialOrderHost = (key, hostname, hosts = OFFICIAL_ORDER_HOSTS) => {
  const allowed = hosts[key];
  return !Array.isArray(allowed) || allowed.length === 0 || allowed.includes(hostname);
};

// Whitespace, control characters, quotes, angle brackets and backslashes never belong in a stored link.
const FORBIDDEN = /[\u0000- \u007f"<>\\]/;
const fail = (key, reason) => {
  const label = ORDER_LINK_LABELS[key];
  const messages = {
    scheme: `Link ${label} harus diawali https://.`,
    host: `Link ${label} harus berasal dari domain resmi ${label}.`,
    length: `Link ${label} maksimal ${ORDER_URL_MAX} karakter.`,
    invalid: `Link ${label} tidak valid.`,
  };
  return { ok: false, field: key, message: messages[reason] };
};

// Returns { ok: true, value: string | null } (null = remove the link) or { ok: false, field, message }.
export const checkOrderUrl = (key, input, { hosts = OFFICIAL_ORDER_HOSTS } = {}) => {
  if (!ORDER_LINK_KEYS.includes(key)) throw new Error("Unknown order link key.");
  if (input === null) return { ok: true, value: null };
  if (typeof input !== "string") return fail(key, "invalid");
  const raw = input.trim();
  if (!raw) return { ok: true, value: null };
  if (raw.length > ORDER_URL_MAX) return fail(key, "length");
  if (FORBIDDEN.test(raw)) return fail(key, "invalid");
  // Only https. "javascript:", "data:", "http:", "file:" and scheme-less text all land here.
  if (!/^https:\/\//i.test(raw)) return fail(key, "scheme");
  // WHATWG parsing forgives extra slashes ("https:///host"); the stored text must have the host right after "//".
  if (/^https:\/\/[/?#]/i.test(raw)) return fail(key, "invalid");
  let url;
  try { url = new URL(raw); } catch { return fail(key, "invalid"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return fail(key, "invalid");
  // WHATWG drops the default port, so an explicit :443 parses to "" and anything else stays set.
  if (url.port !== "") return fail(key, "invalid");
  if (!isOfficialOrderHost(key, url.hostname, hosts)) return fail(key, "host");
  // The database CHECK is case-sensitive: store the scheme in lowercase, the rest as pasted.
  return { ok: true, value: `https://${raw.slice(8)}` };
};

// Public order links (menu card dialog). Fixed display order and public platform ids.
export const PUBLIC_ORDER_PLATFORMS = Object.freeze([
  Object.freeze({ platform: "gofood", key: "gofoodUrl" }),
  Object.freeze({ platform: "grabfood", key: "grabfoodUrl" }),
  Object.freeze({ platform: "shopeefood", key: "shopeefoodUrl" }),
]);

// Returns [{ platform, href }] in the order GoFood, GrabFood, ShopeeFood. Fail closed: a platform whose
// allowlist is empty yields no link (unlike the CMS save check, which only enforces a non-empty list), and
// every link must pass checkOrderUrl (https, no userinfo/port, exact host). Never throws, never fetches.
export const publicOrderLinks = (entry, hosts = OFFICIAL_ORDER_HOSTS) => {
  const links = [];
  for (const { platform, key } of PUBLIC_ORDER_PLATFORMS) {
    const allowed = hosts?.[key];
    const value = entry?.[key];
    if (!Array.isArray(allowed) || allowed.length === 0 || typeof value !== "string") continue;
    const result = checkOrderUrl(key, value, { hosts });
    if (result.ok && result.value) links.push({ platform, href: result.value });
  }
  return links;
};

// Replaces the three raw link fields of an entry by `orderLinks`; the raw URLs never leave the server.
export const withPublicOrderLinks = (entry, hosts = OFFICIAL_ORDER_HOSTS) => {
  const publicEntry = { ...entry, orderLinks: publicOrderLinks(entry, hosts) };
  for (const key of ORDER_LINK_KEYS) delete publicEntry[key];
  return publicEntry;
};
