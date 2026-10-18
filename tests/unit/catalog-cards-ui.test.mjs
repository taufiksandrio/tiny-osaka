import test from "node:test";
import assert from "node:assert/strict";
import { parsePrice, validateProduct, toPayload, buildPayload, validateAlt, validateImageFile } from "../../src/features/cms/catalog/product-form.mjs";
import { checkOrderUrl } from "../../src/features/cms/catalog/order-links.mjs";
import { checkOrderUrl as serverCheck, ORDER_LINK_KEYS } from "../../src/server/catalog/order-links.mjs";
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

const base = { name: "A", description: "", price: "100" };
const ID = "11111111-1111-4111-8111-111111111111";
test("alt text and file rules follow AC-20a and AC-21", () => {
  assert.equal(validateAlt(""), "Teks alternatif gambar wajib diisi.");
  assert.equal(validateAlt("a".repeat(501)), "Teks alternatif maksimal 500 karakter.");
  assert.equal(validateAlt("a<b"), "Teks alternatif tidak boleh memuat < atau >.");
  assert.equal(validateAlt(" Takoyaki panas "), null);
  assert.equal(validateImageFile({ type: "image/gif", size: 10 }), "Format gambar harus JPEG, PNG, atau WebP.");
  assert.equal(validateImageFile({ type: "application/pdf", size: 10 }), "Format gambar harus JPEG, PNG, atau WebP.");
  assert.equal(validateImageFile({ type: "image/png", size: 10_000_001 }), "Ukuran gambar maksimal 10 MB.");
  assert.equal(validateImageFile({ type: "image/webp", size: 10_000_000 }), null);
});
test("alt is required only when an image exists; links are optional", () => {
  assert.deepEqual(validateProduct({ ...base, hasImage: false, alt: "" }), {});
  assert.deepEqual(Object.keys(validateProduct({ ...base, hasImage: true, alt: "  " })), ["alt"]);
  assert.deepEqual(validateProduct({ ...base, grabfoodUrl: "", gofoodUrl: "   ", shopeefoodUrl: "" }), {});
  const errors = validateProduct({ ...base, grabfoodUrl: "http://x.example.test/a", gofoodUrl: "https://ok.example.test/a", shopeefoodUrl: "javascript:alert(1)" });
  assert.deepEqual(Object.keys(errors).sort(), ["grabfoodUrl", "shopeefoodUrl"]);
  assert.equal(errors.grabfoodUrl, "Link GrabFood harus diawali https://.");
});
test("client link rules match the server checkOrderUrl", () => {
  const inputs = ["", "  ", null, "https://shop.example.test/a?b=1", " https://shop.example.test/a ", "HTTPS://shop.example.test/a", "http://shop.example.test", "javascript:alert(1)",
    "data:text/html,x", "file:///etc/passwd", "ftp://a.test", "https://user:pw@shop.example.test", "https://shop.example.test:8443/", "https://shop.example.test:443/x", "https:///shop.example.test",
    "https://shop.example.test/a b", "https://shop.example.test/<x>", "https://shop.example.test/" + "a".repeat(2100), "bukan url", "https://"];
  for (const key of ORDER_LINK_KEYS) for (const input of inputs) assert.deepEqual(checkOrderUrl(key, input), serverCheck(key, input), `${key} ${input}`);
});
test("buildPayload on create sends only filled links and the uploaded image", () => {
  assert.deepEqual(buildPayload({ ...base, alt: "", grabfoodUrl: "", gofoodUrl: " ", shopeefoodUrl: "" }), { name: "A", description: "", price: 100 });
  assert.deepEqual(buildPayload({ ...base, alt: " Foto ", gofoodUrl: " https://shop.example.test/a " }, undefined, ID),
    { name: "A", description: "", price: 100, gofoodUrl: "https://shop.example.test/a", imageAssetId: ID, imageAlt: "Foto" });
});
test("buildPayload on edit sends only changed links and follows the image contract", () => {
  const product = { slug: "a", grabfoodUrl: "https://shop.example.test/g", gofoodUrl: null, shopeefoodUrl: null, image: { assetId: ID, alt: "Lama" } };
  const same = { ...base, alt: "Lama", grabfoodUrl: "https://shop.example.test/g", gofoodUrl: "", shopeefoodUrl: "" };
  assert.deepEqual(buildPayload(same, product), { name: "A", description: "", price: 100 }); // nothing changed: no link or image keys
  assert.equal(buildPayload({ ...same, grabfoodUrl: "" }, product).grabfoodUrl, null); // cleared = null
  assert.equal("gofoodUrl" in buildPayload({ ...same, grabfoodUrl: "" }, product), false);
  assert.equal(buildPayload({ ...same, shopeefoodUrl: "https://shop.example.test/s" }, product).shopeefoodUrl, "https://shop.example.test/s");
  assert.deepEqual(Object.keys(buildPayload({ ...same, alt: "Baru" }, product)).filter(key => key.startsWith("image")), ["imageAlt"]); // alt only
  const swap = buildPayload({ ...same, alt: "Baru" }, product, "22222222-2222-4222-8222-222222222222");
  assert.equal(swap.imageAssetId, "22222222-2222-4222-8222-222222222222"); assert.equal(swap.imageAlt, "Baru");
  const detach = buildPayload({ ...same, alt: "", removed: true }, product);
  assert.equal(detach.imageAssetId, null); assert.equal("imageAlt" in detach, false);
  assert.equal(Object.keys(buildPayload({ ...base, alt: "" }, { slug: "b", image: null })).some(key => key.startsWith("image")), false);
});
