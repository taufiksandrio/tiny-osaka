// Local identities are resolved by the authenticated atomic-save endpoint.
export const addCatalogItem = (graph, action, data) => {
  const next = structuredClone(graph), operations = [], id = "$" + crypto.randomUUID();
  const title = data.title?.trim() || data.code;
  const slug = (title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "item") + "-" + id.slice(1, 9);
  const revisionId = graph.revision.id;
  const enqueue = (action, data, assign) => operations.push({ action, data, ...(assign ? { assign } : {}) });
  const translation = (action, data, table, extra) => {
    const values = { ...data, locale: "id", title, description: "" };
    enqueue(action, values); next[table].push({ revisionId, ...values, ...extra });
  };
  if (action === "categoryCreate") {
    enqueue(action, { slug, sortOrder: data.sortOrder }, id);
    next.categories.push({ id, slug }); next.categoryEntries.push({ revisionId, categoryId: id, sortOrder: data.sortOrder });
    translation("categoryTranslation", { categoryId: id }, "categoryTranslations");
  } else if (action === "productCreate") {
    enqueue(action, { slug, categoryId: data.categoryId, sortOrder: data.sortOrder }, id);
    next.products.push({ id, slug }); next.productEntries.push({ revisionId, productId: id, categoryId: data.categoryId, sortOrder: data.sortOrder });
    translation("productTranslation", { productId: id }, "productTranslations");
    const variantId = "$" + crypto.randomUUID();
    enqueue("variantCreate", { productId: id, code: "standard", basePrice: data.basePrice, sortOrder: 0 }, variantId);
    enqueue("variantTranslation", { productId: id, variantId, locale: "id", title: "Standar", description: "" });
    next.productVariants.push({ revisionId, id: variantId, productId: id, code: "standard", basePrice: data.basePrice, sortOrder: 0 });
    next.variantTranslations.push({ revisionId, productId: id, variantId, locale: "id", title: "Standar", description: "" });
  } else {
    const table = { variantCreate: "productVariants", groupCreate: "modifierGroups", optionCreate: "modifierOptions" }[action];
    const prefix = { variantCreate: "variant", groupCreate: "group", optionCreate: "option" }[action];
    const values = { ...data }; delete values.title;
    enqueue(action, values, id); next[table].push({ revisionId, id, ...values });
    translation(prefix + "Translation", { productId: data.productId, ...(data.groupId ? { groupId: data.groupId } : {}),
      [{ variant: "variantId", group: "groupId", option: "optionId" }[prefix]]: id },
    { variant: "variantTranslations", group: "modifierGroupTranslations", option: "modifierOptionTranslations" }[prefix]);
  }
  return { graph: next, operations };
};
