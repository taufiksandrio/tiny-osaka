"use client";
import { createContext } from "react";
export const CatalogContext = createContext(null);
export const catalogRequest = async (path, data, method = "POST") => {
  const response = await fetch("/api/cms/catalog" + path, { method, credentials: "same-origin", cache: "no-store",
    ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) throw new Error("Sesi berakhir. Masuk kembali sebelum melanjutkan.");
    if (response.status === 409) throw new Error("Revisi berubah. Salin perubahan Anda sebelum memuat ulang.");
    if (response.status === 403) throw new Error("Anda tidak memiliki izin untuk tindakan ini.");
    if (result.code === "NOT_READY") throw new Error("Katalog belum lengkap. Periksa kesiapan konten, varian, dan modifier.");
    throw new Error("Permintaan gagal. Periksa isian, kode unik, dan batas pilihan.");
  }
  return result;
};
