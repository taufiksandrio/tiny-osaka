import { CatalogForm, TranslationForms, orderField } from "./CatalogForm";
const CategoryForm = ({ category, graph }) => {
  const scope = { categoryId: category.id }, match = scope;
  const entry = graph.categoryEntries.find(row => row.categoryId === category.id);
  return <div className="grid gap-6">
    <TranslationForms title="Kategori" action="categoryTranslation" scope={scope} match={match} rows={graph.categoryTranslations} table="categoryTranslations" />
    <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Pengaturan kategori (opsional)</summary><div className="mt-6">
      <CatalogForm title="Urutan kategori" action="categoryPlacement" scope={scope} initial={{ sortOrder: entry.sortOrder }} fields={[orderField]}
        preview={{ table: "categoryEntries", match }} />
    </div></details>
  </div>;
};
export default CategoryForm;
