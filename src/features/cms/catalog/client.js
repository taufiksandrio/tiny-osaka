"use client";
const messages = {
  INVALID_NAME: "Nama produk wajib diisi (1-120 karakter) dan tidak boleh memuat tanda < atau >.",
  INVALID_DESCRIPTION: "Deskripsi maksimal 1000 karakter dan tidak boleh memuat tanda < atau >.",
  INVALID_PRICE: "Harga harus berupa angka bulat rupiah, 0 atau lebih.",
  INVALID_SLUG: "Nama harus memuat huruf atau angka agar dapat dijadikan alamat produk.",
  SLUG_CONFLICT: "Alamat produk dari nama ini sudah dipakai. Ubah nama sedikit lalu coba lagi.",
  PRODUCT_CONFLICT: "Produk ini sudah diubah pengguna lain. Data terbaru telah dimuat; periksa isian lalu simpan lagi.",
  NOT_FOUND: "Produk tidak ditemukan. Mungkin sudah dihapus pengguna lain.",
  INVALID_INPUT: "Isian tidak valid. Periksa nama, deskripsi, dan harga.",
  INVALID_IMAGE_ALT: "Teks alternatif gambar wajib diisi (maksimal 500 karakter, tanpa < atau >).",
  IMAGE_REQUIRED: "Produk ini belum memiliki gambar.",
  IMAGE_NOT_FOUND: "Gambar tidak ditemukan. Pilih file gambar lagi lalu simpan.",
  INVALID_IMAGE: "Berkas bukan gambar yang dapat dipakai. Pilih file JPEG, PNG, atau WebP.",
  NOT_READY: "Katalog belum siap. Coba lagi sebentar lagi.",
};
export const catalogErrorMessage = (status, code) => {
  if (messages[code]) return messages[code];
  if (status === 401 || code === "AUTH_REQUIRED") return "Sesi berakhir. Masuk kembali sebelum melanjutkan.";
  if (status === 403) return "Anda tidak memiliki izin untuk tindakan ini.";
  if (status === 413) return "Data terlalu besar.";
  if (status >= 500) return "Layanan katalog sedang bermasalah. Coba lagi beberapa saat lagi.";
  return "Permintaan gagal. Periksa isian dan koneksi, lalu coba lagi.";
};
export const catalogRequest = async (path, method = "GET", data) => {
  let response;
  try {
    response = await fetch("/api/cms/catalog" + path, { method, credentials: "same-origin", cache: "no-store",
      ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) });
  } catch { throw Object.assign(new Error("Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi."), { code: "NETWORK" }); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const own = result.code === "INVALID_ORDER_URL" && typeof result.message === "string" && result.message;
    throw Object.assign(new Error(own || catalogErrorMessage(response.status, result.code)), { code: result.code, status: response.status, field: result.field });
  }
  return result;
};
const uploadMessages = {
  INPUT_TOO_LARGE: "Ukuran gambar maksimal 10 MB.",
  INVALID_MEDIA: "Gambar tidak dapat dipakai. Gunakan JPEG, PNG, atau WebP, maksimal 10 MB dan 4096 piksel pada sisi terpanjang.",
  UPLOAD_BUSY: "Upload sedang penuh. Coba lagi sesaat lagi.",
  AUTH_REQUIRED: "Sesi berakhir. Masuk kembali sebelum melanjutkan.",
};
// Raw-body upload through the existing media pipeline; returns the new asset id. Product is not touched on failure.
export const uploadCatalogImage = async file => {
  let response;
  try { response = await fetch("/api/cms/media/upload", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": file.type }, body: file }); }
  catch { throw Object.assign(new Error("Gambar gagal diunggah: tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi."), { code: "NETWORK" }); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 413 ? uploadMessages.INPUT_TOO_LARGE : uploadMessages[result.code] ||
      (response.status === 403 ? "Anda tidak memiliki izin untuk mengunggah gambar." : response.status >= 500 ? "Layanan unggah gambar sedang bermasalah. Coba lagi beberapa saat lagi." : "Gambar gagal diunggah. Periksa file lalu coba lagi.");
    throw Object.assign(new Error(message), { code: result.code, status: response.status, upload: true });
  }
  if (typeof result.id !== "string") throw Object.assign(new Error("Gambar gagal diunggah. Coba lagi."), { upload: true });
  return result.id;
};
export const productPath = slug => "/products/" + encodeURIComponent(slug);
export const loadCatalog = () => catalogRequest("");
export const createProduct = values => catalogRequest("", "POST", values);
export const updateProduct = (slug, values) => catalogRequest(productPath(slug), "PATCH", values);
export const deleteProduct = slug => catalogRequest(productPath(slug), "DELETE");
