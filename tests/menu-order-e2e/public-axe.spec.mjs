import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Read-only QA of the published public pages against the running server (QA_MENU_BASE_URL, default dev data).
// Covers AC-2/AC-3/AC-9 style checks that the menu-order spec does not: axe on every public route, one open
// order dialog, no horizontal scroll, and no order trigger on the product detail page (AC-20).
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
const pagesToScan = ["/", "/menu", "/about", "/promos", "/location", "/guides", "/guides/takoyaki"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ context }) => {
  await context.route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    return LOCAL_HOSTS.includes(host) ? route.continue() : route.abort();
  });
});

const seriousOf = results => results.violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => `${v.id}:${v.impact}`);

for (const path of pagesToScan) {
  test(`axe ${path}: no serious or critical violation`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    test.info().annotations.push({ type: "axe-all", description: results.violations.map(v => `${v.id}:${v.impact}`).join(", ") || "none" });
    expect(seriousOf(results)).toEqual([]);
  });
}

test("axe /menu with an order dialog open: no serious or critical violation", async ({ page }) => {
  await page.goto("/menu");
  await page.getByRole("button", { name: "Pesan", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(TAGS).analyze();
  test.info().annotations.push({ type: "axe-dialog", description: results.violations.map(v => `${v.id}:${v.impact}`).join(", ") || "none" });
  expect(seriousOf(results)).toEqual([]);
});

for (const width of [320, 390, 768, 1280]) {
  test(`no horizontal scroll at ${width}px on /menu and a detail page`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/menu", "/menu/all-berry-bomb"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), path).toBe(true);
    }
  });
}

test("product detail has no order trigger inside main (AC-20)", async ({ page }) => {
  await page.goto("/menu/all-berry-bomb");
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator('main [aria-haspopup="dialog"]')).toHaveCount(0);
  await expect(page.locator('main button:has-text("Pesan"), main a:has-text("Pesan")')).toHaveCount(0);
});

test("header Pesan CTA is a plain link to /menu, not a dialog trigger", async ({ page }) => {
  await page.goto("/about");
  const cta = page.locator("header").getByRole("link", { name: "Pesan", exact: true });
  await expect(cta).toHaveAttribute("href", "/menu");
  await expect(page.locator('header [aria-haspopup="dialog"]')).toHaveCount(0);
});
