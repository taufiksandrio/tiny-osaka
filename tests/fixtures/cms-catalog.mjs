import { randomUUID } from "node:crypto";
// Only callers with an isolated QA actor/database may use this synthetic fixture.
export const seedCmsCatalog = async write => {
  let graph = await write("create", {});
  const save = async (action, data) => { graph = await write(action, { revisionId: graph.revision.id, expectedVersion: graph.revision.version, ...data }); };
  await save("categoryCreate", { slug: "qa-category-" + randomUUID(), sortOrder: 0 });
  const categoryId = graph.categories[0].id;
  await save("productCreate", { slug: "qa-product-" + randomUUID(), categoryId, sortOrder: 0 });
  const productId = graph.products[0].id;
  await save("variantCreate", { productId, code: "standard", basePrice: 25000, sortOrder: 0 });
  const variantId = graph.productVariants[0].id;
  await save("groupCreate", { productId, code: "extras", selectionType: "single", minSelections: 0, maxSelections: 1, sortOrder: 0 });
  const groupId = graph.modifierGroups[0].id;
  await save("optionCreate", { productId, groupId, code: "extra", priceDelta: 5000, sortOrder: 0 });
  const optionId = graph.modifierOptions[0].id;
  for (const locale of ["id", "en"]) {
    for (const [action, scope, title] of [
      ["categoryTranslation", { categoryId }, "QA category"], ["productTranslation", { productId }, "QA product"],
      ["variantTranslation", { productId, variantId }, "QA standard"], ["groupTranslation", { productId, groupId }, "QA extras"],
      ["optionTranslation", { productId, groupId, optionId }, "QA extra"],
    ]) await save(action, { ...scope, locale, title: title + " " + locale, description: "QA synthetic content " + locale });
  }
  return graph;
};
