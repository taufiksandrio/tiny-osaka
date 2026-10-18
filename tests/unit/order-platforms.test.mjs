import test from "node:test";
import assert from "node:assert/strict";
import { ORDER_LINK_REL, ORDER_PLATFORMS, normalizeOrderLinks, orderAriaLabel } from "../../src/features/public-site/components/order-platforms.mjs";

test("normalizeOrderLinks keeps fixed GoFood, GrabFood, ShopeeFood order and hides missing platforms", () => {
  const links = [{ platform: "shopeefood", href: "https://s.test/1" }, { platform: "gofood", href: "https://g.test/1" }];
  assert.deepEqual(normalizeOrderLinks(links).map(row => row.id), ["gofood", "shopeefood"]);
  assert.deepEqual(normalizeOrderLinks(links).map(row => row.href), ["https://g.test/1", "https://s.test/1"]);
});
test("normalizeOrderLinks returns [] for empty, malformed, unknown or non-https input", () => {
  for (const bad of [undefined, null, [], "x", {}, [null], [{ platform: "grabfood" }], [{ platform: "other", href: "https://a.test" }],
    [{ platform: "gofood", href: "http://a.test" }], [{ platform: "gofood", href: "javascript:alert(1)" }]]) assert.deepEqual(normalizeOrderLinks(bad), []);
});
test("single link yields one entry; labels and rel follow the spec", () => {
  const [only, ...rest] = normalizeOrderLinks([{ platform: "grabfood", href: "https://g.test/x" }]);
  assert.equal(rest.length, 0); assert.equal(orderAriaLabel(only), "Pesan lewat GrabFood");
  assert.equal(ORDER_LINK_REL, "noopener noreferrer nofollow");
  assert.deepEqual(ORDER_PLATFORMS.map(row => row.label), ["GoFood", "GrabFood", "ShopeeFood"]);
});
