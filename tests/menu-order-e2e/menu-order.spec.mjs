import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Read-only QA of the menu card order dialog against the running dev server. Platform links are never clicked;
// every request to a non-local host is aborted and recorded (AC-13).
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
const PLATFORM_HOST = { GoFood: "gofood.link", GrabFood: "app.grab.com" };
const PLATFORM_ORDER = ["GoFood", "GrabFood"];
const REL_TOKENS = ["noopener", "noreferrer", "nofollow"];
const externalHosts = new WeakMap();
const pageErrors = new WeakMap();

test.beforeEach(async ({ context, page }) => {
  const external = [];
  const errors = [];
  externalHosts.set(page, external);
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    if (LOCAL_HOSTS.includes(host)) return route.continue();
    external.push(host);
    return route.abort();
  });
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

const triggers = page => page.getByRole("button", { name: "Pesan", exact: true });
const dialogOf = page => page.getByRole("dialog");
const openAt = async (page, index) => {
  await triggers(page).nth(index).click();
  await expect(dialogOf(page)).toBeVisible();
  return dialogOf(page);
};
// The platform mark is an SVG with its own letter; the visible name lives in the <span>.
const readLinks = dialog => dialog.getByRole("link").evaluateAll(els => els.map(el => ({
  text: (el.querySelector("span")?.textContent ?? "").trim(),
  label: el.getAttribute("aria-label"),
  href: el.getAttribute("href"),
  target: el.getAttribute("target"),
  rel: el.getAttribute("rel") ?? "",
})));
const dialogTitle = async dialog => (await dialog.getByRole("heading", { level: 2 }).textContent()).trim();
const countOf = (html, needle) => html.split(needle).length - 1;
const noHorizontalScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("menu: every card opens a dialog whose buttons match the stored links", async ({ page, request }) => {
  test.setTimeout(240000);
  const html = await (await request.get("/menu")).text();
  const expected = { GoFood: countOf(html, PLATFORM_HOST.GoFood), GrabFood: countOf(html, PLATFORM_HOST.GrabFood) };
  await page.goto("/menu");
  const count = await triggers(page).count();
  expect(count).toBeGreaterThan(0);
  const totals = { GoFood: 0, GrabFood: 0 };
  const shapes = {};
  for (let index = 0; index < count; index++) {
    const dialog = await openAt(page, index);
    const title = await dialogTitle(dialog);
    expect(title, `card ${index} title`).not.toBe("");
    const links = await readLinks(dialog);
    const labels = links.map(link => link.text);
    expect(labels.length, `card ${index} link count`).toBeGreaterThanOrEqual(1);
    expect(labels, `card ${index} order`).toEqual(PLATFORM_ORDER.filter(name => labels.includes(name)));
    for (const link of links) {
      expect(new URL(link.href).protocol, `card ${index} ${link.text} protocol`).toBe("https:");
      expect(new URL(link.href).hostname, `card ${index} ${link.text} host`).toBe(PLATFORM_HOST[link.text]);
      expect(link.target, `card ${index} ${link.text} target`).toBe("_blank");
      for (const token of REL_TOKENS) expect(link.rel.split(/\s+/), `card ${index} ${link.text} rel`).toContain(token);
      totals[link.text] += 1;
    }
    const shape = labels.join("+");
    shapes[shape] = (shapes[shape] ?? 0) + 1;
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  expect(totals).toEqual(expected);
  expect(externalHosts.get(page).filter(host => Object.values(PLATFORM_HOST).includes(host))).toEqual([]);
  test.info().annotations.push({ type: "card-shapes", description: JSON.stringify(shapes) });
});

test("home: featured cards open the same dialog", async ({ page }) => {
  await page.goto("/");
  const count = await triggers(page).count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const dialog = await openAt(page, index);
    const links = await readLinks(dialog);
    expect(links.length).toBeGreaterThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test("keyboard: Enter and Space open, focus stays in dialog, Esc and Tutup return focus", async ({ page }) => {
  await page.goto("/menu");
  const first = triggers(page).nth(0);
  await first.focus();
  await page.keyboard.press("Enter");
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  const focusInside = () => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  expect(await focusInside()).toBe(true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await focusInside(), `Tab ${i + 1} left the dialog`).toBe(true);
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusInside(), `Shift+Tab ${i + 1} left the dialog`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(first).toBeFocused();

  const second = triggers(page).nth(1);
  await second.focus();
  await page.keyboard.press("Space");
  await expect(dialogOf(page)).toBeVisible();
  await dialogOf(page).getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(dialogOf(page)).toBeHidden();
  await expect(second).toBeFocused();
});

test("mouse: overlay click closes and focus returns; card body click opens dialog", async ({ page }) => {
  await page.goto("/menu");
  const card = page.locator(".product-grid > li").nth(0);
  await card.locator(".product-card-price").click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
  await expect(triggers(page).nth(0)).toBeFocused();
});

test("title link still navigates to the product detail and does not open the dialog", async ({ page }) => {
  await page.goto("/menu");
  await page.locator(".product-grid > li").nth(0).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/menu\/[^/]+$/);
  await expect(dialogOf(page)).toHaveCount(0);
});

test("dialog semantics: role dialog, aria-modal, accessible name equals product title", async ({ page }) => {
  await page.goto("/menu");
  const dialog = await openAt(page, 0);
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAccessibleName(await dialogTitle(dialog));
});

test("axe on open dialog reports no serious or critical issues", async ({ page }) => {
  await page.goto("/menu");
  await openAt(page, 0);
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(violation => ["serious", "critical"].includes(violation.impact));
  test.info().annotations.push({ type: "axe-all", description: results.violations.map(v => `${v.id}:${v.impact}`).join(", ") || "none" });
  expect(blocking.map(violation => violation.id)).toEqual([]);
});

test("AC-7: each platform button name mentions the platform, the product and new-tab notice", async ({ page }) => {
  await page.goto("/menu");
  const dialog = await openAt(page, 0);
  const title = await dialogTitle(dialog);
  const links = await readLinks(dialog);
  for (const link of links) {
    const name = link.label ?? link.text;
    expect(name, `${link.text} accessible name`).toContain(title);
    expect(name, `${link.text} accessible name`).toContain(link.text);
    expect(name, `${link.text} accessible name`).toMatch(/tab baru/i);
  }
});

test("no horizontal scroll and touch targets at least 44px", async ({ page }) => {
  await page.goto("/menu");
  expect(await noHorizontalScroll(page)).toBe(true);
  const trigger = await triggers(page).nth(0).boundingBox();
  expect(trigger.height).toBeGreaterThanOrEqual(44);
  expect(trigger.width).toBeGreaterThanOrEqual(44);
  const dialog = await openAt(page, 0);
  expect(await noHorizontalScroll(page)).toBe(true);
  const viewport = page.viewportSize();
  const frame = await dialog.boundingBox();
  expect(frame.x).toBeGreaterThanOrEqual(0);
  expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.width);
  for (const link of await dialog.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  const close = await dialog.getByRole("button", { name: "Tutup", exact: true }).boundingBox();
  expect(close.height).toBeGreaterThanOrEqual(44);
  expect(close.width).toBeGreaterThanOrEqual(44);
});

test("body scroll is locked while the dialog is open", async ({ page }) => {
  await page.goto("/menu");
  await openAt(page, 0);
  const opened = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  test.info().annotations.push({ type: "scroll", description: `opened=${opened} afterWheel=${await page.evaluate(() => window.scrollY)}` });
  expect(await page.evaluate(() => window.scrollY)).toBe(opened);
});

test("rapid repeated clicks never open two dialogs", async ({ page }) => {
  await page.goto("/menu");
  await triggers(page).nth(0).evaluate(el => { el.click(); el.click(); });
  await expect(dialogOf(page)).toHaveCount(1);
});

test("dialog content does not overflow its box", async ({ page }) => {
  await page.goto("/menu");
  const dialog = await openAt(page, 0);
  const box = await dialog.boundingBox();
  expect(box.width).toBeLessThanOrEqual(page.viewportSize().width);
  const overflowing = await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1);
  expect(overflowing).toBe(false);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("dialog content has no running animation when reduced motion is requested", async ({ page }) => {
    await page.goto("/menu");
    const dialog = await openAt(page, 0);
    const contentAnimation = await dialog.evaluate(el => getComputedStyle(el).animationName);
    const overlayAnimation = await page.locator('[data-slot="dialog-overlay"]').evaluate(el => getComputedStyle(el).animationName);
    test.info().annotations.push({ type: "animation", description: `content=${contentAnimation} overlay=${overlayAnimation}` });
    expect(contentAnimation).toBe("none");
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("menu cards keep title, price and detail links without JS", async ({ page }) => {
    await page.goto("/menu");
    const cards = await page.locator(".product-grid > li").count();
    expect(cards).toBeGreaterThan(0);
    expect(await page.locator('.product-grid > li .product-card-title a[href^="/menu/"]').count()).toBe(cards);
  });
});

test("no raw order URL field names in the public menu HTML", async ({ request }) => {
  const html = await (await request.get("/menu")).text();
  expect(html).not.toMatch(/grabfoodUrl|gofoodUrl|shopeefoodUrl/);
});
