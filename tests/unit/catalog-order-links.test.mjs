import test from "node:test";
import assert from "node:assert/strict";
import { ORDER_LINK_KEYS, OFFICIAL_ORDER_HOSTS, ORDER_URL_MAX, checkOrderUrl, isOfficialOrderHost,
  publicOrderLinks, withPublicOrderLinks, PUBLIC_ORDER_PLATFORMS } from "../../src/server/catalog/order-links.mjs";
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

const open = { hosts: { grabfoodUrl: [], gofoodUrl: [], shopeefoodUrl: [] } };

test("the shipped allowlists hold the approved exact hosts (ShopeeFood still empty) and the check lives in one function", () => {
  assert.deepEqual(OFFICIAL_ORDER_HOSTS.grabfoodUrl, ["app.grab.com"]);
  assert.deepEqual(OFFICIAL_ORDER_HOSTS.gofoodUrl, ["gofood.link"]);
  assert.deepEqual(OFFICIAL_ORDER_HOSTS.shopeefoodUrl, []);
  assert.ok(Object.isFrozen(OFFICIAL_ORDER_HOSTS) && Object.isFrozen(OFFICIAL_ORDER_HOSTS.grabfoodUrl));
  for (const key of ORDER_LINK_KEYS) for (const host of OFFICIAL_ORDER_HOSTS[key]) {
    assert.match(host, /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/, "exact lowercase hostname");
    assert.equal(/[*:/@\s]/.test(host) || host.startsWith(".") || host.includes(".."), false, "no wildcard, suffix or path");
  }
  assert.equal(isOfficialOrderHost(KEY, "app.grab.com"), true);
  assert.equal(isOfficialOrderHost(KEY, "evil.example"), false);
  assert.equal(isOfficialOrderHost(KEY, "sub.app.grab.com"), false);
  assert.equal(isOfficialOrderHost(KEY, "grab.com"), false);
  assert.equal(isOfficialOrderHost("shopeefoodUrl", "anything.example"), true, "empty list is not enforced on save");
});
test("AC-11: server and CMS client allowlists are identical", async () => {
  const client = await import("../../src/features/cms/catalog/order-links.mjs");
  assert.deepEqual(client.ORDER_LINK_KEYS, ORDER_LINK_KEYS);
  assert.deepEqual(JSON.parse(JSON.stringify(client.OFFICIAL_ORDER_HOSTS)), JSON.parse(JSON.stringify(OFFICIAL_ORDER_HOSTS)));
  // Same verdicts on the shipped lists.
  for (const [key, url] of [["grabfoodUrl", "https://app.grab.com/x"], ["grabfoodUrl", "https://evil.example/x"], ["gofoodUrl", "https://gofood.link/x"],
    ["gofoodUrl", "https://app.grab.com/x"], ["shopeefoodUrl", "https://anything.example/x"]]) {
    assert.equal(client.checkOrderUrl(key, url).ok, checkOrderUrl(key, url).ok, `${key} ${url}`);
  }
  assert.equal(checkOrderUrl("grabfoodUrl", "https://evil.example/x").message, "Link GrabFood harus berasal dari domain resmi GrabFood.");
});
test("empty allowlist mode: any https host is accepted, trimmed, scheme normalised to lowercase", () => {
  assert.equal(ok("  https://anything.example/menu?x=1  ", open), "https://anything.example/menu?x=1");
  assert.equal(ok("HTTPS://Anything.Example/A", open), "https://Anything.Example/A");
  assert.equal(ok("https://anything.example:443/a", open), "https://anything.example:443/a");
  assert.equal(ok("https://xn--bcher-kva.example/", open), "https://xn--bcher-kva.example/");
});
test("blank, whitespace and null remove the link; non-strings are invalid", () => {
  for (const value of [null, "", "   ", "\n\t "]) assert.equal(ok(value), null);
  // (non-string cases below do not depend on the host list)
  for (const value of [undefined, 5, true, {}, [], ["https://a.example"]]) bad(value, "Link GrabFood tidak valid.");
});
test("rules that hold in both modes: https only, no credentials, port empty or 443, length, no unsafe characters", () => {
  for (const options of [open, { hosts }]) {
    const host = options === open ? "anything.example" : "shop.grab.example";
    for (const value of ["http://" + host, "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "blob:https://" + host, "ftp://" + host,
      host + "/a", "//" + host, "mailto:a@b.example", "https:/" + host, "https:" + host]) bad(value, "Link GrabFood harus diawali https://.", options);
    for (const value of [`https://user@${host}/`, `https://user:pass@${host}/`, `https://:pass@${host}/`, `https://${host}:8443/`, `https://${host}:80/`,
      `https://${host}/a b`, `https://${host}/a"b`, `https://${host}/<x>`, `https://${host}/a\\b`, `https://${host}/a\u0000b`, `https://${host}/a\nb`,
      "https://", "https:///a", "https://%", "https://exa mple.example/"]) bad(value, "Link GrabFood tidak valid.", options);
    bad("https://" + host + "/" + "x".repeat(ORDER_URL_MAX), "Link GrabFood maksimal 2048 karakter.", options);
  }
  assert.equal(ok("https://anything.example/" + "x".repeat(ORDER_URL_MAX - 26), open).length, ORDER_URL_MAX - 1);
  assert.equal(ok("https://anything.example/" + "x".repeat(ORDER_URL_MAX - 25), open).length, ORDER_URL_MAX);
  bad("https://anything.example/" + "x".repeat(ORDER_URL_MAX - 24), "Link GrabFood maksimal 2048 karakter.", open);
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
  assert.deepEqual(parseProductInput({ ...base, grabfoodUrl: " https://app.grab.com/x ", gofoodUrl: null, shopeefoodUrl: "  " }).orderLinks,
    { grabfoodUrl: "https://app.grab.com/x", gofoodUrl: null, shopeefoodUrl: null });
  assert.deepEqual(parseProductInput({ ...base, gofoodUrl: "https://gofood.link/b" }).orderLinks, { gofoodUrl: "https://gofood.link/b" });
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

// ---- Public order links (menu card dialog): publicOrderLinks / withPublicOrderLinks -------------------------
const fixtureHosts = Object.freeze({ grabfoodUrl: ["grab.fixture.example"], gofoodUrl: ["go.fixture.example"], shopeefoodUrl: ["shopee.fixture.example"] });
const entry = (extra = {}) => ({ id: "p1", slug: "p1", grabfoodUrl: "https://grab.fixture.example/a", gofoodUrl: "https://go.fixture.example/b",
  shopeefoodUrl: "https://shopee.fixture.example/c", ...extra });

test("publicOrderLinks: fixed order GoFood, GrabFood, ShopeeFood with public platform ids", () => {
  assert.deepEqual(PUBLIC_ORDER_PLATFORMS.map(row => row.platform), ["gofood", "grabfood", "shopeefood"]);
  assert.deepEqual(publicOrderLinks(entry(), fixtureHosts), [
    { platform: "gofood", href: "https://go.fixture.example/b" },
    { platform: "grabfood", href: "https://grab.fixture.example/a" },
    { platform: "shopeefood", href: "https://shopee.fixture.example/c" }]);
  assert.deepEqual(publicOrderLinks(entry({ gofoodUrl: null, shopeefoodUrl: "" }), fixtureHosts), [{ platform: "grabfood", href: "https://grab.fixture.example/a" }]);
  assert.deepEqual(publicOrderLinks(entry({ grabfoodUrl: null, gofoodUrl: null, shopeefoodUrl: null }), fixtureHosts), []);
  assert.deepEqual(publicOrderLinks({}, fixtureHosts), []);
  assert.deepEqual(publicOrderLinks(null, fixtureHosts), []);
});
test("publicOrderLinks drops hosts outside the allowlist, http, javascript, userinfo, ports and look-alike hosts", () => {
  const dropped = ["https://evil.example/a", "http://grab.fixture.example/a", "javascript:alert(1)", "data:text/html,x", "https://u:p@grab.fixture.example/a",
    "https://grab.fixture.example:8443/a", "https://grab.fixture.example.evil.invalid/a", "https://sub.grab.fixture.example/a", "https://evilgrab.fixture.example/a",
    "https://grab.fixture.example@evil.invalid/a", "//grab.fixture.example/a", "https://grab.fixture.example/a b", 5, {}, []];
  for (const value of dropped) assert.deepEqual(publicOrderLinks(entry({ gofoodUrl: null, shopeefoodUrl: null, grabfoodUrl: value }), fixtureHosts), [], String(value));
  // A platform's link on another platform's host is rejected (lists are per platform).
  assert.deepEqual(publicOrderLinks(entry({ gofoodUrl: "https://grab.fixture.example/a", grabfoodUrl: null, shopeefoodUrl: null }), fixtureHosts), []);
});
test("publicOrderLinks fails closed while an allowlist is empty; the shipped default exposes only approved hosts", () => {
  assert.deepEqual(publicOrderLinks(entry()), [], "fixture hosts are not on the shipped allowlist");
  assert.deepEqual(publicOrderLinks({ grabfoodUrl: "https://app.grab.com/a", gofoodUrl: "https://gofood.link/b", shopeefoodUrl: "https://shopee.example/c" }),
    [{ platform: "gofood", href: "https://gofood.link/b" }, { platform: "grabfood", href: "https://app.grab.com/a" }], "ShopeeFood list is empty: fail closed");
  assert.deepEqual(publicOrderLinks({ grabfoodUrl: "https://gofood.link/a", gofoodUrl: "https://app.grab.com/b" }), [], "hosts are per platform");
  assert.deepEqual(publicOrderLinks(entry(), { ...fixtureHosts, gofoodUrl: [] }).map(row => row.platform), ["grabfood", "shopeefood"]);
  assert.deepEqual(publicOrderLinks(entry(), {}), []);
  assert.deepEqual(publicOrderLinks(entry(), { grabfoodUrl: "grab.fixture.example" }), [], "a non-array list is not an allowlist");
});
test("publicOrderLinks never throws and never mutates the entry", () => {
  const source = Object.freeze(entry());
  assert.doesNotThrow(() => publicOrderLinks(source, fixtureHosts));
  assert.equal(source.grabfoodUrl, "https://grab.fixture.example/a");
});
test("withPublicOrderLinks replaces the three raw fields by orderLinks and keeps everything else", () => {
  const source = entry({ title: "Takoyaki", variants: [{ code: "standard" }] });
  const result = withPublicOrderLinks(source, fixtureHosts);
  assert.equal(result.orderLinks.length, 3);
  for (const key of ORDER_LINK_KEYS) assert.equal(key in result, false);
  assert.equal(result.title, "Takoyaki"); assert.deepEqual(result.variants, [{ code: "standard" }]);
  assert.equal(source.grabfoodUrl, "https://grab.fixture.example/a", "input is not mutated");
  const none = withPublicOrderLinks(entry(), undefined);
  assert.deepEqual(none.orderLinks, []);
  assert.equal(JSON.stringify(none).includes("fixture.example"), false, "raw URLs never remain in the public object");
});
