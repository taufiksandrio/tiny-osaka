// Pure helpers for the one-off catalog CSV import. No I/O, no network, no database.

// RFC 4180 style parser: quoted fields, "" escapes, CRLF/LF, optional BOM. Returns rows of strings.
export const parseCsv = input => {
  const text = String(input).replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", quoted = false, touched = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') { quoted = true; touched = true; }
    else if (ch === ",") { row.push(field); field = ""; touched = true; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (touched || field) { row.push(field); rows.push(row); }
      row = []; field = ""; touched = false;
    } else { field += ch; touched = true; }
  }
  if (quoted) throw new Error("CSV tidak valid: tanda kutip tidak ditutup.");
  if (touched || field) { row.push(field); rows.push(row); }
  return rows;
};

// Header row -> objects keyed by column name. Rejects rows with the wrong number of columns.
export const csvRecords = (text, required = []) => {
  const [header, ...body] = parseCsv(text);
  if (!header) throw new Error("CSV kosong.");
  const names = header.map(name => name.trim());
  for (const name of required) if (!names.includes(name)) throw new Error(`Kolom wajib tidak ada: ${name}`);
  return body.map((cells, index) => {
    if (cells.length !== names.length) throw new Error(`Baris data ${index + 1}: jumlah kolom ${cells.length}, diharapkan ${names.length}.`);
    return Object.fromEntries(names.map((name, i) => [name, cells[i]]));
  });
};

// Whole IDR amounts only: "85000", "85,000", "107.500". Anything else (decimals, currency text) is rejected -> null.
export const parsePrice = value => {
  const raw = String(value ?? "").trim();
  if (!/^(\d{1,3}([.,]\d{3})+|\d+)$/.test(raw)) return null;
  const price = Number(raw.replace(/[.,]/g, ""));
  return Number.isSafeInteger(price) && price > 0 ? price : null;
};

// Health / ingredient / quality claims are unverified (AGENTS.md: no unverified ingredient claims).
// A description matching any of these is imported EMPTY and listed in the dry-run report.
// Case-insensitive, whole-word (Latin letters). Decision: be conservative; the Owner can write a description later.
export const CLAIM_KEYWORDS = Object.freeze([
  // health / nutrition
  "vitamin", "probiotik", "antioksidan", "rendah lemak", "kalsium", "protein", "energi",
  // authenticity / origin (autentik = spelling variant of otentik). Promotional wording such as premium, terbaik,
  // pilihan, kualitas, impor is deliberately NOT flagged (user decision, option A).
  "otentik", "autentik", "asli", "himalaya",
]);
const CLAIM_PATTERN = new RegExp(`(?<![a-z0-9])(${CLAIM_KEYWORDS.map(word => word.replace(/ /g, "\\s+")).join("|")})(?![a-z0-9])`, "gi");

// Returns the distinct matched keywords (lowercase); [] when the text is clean.
export const findClaims = text => [...new Set([...String(text ?? "").matchAll(CLAIM_PATTERN)].map(match => match[1].toLowerCase().replace(/\s+/g, " ")))];

export const normalizeName = name => String(name ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

// Maps raw CSV records to import plans. Pure: `existingNames` is a Set of normalizeName() values.
// Plan entry: { line, name, price, description, descriptionCleared, claims, links, status: "create" | "skip" | "reject", reason? }
export const planImport = (records, existingNames = new Set()) => {
  const seen = new Set(existingNames);
  return records.map((record, index) => {
    const line = index + 2;
    const name = String(record.nama_menu ?? "").trim();
    const entry = { line, name, category: String(record.kategori ?? "").trim() };
    if (!name) return { ...entry, status: "reject", reason: "nama kosong" };
    const price = parsePrice(record.harga);
    if (price === null) return { ...entry, status: "reject", reason: `harga tidak valid: "${record.harga}"` };
    const key = normalizeName(name);
    const raw = String(record.deskripsi ?? "").trim();
    const claims = findClaims(raw);
    if (seen.has(key)) {
      return { ...entry, price, status: "skip", reason: existingNames.has(key) ? "nama sudah ada" : "nama ganda di CSV",
        description: claims.length ? "" : raw, descriptionCleared: claims.length > 0, claims };
    }
    seen.add(key);
    const links = {};
    if (String(record.deeplink_grab ?? "").trim()) links.grabfoodUrl = record.deeplink_grab.trim();
    if (String(record.deeplink_gofood ?? "").trim()) links.gofoodUrl = record.deeplink_gofood.trim();
    return { ...entry, price, description: claims.length ? "" : raw, descriptionCleared: claims.length > 0, claims, links, status: "create" };
  });
};

// --fill-descriptions: for an EXISTING card, the CSV description to store, or null. Only when the stored description is
// empty and the CSV text is non-empty and passed the claim filter. Never overwrites a filled description.
export const fillableDescription = (card, plan) => {
  if (!card || plan?.reason !== "nama sudah ada" || plan.descriptionCleared) return null;
  if (String(card.description ?? "").trim()) return null;
  return plan.description ? plan.description : null;
};

// Product input for createProduct. Description key is always sent; link keys only when present.
export const toProductInput = plan => ({ name: plan.name, description: plan.description, price: plan.price, ...plan.links });

// ---- Photos (--photos <csv>) ----
// Only this exact host is ever contacted. Order deeplinks are never fetched.
export const PHOTO_HOST = "huawei-food-cms.grab.com";
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_TIMEOUT_MS = 20000;
export const PHOTO_MAX_REDIRECTS = 3;

// Returns { ok: true, value: URL string } or { ok: false, reason }. Pure: no network.
export const checkPhotoUrl = input => {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return { ok: false, reason: "url kosong" };
  if (/[\u0000- \u007f"<>\\]/.test(raw)) return { ok: false, reason: "url berisi karakter terlarang" };
  if (!/^https:\/\//i.test(raw) || /^https:\/\/[/?#]/i.test(raw)) return { ok: false, reason: "harus https" };
  let url;
  try { url = new URL(raw); } catch { return { ok: false, reason: "url tidak valid" }; }
  if (url.protocol !== "https:" || url.username || url.password) return { ok: false, reason: "userinfo tidak diizinkan" };
  if (url.port !== "") return { ok: false, reason: "port tidak diizinkan" };
  if (url.hostname !== PHOTO_HOST) return { ok: false, reason: `host bukan ${PHOTO_HOST}` };
  return { ok: true, value: url.href };
};

// A redirect target must itself pass checkPhotoUrl (a relative Location is resolved against the current URL first).
export const checkRedirect = (current, location) => {
  if (typeof location !== "string" || !location) return { ok: false, reason: "redirect tanpa Location" };
  let target;
  try { target = new URL(location, current).href; } catch { return { ok: false, reason: "redirect tidak valid" }; }
  const checked = checkPhotoUrl(target);
  return checked.ok ? checked : { ok: false, reason: `redirect ditolak: ${checked.reason}` };
};

// One line, <= 500 chars, no markup (same rules as imageAlt in product-input.mjs). null when it cannot be valid.
export const photoAlt = name => {
  const trimmed = String(name ?? "").trim().replace(/\s+/g, " ");
  const alt = `Foto ${trimmed}`;
  return trimmed && alt.length <= 500 && !/[<>\u0000-\u001f\u007f]/.test(alt) ? alt : null;
};

// name (normalized) -> raw URL string. First occurrence wins.
export const photoMap = records => {
  const map = new Map();
  for (const record of records) {
    const key = normalizeName(record.nama_menu), url = String(record.url_foto_grabfood ?? "").trim();
    if (key && url && !map.has(key)) map.set(key, url);
  }
  return map;
};

// Downloads one photo. Redirects are followed manually and each hop is re-validated. Throws Error(message) on any problem.
export const downloadPhoto = async (url, { fetchImpl = fetch, maxBytes = PHOTO_MAX_BYTES, timeoutMs = PHOTO_TIMEOUT_MS } = {}) => {
  let current = checkPhotoUrl(url);
  if (!current.ok) throw new Error(current.reason);
  const signal = AbortSignal.timeout(timeoutMs);
  const drop = response => response.body?.cancel?.().catch(() => {});
  for (let hop = 0; hop <= PHOTO_MAX_REDIRECTS; hop++) {
    const response = await fetchImpl(current.value, { redirect: "manual", signal, headers: { Accept: "image/jpeg,image/png,image/webp" } });
    if (response.status >= 300 && response.status < 400) {
      await drop(response);
      current = checkRedirect(current.value, response.headers.get("location"));
      if (!current.ok) throw new Error(current.reason);
      continue;
    }
    if (response.status !== 200) { await drop(response); throw new Error(`HTTP ${response.status}`); }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) { await drop(response); throw new Error("ukuran melebihi batas"); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("respons kosong");
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel().catch(() => {}); throw new Error("ukuran melebihi batas"); }
      chunks.push(value);
    }
    if (!total) throw new Error("respons kosong");
    return Buffer.concat(chunks);
  }
  throw new Error("terlalu banyak redirect");
};

export const categorySummary = records => {
  const counts = new Map();
  for (const record of records) { const key = String(record.kategori ?? "").trim() || "(kosong)"; counts.set(key, (counts.get(key) ?? 0) + 1); }
  return [...counts].map(([category, count]) => ({ category, count }));
};
