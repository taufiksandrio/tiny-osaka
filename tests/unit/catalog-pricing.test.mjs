import assert from "node:assert/strict";
import test from "node:test";
import { calculatePrice, CatalogPricingError, validatePricingProduct } from "../../src/server/catalog/pricing.mjs";

// Synthetic arithmetic fixtures only; these are not Tiny Osaka menu facts.
const scope = { revisionId: "revision-1", productId: "product-1" };
const fixture = () => ({
  ...scope,
  variants: [{ ...scope, id: "standard-id", code: "standard", basePrice: 25000 }],
  groups: [{ ...scope, id: "toppings", code: "toppings", selectionType: "multiple", minSelections: 0, maxSelections: 2,
    options: [
      { ...scope, groupId: "toppings", id: "option-a", code: "a", priceDelta: 3000 },
      { ...scope, groupId: "toppings", id: "option-b", code: "b", priceDelta: 4000 },
    ],
  }],
});
const select = (fields = {}) => ({ ...scope, ...fields });
const rejects = (run) => assert.throws(run, CatalogPricingError);

test("standard product infers its one variant; exact totals do not mutate the graph", () => {
  const product = fixture();
  const before = structuredClone(product);
  assert.equal(calculatePrice(product, select()), 25000);
  assert.equal(calculatePrice(product, select({ optionIds: ["option-a", "option-b"] })), 32000);
  assert.deepEqual(product, before);
});

test("multiple variants require a choice and use only the chosen variant price", () => {
  const product = fixture();
  product.variants.push({ ...scope, id: "large-id", code: "large", basePrice: 40000 });
  rejects(() => calculatePrice(product, select()));
  assert.equal(calculatePrice(product, select({ variantId: "large-id", optionIds: ["option-b"] })), 44000);
  rejects(() => calculatePrice(product, select({ variantId: "foreign-variant" })));
});

test("accepts prices and totals above 100000 without a business ceiling", () => {
  const product = fixture();
  product.variants[0].basePrice = 2500000;
  product.groups[0].options[0].priceDelta = 150000;
  assert.equal(calculatePrice(product, select({ optionIds: ["option-a"] })), 2650000);
});

test("zero base and zero delta are valid", () => {
  const product = fixture();
  product.variants[0].basePrice = 0;
  product.groups[0].options[0].priceDelta = 0;
  assert.equal(calculatePrice(product, select({ optionIds: ["option-a"] })), 0);
});

test("allows the exact safe integer boundary and rejects overflow before adding", () => {
  const product = fixture();
  product.variants[0].basePrice = Number.MAX_SAFE_INTEGER - 3000;
  assert.equal(calculatePrice(product, select({ optionIds: ["option-a"] })), Number.MAX_SAFE_INTEGER);
  rejects(() => calculatePrice(product, select({ optionIds: ["option-a", "option-b"] })));
  product.variants[0].basePrice = Number.MAX_SAFE_INTEGER;
  assert.equal(calculatePrice(product, select()), Number.MAX_SAFE_INTEGER);
  rejects(() => calculatePrice(product, select({ optionIds: ["option-a"] })));
});

for (const [label, amount] of [["negative", -1], ["fractional", 0.5], ["NaN", NaN],
  ["infinity", Infinity], ["unsafe", Number.MAX_SAFE_INTEGER + 1], ["string", "25000"],
  ["null", null], ["bigint", 25000n]]) {
  test(`rejects ${label} base prices and option deltas`, () => {
    const product = fixture();
    product.variants[0].basePrice = amount;
    rejects(() => validatePricingProduct(product));
    product.variants[0].basePrice = 25000;
    product.groups[0].options[0].priceDelta = amount;
    rejects(() => validatePricingProduct(product));
  });
}

test("rejects repeated or unknown selected options", () => {
  rejects(() => calculatePrice(fixture(), select({ optionIds: ["option-a", "option-a"] })));
  rejects(() => calculatePrice(fixture(), select({ optionIds: ["foreign-option"] })));
});

test("checks required and maximum selections in every group, including omitted groups", () => {
  const product = fixture();
  product.groups[0].minSelections = 1;
  rejects(() => calculatePrice(product, select()));
  product.groups[0].maxSelections = 1;
  product.groups[0].selectionType = "single";
  assert.equal(calculatePrice(product, select({ optionIds: ["option-b"] })), 29000);
  rejects(() => calculatePrice(product, select({ optionIds: ["option-a", "option-b"] })));
  product.groups.push({ ...scope, id: "sauce", code: "sauce", selectionType: "single", minSelections: 1, maxSelections: 1,
    options: [{ ...scope, groupId: "sauce", id: "sauce-a", code: "sauce-a", priceDelta: 0 }],
  });
  rejects(() => calculatePrice(product, select({ optionIds: ["option-a"] })));
  assert.equal(calculatePrice(product, select({ optionIds: ["option-a", "sauce-a"] })), 28000);
});

test("rejects cross-product and cross-revision selections and catalog rows", () => {
  for (const key of ["productId", "revisionId"]) {
    rejects(() => calculatePrice(fixture(), select({ [key]: "other" })));
    for (const getRow of [p => p.variants[0], p => p.groups[0], p => p.groups[0].options[0]]) {
      const product = fixture();
      getRow(product)[key] = "other";
      rejects(() => validatePricingProduct(product));
    }
  }
  const product = fixture();
  product.groups[0].options[0].groupId = "other";
  rejects(() => validatePricingProduct(product));
});

test("rejects impossible and invalid group configuration", () => {
  for (const fields of [
    { minSelections: -1 }, { maxSelections: -1 }, { minSelections: 2, maxSelections: 1 },
    { maxSelections: 3 }, { selectionType: "single" }, { selectionType: "other" },
    { minSelections: 0.5 }, { maxSelections: Infinity }, { maxSelections: 2147483648 },
    { options: null },
  ]) {
    const product = fixture();
    Object.assign(product.groups[0], fields);
    rejects(() => validatePricingProduct(product));
  }
});

test("rejects ambiguous duplicate identities and codes", () => {
  for (const key of ["id", "code"]) {
    const product = fixture();
    product.variants.push({ ...product.variants[0], id: "second", code: "second", [key]: product.variants[0][key] });
    rejects(() => validatePricingProduct(product));
    const duplicateOption = fixture();
    duplicateOption.groups[0].options[1][key] = duplicateOption.groups[0].options[0][key];
    rejects(() => validatePricingProduct(duplicateOption));
    const duplicateGroup = fixture();
    duplicateGroup.groups.push({ ...duplicateGroup.groups[0], id: "second", code: "second", options: [],
      minSelections: 0, maxSelections: 0, [key]: duplicateGroup.groups[0][key],
    });
    rejects(() => validatePricingProduct(duplicateGroup));
  }
  const product = fixture();
  product.groups.push({ ...scope, id: "other", code: "other", selectionType: "single", minSelections: 0, maxSelections: 1,
    options: [{ ...scope, groupId: "other", id: "option-a", code: "other", priceDelta: 0 }],
  });
  rejects(() => validatePricingProduct(product));
});

test("rejects malformed graphs, codes and selections instead of coercing values", () => {
  for (const product of [null, {}, { ...fixture(), variants: [] }, { ...fixture(), groups: null }]) {
    rejects(() => validatePricingProduct(product));
  }
  for (const fields of [{ code: "" }, { code: "bad code" }, { code: "named-single" }, { id: "" }]) {
    const product = fixture();
    Object.assign(product.variants[0], fields);
    rejects(() => validatePricingProduct(product));
  }
  for (const selection of [null, select({ optionIds: null }), select({ optionIds: "option-a" }),
    select({ optionIds: [null] }), select({ variantId: null })]) {
    rejects(() => calculatePrice(fixture(), selection));
  }
});

test("a product may have no modifier groups", () => {
  const product = fixture();
  product.groups = [];
  assert.equal(calculatePrice(product, select()), 25000);
  rejects(() => calculatePrice(product, select({ optionIds: ["option-a"] })));
});
