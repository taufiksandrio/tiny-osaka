export const cmsRequest = async (path, data, method = "POST") => {
  const response = await fetch("/api/cms/pages" + path, { method, credentials: "same-origin", cache: "no-store",
    ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) throw new Error("Sesi berakhir. Masuk kembali sebelum melanjutkan.");
    if (response.status === 409) throw new Error("Revisi berubah atau tindakan tidak tersedia. Muat ulang untuk melihat versi terbaru; salin perubahan Anda dahulu.");
    if (response.status === 403) throw new Error("Anda tidak memiliki izin untuk tindakan ini.");
    if (["NOT_READY", "INVALID_CONTENT"].includes(result.code)) throw new Error("Lengkapi semua kolom Indonesia dan Inggris. Periksa batas teks dan isi dokumen.");
    throw new Error("Permintaan gagal. Periksa isian dan koneksi, lalu coba lagi.");
  }
  return result;
};
