export const mediaRequest = async (path = "", data, method = "GET", upload = false) => {
  const response = await fetch("/api/cms/media" + path, { method, credentials: "same-origin", cache: "no-store",
    ...(data === undefined ? {} : { headers: { "Content-Type": upload ? data.type : "application/json" }, body: upload ? data : JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) {
    const messages = { AUTH_REQUIRED: "Sesi berakhir. Silakan masuk kembali.", REVISION_CONFLICT: "Revisi berubah. Salin isian sebelum memuat ulang.",
      INVALID_MEDIA: "File tidak didukung, rusak, atau melampaui batas media.", INPUT_TOO_LARGE: "Ukuran file melampaui batas.",
      INVALID_POSTER: "Pilih gambar poster yang sudah diunggah.", VIDEO_UNAVAILABLE: "Upload video memerlukan FFmpeg dan ffprobe yang dikonfigurasi operator.",
      MEDIA_LIMIT: "Maksimal 12 media per halaman atau produk.", UPLOAD_BUSY: "Upload sedang penuh. Coba kembali sesaat lagi." };
    throw new Error(messages[result.code] || "Permintaan media gagal. Periksa isian dan coba kembali.");
  }
  return result;
};
