import { validatePricingProduct } from "./pricing.mjs";
import { validateRevisionMedia } from "../media/validation.mjs";
import { STORED_LOCALE } from "../db/stored-language.mjs";

export const catalogReviewTables = Object.freeze(["categoryEntries", "productEntries", "categoryTranslations", "productTranslations",
  "productVariants", "variantTranslations", "modifierGroups", "modifierGroupTranslations", "modifierOptions", "modifierOptionTranslations"]);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const int4 = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
const code = value => typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);

// Structural readiness only: not restaurant fact verification, approval or publish.
// allowEmpty: a store may legitimately end up with no products (last card deleted).
export const validateCatalogReviewReadiness = (graph, { allowEmpty = false } = {}) => {
  const issues = [];
  const issue = (code, entityType = "catalog", entityId = null) => issues.push({ code, entityType, entityId });
  const finish = () => ({ revisionId: graph?.revision?.id ?? null, version: graph?.revision?.version ?? null,
    ready: issues.length === 0, issues: [...new Map(issues.map(row => [JSON.stringify(row), row])).values()]
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
  if (!graph || !graph.revision || !uuid(graph.revision.id) || graph.revision.status !== "draft" ||
    !int4(graph.revision.version) || graph.revision.version < 1) {
    issue("INVALID_REVISION"); return finish();
  }
  if (!["categories", "products", ...catalogReviewTables].every(name => Array.isArray(graph[name]))) {
    issue("MALFORMED_GRAPH"); return finish();
  }
  const revisionId = graph.revision.id;
  const rows = {};
  for (const name of catalogReviewTables) {
    rows[name] = graph[name].filter(row => {
      if (!row || row.revisionId !== revisionId) { issue("INVALID_SCOPE", name); return false; }
      return true;
    });
  }
  const index = (list, keys, type) => {
    const map = new Map();
    for (const row of list) {
      if (!row || !keys.every(key => uuid(row[key]))) { issue("INVALID_ID", type); continue; }
      const key = keys.map(key => row[key]).join(":");
      if (map.has(key)) issue("DUPLICATE_ROW", type, row[keys.at(-1)]);
      map.set(key, row);
    }
    return map;
  };
  const identities = (list, type) => {
    const map = index(list, ["id"], type);
    const slugs = new Set();
    for (const row of map.values()) {
      if (!code(row.slug)) issue("INVALID_SLUG", type, row.id);
      if (slugs.has(row.slug)) issue("DUPLICATE_SLUG", type, row.id);
      slugs.add(row.slug);
    }
    return map;
  };
  const categories = identities(graph.categories, "category");
  const products = identities(graph.products, "product");
  const categoryEntries = index(rows.categoryEntries, ["categoryId"], "category");
  const productEntries = index(rows.productEntries, ["productId"], "product");
  const variants = index(rows.productVariants, ["productId", "id"], "variant");
  const groups = index(rows.modifierGroups, ["productId", "id"], "modifierGroup");
  const options = index(rows.modifierOptions, ["productId", "groupId", "id"], "modifierOption");
  if (!allowEmpty && (!categoryEntries.size || !productEntries.size)) issue("EMPTY_CATALOG");
  for (const row of categoryEntries.values()) if (!categories.has(row.categoryId)) issue("MISSING_IDENTITY", "category", row.categoryId);
  for (const row of productEntries.values()) {
    if (!products.has(row.productId)) issue("MISSING_IDENTITY", "product", row.productId);
    if (!categoryEntries.has(row.categoryId)) issue("MISSING_CATEGORY_ENTRY", "product", row.productId);
  }
  for (const [map, type] of [[variants, "variant"], [groups, "modifierGroup"]]) {
    for (const row of map.values()) if (!productEntries.has(row.productId)) issue("ORPHAN_ROW", type, row.id);
  }
  for (const row of options.values()) if (!groups.has(`${row.productId}:${row.groupId}`)) issue("ORPHAN_ROW", "modifierOption", row.id);
  for (const [map, type, idKey] of [[categoryEntries, "category", "categoryId"], [productEntries, "product", "productId"],
    [variants, "variant", "id"], [groups, "modifierGroup", "id"], [options, "modifierOption", "id"]]) {
    for (const row of map.values()) if (!int4(row.sortOrder)) issue("INVALID_SORT", type, row[idKey]);
  }
  const localized = (name, parents, parentKeys, childKeys, type) => {
    // Legacy non-Indonesian rows of old snapshots are ignored, never rejected.
    const translations = index(rows[name].filter(row => row?.locale === STORED_LOCALE), childKeys, type);
    for (const row of translations.values()) {
      if (!parents.has(childKeys.map(key => row[key]).join(":"))) issue("ORPHAN_TRANSLATION", type, row[childKeys.at(-1)]);
      if (typeof row.title !== "string" || !row.title.trim() || typeof row.description !== "string" ||
        row.title.includes("\0") || row.description.includes("\0")) issue("INVALID_TEXT", type, row[childKeys.at(-1)]);
    }
    for (const row of parents.values()) {
      const parentKey = parentKeys.map(key => row[key]).join(":");
      if (!translations.has(parentKey)) issue("MISSING_TRANSLATION", type, row[parentKeys.at(-1)]);
    }
  };
  localized("categoryTranslations", categoryEntries, ["categoryId"], ["categoryId"], "category");
  localized("productTranslations", productEntries, ["productId"], ["productId"], "product");
  localized("variantTranslations", variants, ["productId", "id"], ["productId", "variantId"], "variant");
  localized("modifierGroupTranslations", groups, ["productId", "id"], ["productId", "groupId"], "modifierGroup");
  localized("modifierOptionTranslations", options, ["productId", "groupId", "id"], ["productId", "groupId", "optionId"], "modifierOption");
  for (const entry of productEntries.values()) {
    const product = { revisionId, productId: entry.productId,
      variants: [...variants.values()].filter(row => row.productId === entry.productId),
      groups: [...groups.values()].filter(row => row.productId === entry.productId)
        .map(group => ({ ...group, options: [...options.values()].filter(row => row.productId === entry.productId && row.groupId === group.id) })) };
    if (!product.variants.length) { issue("MISSING_VARIANT", "product", entry.productId); continue; }
    try { validatePricingProduct(product); } catch { issue("INVALID_PRICING_GRAPH", "product", entry.productId); continue; }
    // Nonnegative product-wide deltas allow an exact worst-case check without
    // enumerating every combination: highest base plus top max options per group.
    let total = product.variants.reduce((maximum, row) => Math.max(maximum, row.basePrice), 0);
    let overflow = false;
    for (const group of product.groups) {
      for (const option of [...group.options].sort((a, b) => b.priceDelta - a.priceDelta).slice(0, group.maxSelections)) {
        if (option.priceDelta > Number.MAX_SAFE_INTEGER - total) { overflow = true; break; }
        total += option.priceDelta;
      }
      if (overflow) break;
    }
    if (overflow) issue("PRICE_TOTAL_OVERFLOW", "product", entry.productId);
  }
  try { validateRevisionMedia(graph, "catalog"); }
  catch { issue("INVALID_MEDIA_GRAPH", "revision", revisionId); }
  return finish();
};
