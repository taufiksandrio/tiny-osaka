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
  if (!response.ok) throw Object.assign(new Error(catalogErrorMessage(response.status, result.code)), { code: result.code, status: response.status });
  return result;
};
export const productPath = slug => "/products/" + encodeURIComponent(slug);
export const loadCatalog = () => catalogRequest("");
export const createProduct = values => catalogRequest("", "POST", values);
export const updateProduct = (slug, values) => catalogRequest(productPath(slug), "PATCH", values);
export const deleteProduct = slug => catalogRequest(productPath(slug), "DELETE");
