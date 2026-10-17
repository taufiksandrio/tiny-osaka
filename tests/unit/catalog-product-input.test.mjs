import test from "node:test";
import assert from "node:assert/strict";
import { slugify, slugCandidate, parseProductInput, validProductSlug, PRODUCT_LIMITS } from "../../src/server/catalog/product-input.mjs";
import { productPrice, newestFirst, featuredProducts, listedProducts } from "../../src/server/public/view-models.mjs";
import { validateCatalogReviewReadiness } from "../../src/server/catalog/review-readiness.mjs";

const code = expected => error => error?.code === expected;

test("slugify folds accents, separates symbols, trims hyphens and is stable", () => {
  assert.equal(slugify("Takoyaki Original"), "takoyaki-original");
  assert.equal(slugify("  Crème  Brûlée!! "), "creme-brulee");
  assert.equal(slugify("--A&B--"), "a-b");
  assert.equal(slugify("Ramen 2.0"), "ramen-2-0");
  assert.match(slugify("x".repeat(500)), /^x{80}$/);
  for (const slug of [slugify("Okonomiyaki Spesial"), slugify("A  b")]) assert.ok(validProductSlug(slug));
});
test("symbol-only or non-latin names produce an empty slug the service rejects", () => {
  for (const name of ["!!!", "---", "たこ焼き", "   "]) assert.equal(slugify(name), "");
});
test("collisions become -2, -3 and never alter the base", () => {
  assert.equal(slugCandidate("takoyaki", 1), "takoyaki");
  assert.equal(slugCandidate("takoyaki", 2), "takoyaki-2");
  assert.equal(slugCandidate("takoyaki", 3), "takoyaki-3");
  assert.ok(validProductSlug(slugCandidate(slugify("x".repeat(500)), 12)));
});
test("create input trims text, defaults description and keeps integer price", () => {
  assert.deepEqual(parseProductInput({ name: "  Takoyaki ", price: 25000 }), { name: "Takoyaki", description: "", price: 25000 });
  assert.deepEqual(parseProductInput({ name: "A", description: " baris 1\nbaris 2 ", price: 0 }), { name: "A", description: "baris 1\nbaris 2", price: 0 });
});
test("create input rejects invalid names, descriptions and prices with specific codes", () => {
  assert.throws(() => parseProductInput({ name: "", price: 1 }), code("INVALID_NAME"));
  assert.throws(() => parseProductInput({ name: "   ", price: 1 }), code("INVALID_NAME"));
  assert.throws(() => parseProductInput({ name: "x".repeat(PRODUCT_LIMITS.name + 1), price: 1 }), code("INVALID_NAME"));
  assert.throws(() => parseProductInput({ name: "<b>x</b>", price: 1 }), code("INVALID_NAME"));
  assert.throws(() => parseProductInput({ name: "a\nb", price: 1 }), code("INVALID_NAME"));
  assert.throws(() => parseProductInput({ name: "a\u0000", price: 1 }), code("INVALID_NAME"));
  assert.throws(() => parseProductInput({ name: 5, price: 1 }), code("INVALID_NAME"));
  assert.throws(() => parseProductInput({ name: "A", description: "x".repeat(PRODUCT_LIMITS.description + 1), price: 1 }), code("INVALID_DESCRIPTION"));
  assert.throws(() => parseProductInput({ name: "A", description: "<script>", price: 1 }), code("INVALID_DESCRIPTION"));
  assert.throws(() => parseProductInput({ name: "A", description: null, price: 1 }), code("INVALID_DESCRIPTION"));
  for (const price of [-1, 1.5, "100", null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseProductInput({ name: "A", price }), code("INVALID_PRICE"));
  }
  assert.equal(parseProductInput({ name: "A", price: Number.MAX_SAFE_INTEGER }).price, Number.MAX_SAFE_INTEGER);
});
test("unknown or structural fields (category, variants, modifiers, image, slug) are rejected", () => {
  for (const extra of [{ categoryId: "x" }, { variants: [] }, { modifiers: [] }, { topping: [] }, { image: "x" }, { slug: "x" }, { assetId: "x" }, { role: "owner" }]) {
    assert.throws(() => parseProductInput({ name: "A", price: 1, ...extra }), code("INVALID_INPUT"));
  }
  for (const bad of [null, [], "x", 1]) assert.throws(() => parseProductInput(bad), code("INVALID_INPUT"));
});
test("update input requires the exact version token", () => {
  const token = "a".repeat(64);
  assert.equal(parseProductInput({ name: "A", price: 1, expectedVersion: token }, { update: true }).expectedVersion, token);
  for (const expectedVersion of [undefined, 1, "short", "A".repeat(64)]) {
    assert.throws(() => parseProductInput({ name: "A", price: 1, expectedVersion }, { update: true }), code("INVALID_INPUT"));
  }
  assert.throws(() => parseProductInput({ name: "A", price: 1, expectedVersion: token }), code("INVALID_INPUT"));
});
test("slug path parameter accepts only the canonical shape", () => {
  for (const slug of ["a", "a-b", "a1-2"]) assert.ok(validProductSlug(slug));
  for (const slug of ["", "A", "a--b", "-a", "a-", "a/b", "../x", "a b", "a".repeat(161), undefined, null]) {
    assert.equal(validProductSlug(slug), false);
  }
});
test("public view model: one price, newest first, home shows at most four", () => {
  const product = (slug, sortOrder, variants) => ({ id: slug, slug, sortOrder, variants });
  const catalog = { products: [product("a", 0, [{ code: "standard", basePrice: 10 }]), product("e", 4, [{ code: "large", basePrice: 30 }, { code: "small", basePrice: 20 }]),
    product("c", 2, [{ code: "standard", basePrice: 12 }, { code: "large", basePrice: 99 }]), product("b", 1, [{ code: "standard", basePrice: 11 }]),
    product("d", 3, [{ code: "standard", basePrice: 13 }])] };
  assert.deepEqual(newestFirst(catalog.products).map(row => row.slug), ["e", "d", "c", "b", "a"]);
  assert.deepEqual(featuredProducts(catalog).map(row => row.slug), ["e", "d", "c", "b"]);
  assert.deepEqual(listedProducts(catalog).map(row => row.price), [20, 13, 12, 11, 10]);
  assert.equal(featuredProducts({ products: [product("x", 0, [])] }).length, 1);
  assert.deepEqual(featuredProducts(null), []);
  assert.equal(productPrice({ variants: [] }), 0);
  assert.deepEqual(catalog.products.map(row => row.slug), ["a", "e", "c", "b", "d"]); // input is not mutated
});
test("readiness lets a catalog end empty only when explicitly allowed", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const graph = { revision: { id, status: "draft", version: 1 }, categories: [], products: [], categoryEntries: [], productEntries: [], categoryTranslations: [],
    productTranslations: [], productVariants: [], variantTranslations: [], modifierGroups: [], modifierGroupTranslations: [], modifierOptions: [],
    modifierOptionTranslations: [], mediaRefs: [], mediaAssets: [] };
  assert.ok(validateCatalogReviewReadiness(graph).issues.some(row => row.code === "EMPTY_CATALOG"));
  assert.equal(validateCatalogReviewReadiness(graph, { allowEmpty: true }).ready, true);
});
test("image pair (AC-20/AC-20a): cases a-f, alt trimming and limits", () => {
  const asset = "0b8f3c1e-5d2a-4c7b-9e41-3a6f5d8c2b10";
  const base = { name: "A", price: 1 };
  const upd = extra => parseProductInput({ ...base, expectedVersion: "a".repeat(64), ...extra }, { update: true });
  // (a) absent keys: no image key at all, so existing outputs are unchanged
  assert.deepEqual(upd({}).image, undefined);
  // (b) set / replace; alt trimmed, asset id lower-cased
  assert.deepEqual(upd({ imageAssetId: asset.toUpperCase(), imageAlt: "  Takoyaki  " }).image, { mode: "set", assetId: asset, alt: "Takoyaki" });
  // (c) clear: null with absent or null alt
  assert.deepEqual(upd({ imageAssetId: null }).image, { mode: "clear" });
  assert.deepEqual(upd({ imageAssetId: null, imageAlt: null }).image, { mode: "clear" });
  // (d) alt only
  assert.deepEqual(upd({ imageAlt: "Alt baru" }).image, { mode: "alt", alt: "Alt baru" });
  // (e) asset without alt, (f) null asset with alt
  for (const extra of [{ imageAssetId: asset }, { imageAssetId: asset, imageAlt: null }, { imageAssetId: null, imageAlt: "x" }]) {
    assert.throws(() => upd(extra), code("INVALID_IMAGE_ALT"));
  }
  for (const imageAssetId of ["x", "", 5, {}, [], "0b8f3c1e-5d2a-4c7b-9e41-3a6f5d8c2b1"]) assert.throws(() => upd({ imageAssetId, imageAlt: "x" }), code("INVALID_IMAGE"));
  const bad = ["", "   ", "x".repeat(501), "a<b", "a>b", "a\nb", "a\tb", "a\u0000b", "a\u007fb", 5, null, {}];
  for (const imageAlt of bad) assert.throws(() => upd({ imageAssetId: asset, imageAlt }), code("INVALID_IMAGE_ALT"), String(imageAlt));
  for (const imageAlt of bad.slice(0, 11)) assert.throws(() => upd({ imageAlt }), code("INVALID_IMAGE_ALT"), "alt only " + String(imageAlt));
  assert.equal(upd({ imageAssetId: asset, imageAlt: "x".repeat(500) }).image.alt.length, 500);
  // create uses the same parser; other keys remain forbidden
  assert.deepEqual(parseProductInput({ ...base, imageAssetId: asset, imageAlt: "Ok" }).image, { mode: "set", assetId: asset, alt: "Ok" });
  for (const extra of [{ image: "x" }, { imageUrl: "x" }, { images: [] }, { categoryId: "x" }]) assert.throws(() => upd(extra), code("INVALID_INPUT"));
});
