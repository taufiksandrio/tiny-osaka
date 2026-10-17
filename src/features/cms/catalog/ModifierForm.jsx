import { CatalogForm, TranslationForms, orderField, codeField } from "./CatalogForm";
const OptionForm = ({ option, productId, groupId, graph }) => {
  const scope = { productId, groupId, ...(option ? { optionId: option.id } : {}) };
  return <div className="grid gap-6 border-t pt-6">
    <CatalogForm title={option ? `Opsi ${option.code}` : "Tambah opsi"} action={option ? "optionUpdate" : "optionCreate"} scope={scope} reset={!option}
      initial={{ code: option?.code ?? "", priceDelta: option?.priceDelta ?? 0, sortOrder: option?.sortOrder ?? 0 }}
      fields={[codeField, { name: "priceDelta", label: "Tambahan harga (Rp)", type: "number", max: Number.MAX_SAFE_INTEGER }, orderField]}
      preview={option ? { table: "modifierOptions", match: { productId, groupId, id: option.id } } : undefined} button={option ? "Simpan opsi" : "Tambah opsi"} />
    {option && <TranslationForms title={`Opsi ${option.code}`} action="optionTranslation" scope={scope} rows={graph.modifierOptionTranslations}
      table="modifierOptionTranslations" match={{ productId, groupId, optionId: option.id }} />}
  </div>;
};
const ModifierForm = ({ group, productId, graph }) => {
  const scope = { productId, ...(group ? { groupId: group.id } : {}) };
  return <div className="grid gap-6 rounded-lg border p-4">
    <CatalogForm title={group ? `Modifier ${group.code}` : "Tambah kelompok modifier"} action={group ? "groupUpdate" : "groupCreate"} scope={scope} reset={!group}
      initial={{ code: group?.code ?? "", selectionType: group?.selectionType ?? "single", minSelections: group?.minSelections ?? 0, maxSelections: group?.maxSelections ?? 1, sortOrder: group?.sortOrder ?? 0 }}
      fields={[codeField, { name: "selectionType", label: "Jenis pilihan", options: [{ value: "single", label: "Satu pilihan" }, { value: "multiple", label: "Beberapa pilihan" }] },
        { name: "minSelections", label: "Minimal pilihan", type: "number", max: 2147483647 }, { name: "maxSelections", label: "Maksimal pilihan", type: "number", max: 2147483647 }, orderField]}
      preview={group ? { table: "modifierGroups", match: { productId, id: group.id } } : undefined} button={group ? "Simpan modifier" : "Tambah kelompok"} />
    {group && <>
      <TranslationForms title={`Modifier ${group.code}`} action="groupTranslation" scope={scope} rows={graph.modifierGroupTranslations}
        table="modifierGroupTranslations" match={{ productId, groupId: group.id }} />
      {graph.modifierOptions.filter(row => row.productId === productId && row.groupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder).map(option =>
        <OptionForm key={option.id} option={option} productId={productId} groupId={group.id} graph={graph} />)}
      <OptionForm productId={productId} groupId={group.id} graph={graph} />
    </>}
  </div>;
};
export default ModifierForm;
