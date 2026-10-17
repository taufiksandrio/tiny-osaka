import { CatalogForm, TranslationForms, orderField, codeField } from "./CatalogForm";
const VariantForm = ({ variant, productId, graph }) => {
  const scope = { productId, ...(variant ? { variantId: variant.id } : {}) };
  return <div className="grid gap-6 rounded-lg border p-4">
    <CatalogForm title={variant ? `Varian ${variant.code}` : "Tambah varian"} action={variant ? "variantUpdate" : "variantCreate"} scope={scope} reset={!variant}
      initial={{ code: variant?.code ?? (graph.productVariants.some(row => row.productId === productId) ? "" : "standard"), basePrice: variant?.basePrice ?? 0, sortOrder: variant?.sortOrder ?? 0 }}
      fields={[codeField, { name: "basePrice", label: "Harga dasar (Rp)", type: "number", max: Number.MAX_SAFE_INTEGER }, orderField]}
      preview={variant ? { table: "productVariants", match: { productId, id: variant.id } } : undefined} button={variant ? "Simpan varian" : "Tambah varian"} />
    {!variant && <p className="text-xs text-muted-foreground">Varian pertama atau satu-satunya menggunakan kode standard. Harga berupa rupiah bulat.</p>}
    {variant && <TranslationForms title={`Varian ${variant.code}`} action="variantTranslation" scope={scope} rows={graph.variantTranslations}
      table="variantTranslations" match={{ productId, variantId: variant.id }} />}
  </div>;
};
export default VariantForm;
