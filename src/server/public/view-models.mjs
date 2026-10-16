import { validatePricingProduct, calculatePrice } from "../catalog/pricing.mjs";

export const pricingProduct = (catalog, product) => {
  const scope = { revisionId: catalog.revision.id, productId: product.id };
  const graph = { ...scope, variants: product.variants.map(row => ({ ...row, ...scope })),
    groups: product.groups.map(group => ({ ...group, ...scope,
      options: group.options.map(row => ({ ...row, ...scope, groupId: group.id })) })) };
  validatePricingProduct(graph);
  return graph;
};
export const minimumPrice = graph => calculatePrice(graph, {
  revisionId: graph.revisionId, productId: graph.productId,
  variantId: [...graph.variants].sort((a, b) => a.basePrice - b.basePrice)[0].id,
  optionIds: graph.groups.flatMap(group => [...group.options].sort((a, b) => a.priceDelta - b.priceDelta)
    .slice(0, group.minSelections).map(option => option.id)),
});
export const formatPrice = (amount, locale) => new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US",
  { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
