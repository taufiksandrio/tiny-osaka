"use client";
import { useCallback, useState } from "react";
import { createProduct, deleteProduct, loadCatalog, updateProduct, uploadCatalogImage } from "./client";
import { buildPayload } from "./product-form.mjs";
// Card state for the single /admin/catalog page. No ids ever reach the URL.
const useCatalogCards = initial => {
  const [products, setProducts] = useState(initial.products);
  const [busySlug, setBusySlug] = useState(null);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const reload = useCallback(async () => { const next = await loadCatalog(); setProducts(next.products); return next.products; }, []);
  const save = async (editing, values) => {
    setSaving(true);
    try {
      // Upload only now (Simpan), so closing the modal never leaves an orphan asset. A failed upload creates nothing.
      let assetId = null;
      if (values.file) {
        setAnnouncement("Mengunggah gambar...");
        assetId = await uploadCatalogImage(values.file);
      }
      if (editing) {
        const current = products.find(row => row.slug === editing.slug);
        const { product } = await updateProduct(editing.slug, { ...buildPayload(values, current, assetId), expectedVersion: current.version });
        setProducts(rows => rows.map(row => row.slug === product.slug ? product : row));
        setAnnouncement(`Produk ${product.name} disimpan.`);
      } else {
        await createProduct(buildPayload(values, undefined, assetId));
        await reload();
        setAnnouncement(`Produk ${values.name.trim()} ditambahkan.`);
      }
      return { ok: true };
    } catch (error) {
      const field = error.upload ? "image" : error.code === "INVALID_ORDER_URL" ? error.field : undefined;
      if (error.code === "PRODUCT_CONFLICT" || error.code === "NOT_FOUND") {
        try { const rows = await reload(); return { ok: false, message: error.message, gone: !rows.some(row => row.slug === editing?.slug) }; } catch { /* keep original message */ }
      }
      setAnnouncement(error.message);
      return { ok: false, message: error.message, field };
    } finally { setSaving(false); }
  };
  const remove = async product => {
    setBusySlug(product.slug); setAnnouncement(`Menghapus ${product.name}...`);
    try {
      await deleteProduct(product.slug);
      setProducts(rows => rows.filter(row => row.slug !== product.slug));
      setAnnouncement(`Produk ${product.name} dihapus permanen.`);
      return true;
    } catch (error) { setAnnouncement(`Gagal menghapus ${product.name}. ${error.message}`); return false; }
    finally { setBusySlug(null); }
  };
  return { products, busySlug, saving, announcement, save, remove };
};
export default useCatalogCards;
