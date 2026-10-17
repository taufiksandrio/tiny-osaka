"use client";
import { useContext } from "react";
import { CatalogContext } from "./client";
import MediaAttachments from "../media/MediaAttachments";
import { CatalogForm, TranslationForms, orderField } from "./CatalogForm";
import VariantForm from "./VariantForm";
import ModifierForm from "./ModifierForm";
const ProductForm = ({ product, graph }) => {
  const context = useContext(CatalogContext);
  const scope = { productId: product.id }, entry = graph.productEntries.find(row => row.productId === product.id);
  return <div className="grid gap-6">
    <TranslationForms title="Produk" action="productTranslation" scope={scope} match={scope} rows={graph.productTranslations} table="productTranslations" />
    <CatalogForm title="Penempatan produk" action="productPlacement" scope={scope} initial={{ categoryId: entry.categoryId, sortOrder: entry.sortOrder }}
      fields={[{ name: "categoryId", label: "Kategori", options: graph.categories.map(row => ({ value: row.id, label: row.slug })) }, orderField]}
      preview={{ table: "productEntries", match: scope }} />
    <h3>Harga</h3>
    {graph.productVariants.filter(row => row.productId === product.id && row.code === "standard").map(variant => <VariantForm key={variant.id} variant={variant} productId={product.id} graph={graph} />)}
    <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Varian tambahan dan topping (opsional)</summary><div className="mt-6 grid gap-6">
    <VariantForm productId={product.id} graph={graph} />
    {graph.productVariants.filter(row => row.productId === product.id && row.code !== "standard").map(variant => <VariantForm key={variant.id} variant={variant} productId={product.id} graph={graph} />)}
    <h3>Modifier dan topping</h3>
    {graph.modifierGroups.filter(row => row.productId === product.id).sort((a, b) => a.sortOrder - b.sortOrder).map(group => <ModifierForm key={group.id} group={group} productId={product.id} graph={graph} />)}
    <ModifierForm productId={product.id} graph={graph} />
    </div></details>
    <MediaAttachments key={graph.revision.version} productId={product.id} initial={graph.mediaRefs} assets={graph.mediaAssets} disabled={context.disabled}
      onOperations={operations => context.stageMedia(product.id, operations)} />
  </div>;
};
export default ProductForm;
