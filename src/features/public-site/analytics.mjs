// GA4 client helpers (ADR-041). Pure and dependency-free so the payload rules can be unit tested without a browser.
// Only an outbound order-intent signal is measured; never a completed order. No PII, no money, no raw order URL.
export const CONSENT_STORAGE_KEY = "to_analytics_consent";
export const PRIVACY_EVENT = "tinyosaka:privacy-settings";
export const CLICK_ORDER_EVENT = "click_order";
export const ORDER_PLATFORM_IDS = Object.freeze(["gofood", "grabfood", "shopeefood"]);
export const ORDER_PLACEMENTS = Object.freeze(["menu_card", "menu_detail", "promo_cta"]);
export const CLICK_ORDER_PARAMS = Object.freeze(["platform", "product_slug", "placement", "page_path"]);
export const FORBIDDEN_PARAMS = Object.freeze(["value", "currency", "price", "url", "href", "email", "name", "user_id", "transaction_id"]);
export const FORBIDDEN_EVENTS = Object.freeze(["purchase", "order_complete", "begin_checkout", "add_payment_info"]);

const SLUG = /^[a-z0-9-]{1,120}$/;
const PATH = /^\/[A-Za-z0-9\-._~/%]{0,200}$/;

// Returns { name, params } or null when any input is not allowlisted (fail closed).
export const buildClickOrderEvent = ({ platform, productSlug, placement, pagePath } = {}) => {
  if (!ORDER_PLATFORM_IDS.includes(platform) || !ORDER_PLACEMENTS.includes(placement)) return null;
  if (typeof productSlug !== "string" || !SLUG.test(productSlug)) return null;
  if (typeof pagePath !== "string" || !PATH.test(pagePath)) return null;
  return { name: CLICK_ORDER_EVENT, params: { platform, product_slug: productSlug, placement, page_path: pagePath } };
};

export const readConsent = (storage) => {
  try {
    const value = storage?.getItem(CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch { return null; }
};
export const writeConsent = (storage, value) => {
  try { storage?.setItem(CONSENT_STORAGE_KEY, value); } catch { /* storage unavailable: choice lasts for this page only */ }
};

const consentState = (analytics) => ({
  analytics_storage: analytics, ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
});
export const DEFAULT_CONSENT = Object.freeze(consentState("denied"));
export const consentUpdate = (granted) => consentState(granted ? "granted" : "denied");

// Standard gtag stub: pushes the `arguments` object, as gtag.js requires.
export const ensureGtag = (win) => {
  win.dataLayer = win.dataLayer || [];
  if (typeof win.gtag !== "function") win.gtag = function gtag() { win.dataLayer.push(arguments); };
  return win.gtag;
};

// Sends only when consent was granted in this browser and analytics was activated by the loader. Never throws.
export const trackEvent = (event, win = typeof window === "undefined" ? undefined : window) => {
  try {
    if (!win || !event || event.name !== CLICK_ORDER_EVENT || !win.__tinyOsakaAnalytics) return false;
    if (readConsent(win.localStorage) !== "granted") return false;
    win.gtag("event", event.name, { ...event.params, transport_type: "beacon" });
    return true;
  } catch { return false; }
};

export const trackClickOrder = (input, win) => {
  const event = buildClickOrderEvent({ ...input, pagePath: input?.pagePath ?? (typeof window === "undefined" ? undefined : window.location.pathname) });
  return event ? trackEvent(event, win) : false;
};
