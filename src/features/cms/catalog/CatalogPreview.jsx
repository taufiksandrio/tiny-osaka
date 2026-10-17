"use client";
import { useId, useState } from "react";
import { calculatePrice } from "@/server/catalog/pricing.mjs";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ImageIcon } from "lucide-react";
import MediaView from "../media/MediaView";
const money = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const name = (rows, match, locale, fallback) => rows.find(row => row.locale === locale && Object.entries(match).every(([key, value]) => row[key] === value))?.title || fallback;
const ProductPreview = ({ product, graph, locale }) => {
  const prefix = useId();
  const [variantId, setVariant] = useState(""), [optionIds, setOptions] = useState([]);
  const variants = graph.productVariants.filter(row => row.productId === product.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const groups = graph.modifierGroups.filter(row => row.productId === product.id).sort((a, b) => a.sortOrder - b.sortOrder).map(group => ({ ...group,
    options: graph.modifierOptions.filter(row => row.productId === product.id && row.groupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder) }));
  const selectedVariant = variantId || variants[0]?.id || "";
  let total = null;
  try { total = calculatePrice({ revisionId: graph.revision.id, productId: product.id, variants, groups },
    { revisionId: graph.revision.id, productId: product.id, variantId: selectedVariant, optionIds }); } catch { /* Incomplete draft or selection has no valid total. */ }
  const translation = graph.productTranslations.find(row => row.productId === product.id && row.locale === locale);
  const categoryId = graph.productEntries.find(row => row.productId === product.id)?.categoryId;
  const media = graph.mediaRefs?.filter(ref => ref.productId === product.id).sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const asset = graph.mediaAssets?.find(row => row.id === media?.assetId);
  return <Card className="min-w-0 overflow-hidden gap-0 py-0 shadow-none">
    {asset ? <div className="border-b p-4"><MediaView asset={asset} alt={media[locale === "id" ? "altId" : "altEn"] || "Media draft"} /></div> : <div className="flex min-h-32 flex-col items-center justify-center gap-2 border-b bg-secondary p-6 text-muted-foreground"><ImageIcon className="size-8" aria-hidden="true" /><span className="text-xs">Belum ada media produk</span></div>}
    <CardHeader className="py-6"><Badge variant="outline" className="max-w-full whitespace-normal break-words">{name(graph.categoryTranslations, { categoryId }, locale, "Kategori belum diberi nama")}</Badge>
      <h3 className="break-words text-lg">{translation?.title || "Nama produk belum diisi"}</h3>
      <CardDescription className="whitespace-pre-wrap break-words">{translation?.description || "Deskripsi belum diisi untuk bahasa ini."}</CardDescription>
    </CardHeader>
    <CardContent className="grid min-w-0 gap-6 pb-6">
      <div className="cms-form-field"><Label htmlFor={prefix + "-variant"}>Pilihan varian</Label>
        <NativeSelect id={prefix + "-variant"} value={selectedVariant} onChange={event => setVariant(event.target.value)}>
          {!variants.length && <NativeSelectOption value="">Belum ada varian</NativeSelectOption>}
          {variants.map(variant => <NativeSelectOption key={variant.id} value={variant.id}>{name(graph.variantTranslations, { productId: product.id, variantId: variant.id }, locale, variant.code)} · {money(variant.basePrice)}</NativeSelectOption>)}
        </NativeSelect></div>
      {groups.map(group => <fieldset key={group.id} className="grid min-w-0 gap-3"><legend className="mb-3 font-medium break-words">{name(graph.modifierGroupTranslations, { productId: product.id, groupId: group.id }, locale, group.code)}</legend>
        <p className="text-xs text-muted-foreground">Pilih {group.minSelections}–{group.maxSelections} opsi.</p>
        {group.options.map(option => <Label key={option.id} className="cms-checkbox break-words"><Checkbox checked={optionIds.includes(option.id)} onCheckedChange={checked => setOptions(previous => checked === true ?
          [...previous.filter(id => group.selectionType !== "single" || !group.options.some(row => row.id === id)), option.id] : previous.filter(id => id !== option.id))} />
          <span>{name(graph.modifierOptionTranslations, { productId: product.id, groupId: group.id, optionId: option.id }, locale, option.code)} (+{money(option.priceDelta)})</span></Label>)}
      </fieldset>)}
      <div className="border-t pt-4"><p className="text-xs text-muted-foreground">Simulasi harga dari data draft</p>
        <p className="mt-1 text-xl font-semibold text-primary">{total === null ? "Harga belum valid" : money(total)}</p>
        {total === null && <p className="mt-2 text-xs text-muted-foreground">Lengkapi varian/modifier dan pilihan sesuai batas untuk menghitung harga.</p>}</div>
    </CardContent>
  </Card>;
};
const CatalogPreview = ({ graph, locale, unsaved }) => <section aria-label="Pratinjau katalog" lang={locale} className="grid gap-6">
  <div className="rounded-xl border bg-card p-6"><div className="flex flex-wrap items-center gap-3"><h2>Pratinjau katalog</h2><Badge variant="secondary">{locale === "id" ? "Indonesia" : "Inggris"}</Badge><Badge variant="outline">{unsaved ? "Termasuk perubahan belum disimpan" : "Revisi tersimpan"}</Badge></div>
    <p className="mt-3 text-sm text-muted-foreground">Simulasi konten dan pilihan produk. Harga ini belum diverifikasi terhadap platform merchant.</p></div>
  {!graph.products.length && <p className="rounded-xl border border-dashed p-6 text-muted-foreground">Tambahkan produk untuk melihat kartu preview.</p>}
  <div className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-3">{[...graph.productEntries].sort((a, b) => a.sortOrder - b.sortOrder).map(entry => {
    const product = graph.products.find(row => row.id === entry.productId);
    return product && <ProductPreview key={product.id} product={product} graph={graph} locale={locale} />;
  })}</div>
</section>;
export default CatalogPreview;
