import test from "node:test";
import assert from "node:assert/strict";
import {
  CLICK_ORDER_PARAMS, FORBIDDEN_EVENTS, FORBIDDEN_PARAMS, buildClickOrderEvent, consentUpdate, DEFAULT_CONSENT,
  readConsent, trackClickOrder, trackEvent, writeConsent,
} from "../../src/features/public-site/analytics.mjs";

const input = { platform: "gofood", productSlug: "takoyaki", placement: "menu_card", pagePath: "/menu" };
const makeWin = (consent, active = true) => {
  const calls = [];
  const store = new Map(consent ? [["to_analytics_consent", consent]] : []);
  return { calls, __tinyOsakaAnalytics: active, gtag: (...args) => calls.push(args),
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } };
};

test("click_order payload has exactly the four allowed params and no forbidden ones", () => {
  const event = buildClickOrderEvent(input);
  assert.equal(event.name, "click_order");
  assert.deepEqual(Object.keys(event.params).sort(), [...CLICK_ORDER_PARAMS].sort());
  for (const key of FORBIDDEN_PARAMS) assert.ok(!(key in event.params));
  assert.ok(!FORBIDDEN_EVENTS.includes(event.name));
});
test("invalid platform, placement, slug or path are rejected (fail closed)", () => {
  for (const bad of [{ platform: "x" }, { placement: "nope" }, { productSlug: "A B" }, { productSlug: undefined },
    { pagePath: "https://evil.test/" }, { pagePath: "menu" }, { pagePath: "/a?email=x@y.z" }]) {
    assert.equal(buildClickOrderEvent({ ...input, ...bad }), null);
  }
});
test("tracking is sent only with consent granted and active loader", () => {
  const granted = makeWin("granted");
  assert.equal(trackClickOrder(input, granted), true);
  assert.deepEqual(granted.calls, [["event", "click_order", { platform: "gofood", product_slug: "takoyaki", placement: "menu_card", page_path: "/menu", transport_type: "beacon" }]]);
  for (const win of [makeWin("denied"), makeWin(null), makeWin("granted", false)]) {
    assert.equal(trackClickOrder(input, win), false);
    assert.equal(win.calls.length, 0);
  }
});
test("trackEvent never throws and ignores other event names", () => {
  assert.equal(trackEvent({ name: "purchase", params: {} }, makeWin("granted")), false);
  assert.equal(trackEvent(null, makeWin("granted")), false);
  assert.equal(trackEvent(buildClickOrderEvent(input), { __tinyOsakaAnalytics: true, localStorage: { getItem: () => "granted" } }), false);
});
test("consent defaults are denied for all four signals; only analytics_storage can be granted", () => {
  assert.deepEqual(Object.values(DEFAULT_CONSENT), ["denied", "denied", "denied", "denied"]);
  assert.equal(consentUpdate(true).analytics_storage, "granted");
  assert.equal(consentUpdate(true).ad_storage, "denied");
  assert.equal(consentUpdate(true).ad_user_data, "denied");
  assert.equal(consentUpdate(true).ad_personalization, "denied");
});
test("consent storage round trip ignores invalid values", () => {
  const win = makeWin(null);
  assert.equal(readConsent(win.localStorage), null);
  writeConsent(win.localStorage, "granted");
  assert.equal(readConsent(win.localStorage), "granted");
  writeConsent(win.localStorage, "maybe");
  assert.equal(readConsent(win.localStorage), null);
});
