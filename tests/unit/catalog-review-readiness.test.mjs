import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { catalogReviewTables, validateCatalogReviewReadiness } from "../../src/server/catalog/review-readiness.mjs";
import { getCatalogReviewReadiness } from "../../src/server/catalog/review.mjs";
import { CatalogDraftError } from "../../src/server/catalog/drafts.mjs";

const fixture = () => {
  const [revisionId, categoryId, productId, variantId, groupId, optionId] = Array.from({ length: 6 }, () => randomUUID());
  const scope = { revisionId, productId };
  const localized = fields => [{ revisionId, ...fields, title: "QA id", description: "" }];
  return {
    revision: { id: revisionId, version: 8, status: "draft" },
    categories: [{ id: categoryId, slug: "qa-category" }], products: [{ id: productId, slug: "qa-product" }],
    categoryEntries: [{ revisionId, categoryId, sortOrder: 0 }],
    productEntries: [{ ...scope, categoryId, sortOrder: 0 }],
    productVariants: [{ ...scope, id: variantId, code: "standard", basePrice: 250000, sortOrder: 0 }],
    modifierGroups: [{ ...scope, id: groupId, code: "toppings", selectionType: "multiple", minSelections: 1, maxSelections: 1, sortOrder: 0 }],
    modifierOptions: [{ ...scope, groupId, id: optionId, code: "qa-option", priceDelta: 150000, sortOrder: 0 }],
    categoryTranslations: localized({ categoryId }), productTranslations: localized({ productId }),
    variantTranslations: localized({ productId, variantId }), modifierGroupTranslations: localized({ productId, groupId }),
    modifierOptionTranslations: localized({ productId, groupId, optionId }),
  };
};
const has = (report, code) => report.issues.some(row => row.code === code);

test("complete Indonesian catalog returns a version-bound report without modifying graph", () => {
  const graph = fixture(); const before = structuredClone(graph);
  assert.deepEqual(validateCatalogReviewReadiness(graph), { revisionId: graph.revision.id, version: 8, ready: true, issues: [] });
  assert.deepEqual(graph, before);
});

test("missing/malformed revision or arrays fail closed", () => {
  for (const graph of [null, {}, { ...fixture(), revision: { id: randomUUID(), version: 1, status: "approved" } },
    { ...fixture(), revision: { id: randomUUID(), version: 0, status: "draft" } }]) {
    assert.ok(has(validateCatalogReviewReadiness(graph), "INVALID_REVISION"));
  }
  for (const name of ["categories", "products", ...catalogReviewTables]) {
    const graph = fixture(); graph[name] = null;
    assert.ok(has(validateCatalogReviewReadiness(graph), "MALFORMED_GRAPH"));
  }
});

test("an empty draft is valid storage but is not structurally ready for review", () => {
  const graph = fixture(); for (const name of ["categories", "products", ...catalogReviewTables]) graph[name] = [];
  assert.ok(has(validateCatalogReviewReadiness(graph), "EMPTY_CATALOG"));
});

test("Indonesian names and valid text are required for every catalog entity", () => {
  for (const name of ["categoryTranslations", "productTranslations", "variantTranslations", "modifierGroupTranslations", "modifierOptionTranslations"]) {
    const graph = fixture(); graph[name] = [];
    const report = validateCatalogReviewReadiness(graph);
    assert.ok(report.issues.some(row => row.code === "MISSING_TRANSLATION"));
    for (const change of [{ title: " \t\n\u00a0" }, { description: null }, { title: "private-content\0" }]) {
      const invalid = fixture(); Object.assign(invalid[name][0], change);
      const result = validateCatalogReviewReadiness(invalid);
      assert.ok(has(result, "INVALID_TEXT"));
      assert.ok(!JSON.stringify(result).includes("private-content"));
    }
  }
});

test("missing variant, wrong standard representation and infeasible topping counts are reported", () => {
  const missing = fixture(); missing.productVariants = []; missing.variantTranslations = [];
  assert.ok(has(validateCatalogReviewReadiness(missing), "MISSING_VARIANT"));
  const wrongCode = fixture(); wrongCode.productVariants[0].code = "single-named";
  assert.ok(has(validateCatalogReviewReadiness(wrongCode), "INVALID_PRICING_GRAPH"));
  const underfilled = fixture(); underfilled.modifierGroups[0].maxSelections = 2;
  assert.ok(has(validateCatalogReviewReadiness(underfilled), "INVALID_PRICING_GRAPH"));
});

test("scope, stable identity, category placement and orphan references are checked", () => {
  for (const [change, code] of [
    [g => { g.categoryEntries[0].revisionId = randomUUID(); }, "INVALID_SCOPE"],
    [g => { g.products = []; }, "MISSING_IDENTITY"],
    [g => { g.productEntries[0].categoryId = randomUUID(); }, "MISSING_CATEGORY_ENTRY"],
    [g => { g.productVariants[0].productId = randomUUID(); }, "ORPHAN_ROW"],
    [g => { g.modifierOptions[0].groupId = randomUUID(); }, "ORPHAN_ROW"],
    [g => { g.variantTranslations[0].variantId = randomUUID(); }, "ORPHAN_TRANSLATION"],
  ]) { const graph = fixture(); change(graph); assert.ok(has(validateCatalogReviewReadiness(graph), code)); }
});

test("duplicate rows/identities/slugs, invalid IDs and sort positions are reported", () => {
  for (const [change, code] of [
    [g => { g.categoryEntries.push({ ...g.categoryEntries[0] }); }, "DUPLICATE_ROW"],
    [g => { g.variantTranslations.push({ ...g.variantTranslations[0] }); }, "DUPLICATE_ROW"],
    [g => { g.categories.push({ id: randomUUID(), slug: g.categories[0].slug }); }, "DUPLICATE_SLUG"],
    [g => { g.products[0].slug = "Bad Slug"; }, "INVALID_SLUG"],
    [g => { g.modifierOptions[0].id = "bad"; }, "INVALID_ID"],
    [g => { g.productEntries[0].sortOrder = -1; }, "INVALID_SORT"],
    [g => { g.modifierGroups[0].sortOrder = 2147483648; }, "INVALID_SORT"],
  ]) { const graph = fixture(); change(graph); assert.ok(has(validateCatalogReviewReadiness(graph), code)); }
});

test("invalid amounts, option rules and duplicate option IDs fail pricing readiness", () => {
  for (const change of [g => { g.productVariants[0].basePrice = 0.5; }, g => { g.modifierOptions[0].priceDelta = -1; },
    g => { g.modifierGroups[0].selectionType = "other"; }, g => { g.productVariants[0].basePrice = Number.MAX_SAFE_INTEGER + 1; }]) {
    const graph = fixture(); change(graph); assert.ok(has(validateCatalogReviewReadiness(graph), "INVALID_PRICING_GRAPH"));
  }
});

test("worst permitted selection uses top max options, accepts exact safe boundary and rejects overflow", () => {
  const graph = fixture();
  graph.productVariants[0].basePrice = Number.MAX_SAFE_INTEGER - 200;
  graph.modifierOptions[0].priceDelta = 200;
  const extra = { ...graph.modifierOptions[0], id: randomUUID(), code: "extra", priceDelta: 100 };
  graph.modifierOptions.push(extra);
  graph.modifierOptionTranslations.push({ revisionId: graph.revision.id,
    productId: extra.productId, groupId: extra.groupId, optionId: extra.id, title: "QA extra", description: "" });
  assert.equal(validateCatalogReviewReadiness(graph).ready, true); // max=1: not the sum of both options
  graph.modifierGroups[0].maxSelections = 2;
  assert.ok(has(validateCatalogReviewReadiness(graph), "PRICE_TOTAL_OVERFLOW"));
});

test("worst selection includes maximum base variant and all independent groups", () => {
  const graph = fixture(); graph.productVariants[0].basePrice = Number.MAX_SAFE_INTEGER - 300;
  graph.modifierOptions[0].priceDelta = 200;
  const group = { ...graph.modifierGroups[0], id: randomUUID(), code: "other" };
  const option = { ...graph.modifierOptions[0], id: randomUUID(), groupId: group.id };
  graph.modifierGroups.push(group); graph.modifierOptions.push(option);
  graph.modifierGroupTranslations.push({ revisionId: graph.revision.id, productId: group.productId, groupId: group.id, title: "QA other", description: "" });
  graph.modifierOptionTranslations.push({ revisionId: graph.revision.id, productId: option.productId, groupId: group.id, optionId: option.id, title: "QA other", description: "" });
  assert.ok(has(validateCatalogReviewReadiness(graph), "PRICE_TOTAL_OVERFLOW"));
});

test("readiness reader validates input before DB access and sanitizes driver failures", async () => {
  let touched = false;
  const db = new Proxy({}, { get: () => { touched = true; throw new Error("private-details"); } });
  for (const input of [null, {}, { revisionId: "bad", expectedVersion: 1 }, { revisionId: randomUUID(), expectedVersion: 0 }]) {
    await assert.rejects(getCatalogReviewReadiness(db, input), error => error instanceof CatalogDraftError && error.code === "INVALID_INPUT");
  }
  assert.equal(touched, false);
  await assert.rejects(getCatalogReviewReadiness(db, { revisionId: randomUUID(), expectedVersion: 1 }), error =>
    error instanceof CatalogDraftError && error.code === "PERSISTENCE_FAILED" && !error.message.includes("private-details") && !error.cause);
});
