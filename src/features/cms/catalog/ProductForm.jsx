import { CatalogForm, TranslationForms, orderField } from "./CatalogForm";
import VariantForm from "./VariantForm";
import ModifierForm from "./ModifierForm";
const ProductForm = ({ product, graph }) => {
  const scope = { productId: product.id }, entry = graph.productEntries.find(row => row.productId === product.id);
  return <div className="grid gap-6">
    <TranslationForms title="Produk" action="productTranslation" scope={scope} match={scope} rows={graph.productTranslations} table="productTranslations" />
    <CatalogForm title="Penempatan produk" action="productPlacement" scope={scope} initial={{ categoryId: entry.categoryId, sortOrder: entry.sortOrder }}
      fields={[{ name: "categoryId", label: "Kategori", options: graph.categories.map(row => ({ value: row.id, label: row.slug })) }, orderField]}
      preview={{ table: "productEntries", match: scope }} />
    <h3>Varian dan harga</h3>
    {graph.productVariants.filter(row => row.productId === product.id).sort((a, b) => a.sortOrder - b.sortOrder).map(variant => <VariantForm key={variant.id} variant={variant} productId={product.id} graph={graph} />)}
    <VariantForm productId={product.id} graph={graph} />
    <h3>Modifier dan topping</h3>
    {graph.modifierGroups.filter(row => row.productId === product.id).sort((a, b) => a.sortOrder - b.sortOrder).map(group => <ModifierForm key={group.id} group={group} productId={product.id} graph={graph} />)}
    <ModifierForm productId={product.id} graph={graph} />
  </div>;
};
export default ProductForm;
