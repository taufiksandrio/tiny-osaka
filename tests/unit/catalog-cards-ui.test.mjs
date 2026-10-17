import test from "node:test";
import assert from "node:assert/strict";
import { parsePrice, validateProduct, toPayload } from "../../src/features/cms/catalog/product-form.mjs";
import { featuredProducts, listedProducts, productPrice } from "../../src/server/public/view-models.mjs";

test("price parsing accepts safe non-negative integers only", () => {
  assert.equal(parsePrice("25000"), 25000); assert.equal(parsePrice(" 0 "), 0);
  for (const bad of ["", "-1", "12,5", "1.5", "abc", "9007199254740993"]) assert.equal(parsePrice(bad), null);
});
test("product form validation mirrors server limits", () => {
  assert.deepEqual(validateProduct({ name: "Takoyaki", description: "", price: "100" }), {});
  const errors = validateProduct({ name: " ", description: "<b>", price: "x" });
  assert.deepEqual(Object.keys(errors).sort(), ["description", "name", "price"]);
  assert.ok(validateProduct({ name: "a".repeat(121), description: "", price: "1" }).name);
  assert.ok(validateProduct({ name: "ok", description: "a".repeat(1001), price: "1" }).description);
  assert.deepEqual(toPayload({ name: " A ", description: " d ", price: "5" }), { name: "A", description: "d", price: 5 });
});
test("public helpers use newest-first order, one price, and four featured products", () => {
  const products = Array.from({ length: 6 }, (_, index) => ({ slug: "p" + index, sortOrder: index, variants: [{ code: "standard", basePrice: 1000 + index }] }));
  assert.deepEqual(listedProducts({ products }).map(row => row.slug), ["p5", "p4", "p3", "p2", "p1", "p0"]);
  assert.deepEqual(featuredProducts({ products }).map(row => row.slug), ["p5", "p4", "p3", "p2"]);
  assert.equal(listedProducts({ products })[0].price, 1005);
  assert.equal(productPrice({ variants: [{ code: "a", basePrice: 9 }, { code: "b", basePrice: 3 }] }), 3);
  assert.deepEqual(featuredProducts(null), []);
});
