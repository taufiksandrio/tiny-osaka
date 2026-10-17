export const cmsRequest = async (path, data, method = "POST") => {
  const response = await fetch("/api/cms/pages" + path, { method, credentials: "same-origin", cache: "no-store",
    ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) throw new Error("Sesi berakhir. Masuk kembali sebelum melanjutkan.");
    if (response.status === 409) throw new Error("Halaman sudah diubah pengguna lain. Salin perubahan Anda sebelum memuat ulang.");
    if (response.status === 403) throw new Error("Anda tidak memiliki izin untuk tindakan ini.");
    if (["NOT_READY", "INVALID_CONTENT"].includes(result.code)) throw new Error("Isi judul dan isi halaman, serta deskripsi gambar untuk media yang digunakan. Periksa juga batas panjang teks.");
    throw new Error("Permintaan gagal. Periksa isian dan koneksi, lalu coba lagi.");
  }
  return result;
};
