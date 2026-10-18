// Optional per-product order links (GrabFood / GoFood / ShopeeFood). Pure functions: no server-only,
// no network access, no cookies. The link is only stored text; nothing here opens or fetches the URL.
export const ORDER_LINK_KEYS = Object.freeze(["grabfoodUrl", "gofoodUrl", "shopeefoodUrl"]);
export const ORDER_LINK_LABELS = Object.freeze({ grabfoodUrl: "GrabFood", gofoodUrl: "GoFood", shopeefoodUrl: "ShopeeFood" });
export const ORDER_URL_MAX = 2048;

// SINGLE place for the host check. An empty list means "not enforced": any https host is accepted for now.
// The official host list per platform is added here later, BEFORE these links are shown on the public site.
// Hosts must be exact lowercase hostnames (no wildcard, no suffix match, punycode for IDN).
export const OFFICIAL_ORDER_HOSTS = Object.freeze({ grabfoodUrl: Object.freeze([]), gofoodUrl: Object.freeze([]), shopeefoodUrl: Object.freeze([]) });

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
