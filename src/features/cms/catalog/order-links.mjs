// Client mirror of src/server/catalog/order-links.mjs (checkOrderUrl). Pure, no network: the link is only text.
// The server stays authoritative. If OFFICIAL_ORDER_HOSTS is filled on the server, copy the same list here.
export const ORDER_LINK_KEYS = Object.freeze(["grabfoodUrl", "gofoodUrl", "shopeefoodUrl"]);
export const ORDER_LINK_LABELS = Object.freeze({ grabfoodUrl: "GrabFood", gofoodUrl: "GoFood", shopeefoodUrl: "ShopeeFood" });
export const ORDER_URL_MAX = 2048;
export const OFFICIAL_ORDER_HOSTS = Object.freeze({ grabfoodUrl: Object.freeze([]), gofoodUrl: Object.freeze([]), shopeefoodUrl: Object.freeze([]) });
const FORBIDDEN = /[\u0000- \u007f"<>\\]/;
const fail = (key, reason) => {
  const label = ORDER_LINK_LABELS[key];
  return { ok: false, field: key, message: { scheme: `Link ${label} harus diawali https://.`, host: `Link ${label} harus berasal dari domain resmi ${label}.`,
    length: `Link ${label} maksimal ${ORDER_URL_MAX} karakter.`, invalid: `Link ${label} tidak valid.` }[reason] };
};
// { ok: true, value: string | null } (null = no link) or { ok: false, field, message }.
export const checkOrderUrl = (key, input, { hosts = OFFICIAL_ORDER_HOSTS } = {}) => {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: true, value: null };
  if (raw.length > ORDER_URL_MAX) return fail(key, "length");
  if (FORBIDDEN.test(raw)) return fail(key, "invalid");
  if (!/^https:\/\//i.test(raw)) return fail(key, "scheme");
  if (/^https:\/\/[/?#]/i.test(raw)) return fail(key, "invalid");
  let url;
  try { url = new URL(raw); } catch { return fail(key, "invalid"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.port !== "") return fail(key, "invalid");
  const allowed = hosts[key];
  if (Array.isArray(allowed) && allowed.length && !allowed.includes(url.hostname)) return fail(key, "host");
  return { ok: true, value: `https://${raw.slice(8)}` };
};
