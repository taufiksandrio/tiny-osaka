import "server-only";
import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";

// Outbound fetch guard for media_import_url (docs/specs/mcp-owner-v2.md Q-6, AC-33..AC-37). Everything here fails closed:
// URL shape -> our own DNS answer (A + AAAA) -> every address must be public -> the connection is pinned to a validated IP
// (SNI and Host stay the original name, certificate verification stays on) -> bounded redirects, time and bytes.
// Errors carry a stable code only: the URL, host, path and query never appear in a message, so they cannot reach logs or the DB.
export const IMPORT_LIMITS = Object.freeze({ maxBytes: 10000000, timeoutMs: 15000, maxRedirects: 3, maxUrlLength: 2048, maxAddresses: 4 });
export const IMPORT_MIMES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
const FORBIDDEN_SUFFIXES = Object.freeze(["local", "internal", "localhost", "localdomain", "lan"]);

const STATUS = Object.freeze({ URL_INVALID: 400, URL_BLOCKED: 400, DNS_FAILED: 502, TOO_MANY_REDIRECTS: 400, FETCH_FAILED: 502, FETCH_TIMEOUT: 504,
  NOT_IMAGE: 400, UNSUPPORTED_TYPE: 400, SHARE_LINK_UNSUPPORTED: 400, TOO_LARGE: 413 });
export class GuardError extends Error {
  constructor(code) { super(code); this.name = "GuardError"; this.code = code; this.status = STATUS[code] ?? 400; }
}
const fail = code => { throw new GuardError(code); };

// ---- IP classification (AC-34) ----
const V4_BLOCKED = Object.freeze([
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
]);
const v4Int = parts => (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]);
const parseV4 = text => {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map(part => /^\d{1,3}$/.test(part) ? Number(part) : NaN);
  return numbers.some(value => !(value <= 255)) ? null : numbers;
};
const blockedV4Parts = parts => {
  const value = v4Int(parts);
  return V4_BLOCKED.some(([base, bits]) => { const size = 2 ** (32 - bits); return Math.floor(value / size) === Math.floor(v4Int(parseV4(base)) / size); });
};
// Eight 16-bit groups, or null when the text is not a valid IPv6 address.
const parseV6 = text => {
  let value = text.toLowerCase();
  if (value.includes("%")) return null;
  if (value.includes(".")) {
    const cut = value.lastIndexOf(":");
    const v4 = parseV4(value.slice(cut + 1));
    if (!v4) return null;
    value = `${value.slice(0, cut + 1)}${(v4[0] * 256 + v4[1]).toString(16)}:${(v4[2] * 256 + v4[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const split = half => half === "" ? [] : half.split(":");
  const head = split(halves[0]), tail = halves.length === 2 ? split(halves[1]) : [];
  if (halves.length === 1 ? head.length !== 8 : head.length + tail.length > 7) return null;
  const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail] : head;
  const numbers = groups.map(group => /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN);
  return numbers.some(Number.isNaN) ? null : numbers;
};
const embedded = (high, low) => [high >> 8, high & 255, low >> 8, low & 255];

// True when the address must not be contacted. Anything that is not a recognizable IP is blocked.
export const isBlockedIp = ip => {
  if (typeof ip !== "string") return true;
  if (net.isIPv4(ip)) return blockedV4Parts(parseV4(ip));
  if (!net.isIPv6(ip)) return true;
  const g = parseV6(ip);
  if (!g) return true;
  if (g.slice(0, 5).every(value => value === 0) && g[5] === 0xffff) return blockedV4Parts(embedded(g[6], g[7])); // IPv4-mapped
  if (g.slice(0, 6).every(value => value === 0)) return true; // ::, ::1 and the deprecated IPv4-compatible form
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 0 && g.slice(2, 6).every(value => value === 0) ? blockedV4Parts(embedded(g[6], g[7])) : true; // NAT64
  if (g[0] === 0x2002) return blockedV4Parts(embedded(g[1], g[2])); // 6to4
  if ((g[0] & 0xe000) !== 0x2000) return true; // only global unicast 2000::/3 remains; drops fc00::/7 (ULA), fe80::/10, fec0::/10, ff00::/8, 100::/64 ...
  if (g[0] === 0x2001 && g[1] < 0x200) return true; // Teredo, IETF protocol assignments, benchmarking
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if (g[0] === 0x3fff && g[1] < 0x1000) return true; // documentation
  return false;
};

// ---- URL shape (AC-33) ----
// Returns a URL object for an https:443 name-based host, or throws URL_INVALID. WHATWG parsing already folds decimal, hex and
// octal IPv4 forms into dotted quads, which isIP then catches; a numeric last label is refused as well.
export const parseImportUrl = raw => {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > IMPORT_LIMITS.maxUrlLength || /[\u0000- \u007f-\u009f\\]/.test(raw)) fail("URL_INVALID");
  let url;
  try { url = new URL(raw); } catch { return fail("URL_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password) fail("URL_INVALID");
  if (url.port !== "" && url.port !== "443") fail("URL_INVALID");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253 || host.includes(":") || host.startsWith("[") || net.isIP(host)) fail("URL_INVALID");
  const labels = host.split(".");
  if (labels.length < 2 || labels.some(label => label.length === 0 || label.length > 63)) fail("URL_INVALID");
  if (/^(\d+|0x[0-9a-f]*)$/i.test(labels.at(-1)) || !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host)) fail("URL_INVALID");
  if (FORBIDDEN_SUFFIXES.includes(labels.at(-1)) || host === "localhost") fail("URL_INVALID");
  return url;
};

// ---- DNS (AC-34, AC-35) ----
export const defaultResolve = async host => {
  const [a, aaaa] = await Promise.allSettled([dns.resolve4(host), dns.resolve6(host)]);
  return [...(a.status === "fulfilled" ? a.value : []), ...(aaaa.status === "fulfilled" ? aaaa.value : [])];
};
// One lookup per hop. ONE blocked address rejects the host; the returned list is what the connection is pinned to.
export const resolvePublic = async (host, resolve = defaultResolve) => {
  let addresses;
  try { addresses = await resolve(host); } catch { return fail("DNS_FAILED"); }
  if (!Array.isArray(addresses)) fail("DNS_FAILED");
  const unique = [...new Set(addresses)];
  if (unique.length === 0) fail("DNS_FAILED");
  if (unique.some(isBlockedIp)) fail("URL_BLOCKED");
  return unique.slice(0, IMPORT_LIMITS.maxAddresses);
};

// ---- One pinned HTTPS request (AC-35, AC-37) ----
const baseType = value => String(value ?? "").split(";", 1)[0].trim().toLowerCase();
const hop = ({ url, ip, request, maxBytes, state }) => new Promise((resolve, reject) => {
  let settled = false, responded = false;
  const finish = (fn, value) => { if (!settled) { settled = true; fn(value); } };
  const abort = (code, req, res) => { res?.destroy(); req?.destroy(); finish(reject, new GuardError(code)); };
  const req = request({
    host: ip, port: 443, method: "GET", path: `${url.pathname}${url.search}`, servername: url.hostname.replace(/\.$/, ""), agent: false,
    rejectUnauthorized: true, // certificate verification is never relaxed
    headers: { Host: url.host, "Accept-Encoding": "identity", Accept: "image/jpeg,image/png,image/webp", "User-Agent": "TinyOsaka-MediaImport/1" },
  }, res => {
    responded = true;
    const status = res.statusCode ?? 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = res.headers.location;
      res.resume();
      return location ? finish(resolve, { redirect: String(location) }) : abort("FETCH_FAILED", req, res);
    }
    if (status !== 200) return abort("FETCH_FAILED", req, res);
    const encoding = baseType(res.headers["content-encoding"]);
    if (encoding && encoding !== "identity") return abort("FETCH_FAILED", req, res);
    const mime = baseType(res.headers["content-type"]);
    if (!mime.startsWith("image/")) return abort("NOT_IMAGE", req, res);
    if (!IMPORT_MIMES.includes(mime)) return abort("UNSUPPORTED_TYPE", req, res);
    const declared = res.headers["content-length"];
    if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) return abort("TOO_LARGE", req, res);
    const chunks = [];
    let total = 0;
    res.on("data", chunk => {
      total += chunk.length; // enforced on the real bytes, so a lying Content-Length changes nothing
      if (total > maxBytes) return abort("TOO_LARGE", req, res);
      chunks.push(chunk);
    });
    res.on("end", () => finish(resolve, { buffer: Buffer.concat(chunks), mime }));
    res.on("error", () => abort("FETCH_FAILED", req, res));
    res.on("close", () => { if (!res.complete) abort("FETCH_FAILED", req, res); });
  });
  state.current = req;
  req.on("error", () => finish(reject, Object.assign(new GuardError("FETCH_FAILED"), { connectFailure: !responded })));
  req.end();
});

// Downloads one image. Returns { buffer, mime }. The total wall clock (DNS, TLS, redirects, body) is capped by timeoutMs (AC-37).
export const fetchImage = async (rawUrl, options = {}) => {
  const { resolve = defaultResolve, request = https.request, timeoutMs = IMPORT_LIMITS.timeoutMs, maxBytes = IMPORT_LIMITS.maxBytes, maxRedirects = IMPORT_LIMITS.maxRedirects } = options;
  const state = { current: null, over: false };
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { state.over = true; state.current?.destroy(); reject(new GuardError("FETCH_TIMEOUT")); }, timeoutMs); });
  const work = (async () => {
    let url = parseImportUrl(rawUrl);
    for (let hops = 0; ; hops++) {
      const addresses = await resolvePublic(url.hostname.replace(/\.$/, ""), resolve);
      let outcome = null;
      for (const ip of addresses) {
        if (state.over) fail("FETCH_TIMEOUT");
        try { outcome = await hop({ url, ip, request, maxBytes, state }); break; }
        catch (error) { if (!(error?.connectFailure)) throw error; }
      }
      if (!outcome) fail("FETCH_FAILED");
      if (outcome.buffer) return outcome;
      if (hops >= maxRedirects) fail("TOO_MANY_REDIRECTS");
      let next;
      try { next = new URL(outcome.redirect, url).href; } catch { return fail("URL_INVALID"); }
      url = parseImportUrl(next); // full re-validation: scheme, port, name, then DNS and IPs on the next loop
    }
  })();
  work.catch(() => {});
  try { return await Promise.race([work, deadline]); } finally { clearTimeout(timer); state.current?.destroy(); }
};
