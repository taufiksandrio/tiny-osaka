import test from "node:test";
import assert from "node:assert/strict";
import { ORDER_LINK_KEYS, OFFICIAL_ORDER_HOSTS, ORDER_URL_MAX, checkOrderUrl, isOfficialOrderHost } from "../../src/server/catalog/order-links.mjs";
import { parseProductInput } from "../../src/server/catalog/product-input.mjs";

const KEY = "grabfoodUrl";
const ok = (value, options) => { const result = checkOrderUrl(KEY, value, options); assert.equal(result.ok, true, String(value)); return result.value; };
const bad = (value, message, options, key = KEY) => {
  const result = checkOrderUrl(key, value, options);
  assert.equal(result.ok, false, String(value)); assert.equal(result.field, key);
  if (message) assert.equal(result.message, message, String(value));
};
// Synthetic hosts only (reserved .example / .invalid); no real platform host is assumed anywhere.
const hosts = { grabfoodUrl: ["shop.grab.example"], gofoodUrl: ["shop.go.example"], shopeefoodUrl: [] };

test("the shipped allowlists are empty (not enforced yet) and the check lives in one function", () => {
  for (const key of ORDER_LINK_KEYS) assert.deepEqual(OFFICIAL_ORDER_HOSTS[key], []);
  assert.ok(Object.isFrozen(OFFICIAL_ORDER_HOSTS) && Object.isFrozen(OFFICIAL_ORDER_HOSTS.grabfoodUrl));
  assert.equal(isOfficialOrderHost(KEY, "anything.example"), true);
});
test("empty allowlist mode: any https host is accepted, trimmed, scheme normalised to lowercase", () => {
  assert.equal(ok("  https://anything.example/menu?x=1  "), "https://anything.example/menu?x=1");
  assert.equal(ok("HTTPS://Anything.Example/A"), "https://Anything.Example/A");
  assert.equal(ok("https://anything.example:443/a"), "https://anything.example:443/a");
  assert.equal(ok("https://xn--bcher-kva.example/"), "https://xn--bcher-kva.example/");
});
test("blank, whitespace and null remove the link; non-strings are invalid", () => {
  for (const value of [null, "", "   ", "\n\t "]) assert.equal(ok(value), null);
  for (const value of [undefined, 5, true, {}, [], ["https://a.example"]]) bad(value, "Link GrabFood tidak valid.");
});
test("rules that hold in both modes: https only, no credentials, port empty or 443, length, no unsafe characters", () => {
  for (const options of [undefined, { hosts }]) {
    const host = options ? "shop.grab.example" : "anything.example";
    for (const value of ["http://" + host, "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "blob:https://" + host, "ftp://" + host,
      host + "/a", "//" + host, "mailto:a@b.example", "https:/" + host, "https:" + host]) bad(value, "Link GrabFood harus diawali https://.", options);
    for (const value of [`https://user@${host}/`, `https://user:pass@${host}/`, `https://:pass@${host}/`, `https://${host}:8443/`, `https://${host}:80/`,
      `https://${host}/a b`, `https://${host}/a"b`, `https://${host}/<x>`, `https://${host}/a\\b`, `https://${host}/a\u0000b`, `https://${host}/a\nb`,
      "https://", "https:///a", "https://%", "https://exa mple.example/"]) bad(value, "Link GrabFood tidak valid.", options);
    bad("https://" + host + "/" + "x".repeat(ORDER_URL_MAX), "Link GrabFood maksimal 2048 karakter.", options);
  }
  assert.equal(ok("https://anything.example/" + "x".repeat(ORDER_URL_MAX - 26)).length, ORDER_URL_MAX - 1);
  assert.equal(ok("https://anything.example/" + "x".repeat(ORDER_URL_MAX - 25)).length, ORDER_URL_MAX);
  bad("https://anything.example/" + "x".repeat(ORDER_URL_MAX - 24), "Link GrabFood maksimal 2048 karakter.");
});
test("filled allowlist mode with fake hosts: exact hostname only, per platform, case-insensitive host", () => {
  const options = { hosts };
  assert.equal(ok("https://shop.grab.example/store/1", options), "https://shop.grab.example/store/1");
  assert.equal(ok("https://SHOP.GRAB.EXAMPLE/x", options), "https://SHOP.GRAB.EXAMPLE/x");
  assert.equal(ok("https://shop.grab.example:443/x", options), "https://shop.grab.example:443/x");
  const wrong = "Link GrabFood harus berasal dari domain resmi GrabFood.";
  for (const value of ["https://evil.example/", "https://grab.example/", "https://shop.grab.example.evil.invalid/", "https://evilshop.grab.example/",
    "https://sub.shop.grab.example/", "https://shop.grab.example@evil.invalid/", "https://evil.invalid/shop.grab.example", "https://shop.grab.example.invalid/",
    "https://shop-grab.example/", "https://xn--shop-grab-example.invalid/"]) {
    const result = checkOrderUrl(KEY, value, options);
    // A credential URL is rejected for that reason first; either way it is never accepted.
    assert.equal(result.ok, false, value); assert.ok([wrong, "Link GrabFood tidak valid."].includes(result.message), value);
  }
  bad("https://evil.example/", wrong, options);
  // Platform lists are independent; an empty list for one platform does not enforce.
  bad("https://shop.grab.example/", "Link GoFood harus berasal dari domain resmi GoFood.", options, "gofoodUrl");
  assert.equal(checkOrderUrl("gofoodUrl", "https://shop.go.example/a", options).ok, true);
  assert.equal(checkOrderUrl("shopeefoodUrl", "https://whatever.example/a", options).ok, true);
  bad("http://shop.grab.example/", "Link GrabFood harus diawali https://.", options);
  assert.equal(isOfficialOrderHost("grabfoodUrl", "shop.grab.example", hosts), true);
  assert.equal(isOfficialOrderHost("grabfoodUrl", "other.example", hosts), false);
});
test("messages are Indonesian and name the platform", () => {
  bad("http://a.example", "Link GoFood harus diawali https://.", undefined, "gofoodUrl");
  bad("http://a.example", "Link ShopeeFood harus diawali https://.", undefined, "shopeefoodUrl");
  assert.throws(() => checkOrderUrl("tokopediaUrl", "https://a.example"));
});

const base = { name: "Takoyaki", price: 1000 };
const code = expected => error => error?.code === expected;
test("product input: absent keys stay absent, null and blank clear, strings are trimmed", () => {
  assert.equal("orderLinks" in parseProductInput(base), false);
  assert.deepEqual(parseProductInput({ ...base, grabfoodUrl: " https://a.example/x ", gofoodUrl: null, shopeefoodUrl: "  " }).orderLinks,
    { grabfoodUrl: "https://a.example/x", gofoodUrl: null, shopeefoodUrl: null });
  assert.deepEqual(parseProductInput({ ...base, gofoodUrl: "https://b.example" }).orderLinks, { gofoodUrl: "https://b.example" });
  const update = parseProductInput({ ...base, expectedVersion: "a".repeat(64), shopeefoodUrl: null }, { update: true });
  assert.deepEqual(update.orderLinks, { shopeefoodUrl: null });
});
test("product input: invalid link raises INVALID_ORDER_URL (400) with field and Indonesian message; unknown link keys stay forbidden", () => {
  for (const [extra, field, message] of [[{ grabfoodUrl: "http://a.example" }, "grabfoodUrl", "Link GrabFood harus diawali https://."],
    [{ gofoodUrl: 5 }, "gofoodUrl", "Link GoFood tidak valid."], [{ shopeefoodUrl: "javascript:alert(1)" }, "shopeefoodUrl", "Link ShopeeFood harus diawali https://."]]) {
    assert.throws(() => parseProductInput({ ...base, ...extra }), error => error.code === "INVALID_ORDER_URL" && error.status === 400 &&
      error.detail.field === field && error.detail.message === message);
  }
  for (const key of ["tokopediaUrl", "orderUrl", "grabUrl", "links"]) assert.throws(() => parseProductInput({ ...base, [key]: "https://a.example" }), code("INVALID_INPUT"));
});
