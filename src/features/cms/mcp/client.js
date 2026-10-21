"use client";
// Same-origin JSON requests for the Owner MCP screens (CSRF is enforced by the server via Origin + JSON).
const messages = {
  INVALID_NAME: "Nama klien wajib diisi (maksimal 80 karakter) dan tidak boleh memuat tanda < atau >.",
  INVALID_REDIRECT_URI: "Redirect URI tidak valid. Gunakan https, atau http://localhost / 127.0.0.1 / [::1]; tanpa fragmen (#) dan tanpa kredensial. Maksimal 5 alamat tanpa duplikat.",
  INVALID_INPUT: "Isian tidak valid. Periksa nama dan redirect URI.",
  NOT_FOUND: "Klien tidak ditemukan.",
};
export const mcpErrorMessage = (status, code) => {
  if (messages[code]) return messages[code];
  if (status === 401 || code === "AUTH_REQUIRED") return "Sesi berakhir. Masuk kembali sebelum melanjutkan.";
  if (status === 403) return "Hanya Owner yang dapat mengelola koneksi MCP.";
  if (status === 429) return "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.";
  if (status >= 500) return "Layanan sedang bermasalah. Coba lagi beberapa saat lagi.";
  return "Permintaan gagal. Periksa isian dan koneksi, lalu coba lagi.";
};
const request = async (url, method, data, toMessage) => {
  let response;
  try {
    response = await fetch(url, { method, credentials: "same-origin", cache: "no-store",
      ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) });
  } catch { throw Object.assign(new Error("Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi."), { code: "NETWORK" }); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(toMessage(response.status, result.code ?? result.error)), { code: result.code ?? result.error, status: response.status });
  return result;
};
const clientsRequest = (path, method, data) => request("/api/cms/mcp/clients" + path, method, data, mcpErrorMessage);
export const loadClients = () => clientsRequest("", "GET");
export const createClient = values => clientsRequest("", "POST", values);
export const disableClient = clientId => clientsRequest("/" + encodeURIComponent(clientId), "DELETE");

const decisionMessage = (status, code) => {
  if (status === 401 || code === "login_required") return "Sesi berakhir. Masuk kembali lalu ulangi proses dari aplikasi klien.";
  if (status === 403 || code === "access_denied") return "Hanya Owner yang dapat memberi izin koneksi MCP.";
  if (status === 429) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if (status >= 500) return "Layanan sedang bermasalah. Coba lagi beberapa saat lagi.";
  return "Permintaan izin tidak valid atau sudah kedaluwarsa. Ulangi proses dari aplikasi klien.";
};
export const sendDecision = (form, decision) => request("/api/mcp/oauth/authorize", "POST", { ...form, decision }, decisionMessage);
// Only follow a redirect to https or a loopback http target, never javascript: or other schemes.
export const safeRedirect = value => {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" || (url.protocol === "http:" && loopback);
  } catch { return false; }
};
// Client-side mirror of the server rule, for early feedback only (the server stays authoritative).
export const isValidRedirectUri = value => {
  if (typeof value !== "string" || !value || value.length > 2048 || value.includes("#") || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return Boolean(url.hostname);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
};
