// Pure validation for trusted server-loaded draft data, not a public request body.
// Future routes must load amounts from the DB and enforce auth/publication first.
export class CatalogPricingError extends Error {}

const requireValid = (condition, message) => {
  if (!condition) throw new CatalogPricingError(message);
};
const isId = (value) => typeof value === "string" && value.trim().length > 0;
const isAmount = (value) => Number.isSafeInteger(value) && value >= 0;
const isCount = (value) => Number.isInteger(value) && value >= 0 && value <= 2147483647;
const isCode = (value) => typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
const checkScope = (row, product) => {
  requireValid(row && row.revisionId === product.revisionId && row.productId === product.productId,
    "Catalog row belongs to another product or revision.");
  requireValid(isId(row.id), "Catalog row requires an ID.");
};
const addUnique = (values, value) => {
  requireValid(!values.has(value), "Duplicate catalog identity or code.");
  values.add(value);
};

// Pricing readiness only. Bilingual content, approval and publication validators
// are separate; incomplete drafts may exist in storage but cannot be priced.
export const validatePricingProduct = (product) => {
  requireValid(product && isId(product.revisionId) && isId(product.productId), "Product scope is required.");
  requireValid(Array.isArray(product.variants) && product.variants.length > 0, "At least one variant is required.");
  requireValid(Array.isArray(product.groups), "Modifier groups must be an array.");
  const variantIds = new Set();
  const variantCodes = new Set();
  for (const variant of product.variants) {
    checkScope(variant, product);
    requireValid(isCode(variant.code) && isAmount(variant.basePrice), "Invalid variant code or integer IDR price.");
    addUnique(variantIds, variant.id);
    addUnique(variantCodes, variant.code);
  }
  requireValid(product.variants.length !== 1 || product.variants[0].code === "standard",
    "A simple product requires the standard variant.");

  const groupIds = new Set();
  const groupCodes = new Set();
  const optionIds = new Set();
  for (const group of product.groups) {
    checkScope(group, product);
    requireValid(isCode(group.code), "Invalid modifier group code.");
    addUnique(groupIds, group.id);
    addUnique(groupCodes, group.code);
    requireValid(["single", "multiple"].includes(group.selectionType), "Invalid selection type.");
    requireValid(isCount(group.minSelections) && isCount(group.maxSelections) &&
      group.minSelections <= group.maxSelections, "Invalid selection limits.");
    requireValid(group.selectionType !== "single" || group.maxSelections <= 1, "Single selection allows at most one option.");
    requireValid(Array.isArray(group.options) && group.maxSelections <= group.options.length,
      "Selection limits exceed available options.");
    const optionCodes = new Set();
    for (const option of group.options) {
      checkScope(option, product);
      requireValid(option.groupId === group.id, "Option belongs to another modifier group.");
      requireValid(isCode(option.code) && isAmount(option.priceDelta), "Invalid option code or integer IDR delta.");
      addUnique(optionIds, option.id);
      addUnique(optionCodes, option.code);
    }
  }
};

export const calculatePrice = (product, selection) => {
  validatePricingProduct(product);
  requireValid(selection && selection.revisionId === product.revisionId && selection.productId === product.productId,
    "Selection belongs to another product or revision.");
  // Only the single internal standard variant can be inferred.
  const variantId = selection.variantId === undefined && product.variants.length === 1
    ? product.variants[0].id : selection.variantId;
  const variant = product.variants.find(row => row.id === variantId);
  requireValid(variant, "Select a variant belonging to this product revision.");
  const optionIds = selection.optionIds === undefined ? [] : selection.optionIds;
  requireValid(Array.isArray(optionIds) && optionIds.every(isId), "Option selections must be an array of IDs.");
  const selected = new Set(optionIds);
  requireValid(selected.size === optionIds.length, "An option may only be selected once.");
  let total = variant.basePrice;
  let matched = 0;
  for (const group of product.groups) {
    const chosen = group.options.filter(option => selected.has(option.id));
    requireValid(chosen.length >= group.minSelections && chosen.length <= group.maxSelections,
      "Selected options violate group limits.");
    matched += chosen.length;
    for (const option of chosen) {
      requireValid(option.priceDelta <= Number.MAX_SAFE_INTEGER - total, "Price total exceeds safe integer representation.");
      total += option.priceDelta;
    }
  }
  requireValid(matched === selected.size, "Unknown option for this product revision.");
  return total;
};
