import { test, expect, publicPaths } from "./fixtures";

const labels = { main: "Navigasi utama", menu: "Menu", promo: "Promo & event", footer: "Halaman lainnya", guides: "Panduan makanan", breadcrumb: "Jejak halaman" };

test("homepage CTA, product detail and breadcrumb", async ({ page }) => {
  await page.goto("/");
  await page.locator(".hero-actions").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/menu$/);
  await page.locator(".menu-card").first().getByRole("link").click();
  await expect(page).toHaveURL(/\/menu\/sample-01$/);
  await expect(page.locator(".notice-box")).toContainText("bukan produk resmi");
  await expect(page.locator(".info-list")).toContainText("Belum tersedia");
  await expect(page.locator(".ordering-section .platform-card")).toHaveCount(2);
  await expect(page.locator(".ordering-section a, .ordering-section button")).toHaveCount(0);
  await expect(page.locator(".ordering-section")).toContainText("Tautan belum tersedia");
  await page.getByRole("navigation", { name: labels.breadcrumb }).getByRole("link", { name: labels.menu, exact: true }).click();
  await expect(page).toHaveURL(/\/menu$/);
});

test("navbar promo, guide footer and ordering anchor", async ({ page }) => {
  await page.goto("/");
  const navbar = page.getByRole("navigation", { name: labels.main });
  await expect(navbar.getByRole("link")).toHaveCount(4);
  await navbar.getByRole("link", { name: labels.promo, exact: true }).click();
  await expect(page).toHaveURL(/\/promos$/);
  await expect(page.locator(".empty-state")).toBeVisible();
  await page.getByRole("navigation", { name: labels.footer }).getByRole("link", { name: labels.guides, exact: true }).click();
  await expect(page).toHaveURL(/\/guides$/);
  await page.locator(".menu-card").first().getByRole("link").click();
  await expect(page).toHaveURL(/\/guides\/takoyaki$/);
  await page.getByRole("navigation", { name: labels.breadcrumb }).getByRole("link", { name: labels.guides, exact: true }).click();
  await expect(page).toHaveURL(/\/guides$/);
  await page.getByRole("navigation", { name: labels.main }).getByRole("link").last().click();
  await expect(page).toHaveURL("http://127.0.0.1:3030/#ordering");
  await expect(page.locator("#ordering")).toBeInViewport();
});

for (const path of publicPaths) {
  test("no language selector, no language segment in links, html lang=id: " + (path || "homepage"), async ({ page }) => {
    await page.goto(path || "/");
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    await expect(page.getByRole("navigation", { name: "Pilih bahasa" })).toHaveCount(0);
    await expect(page.locator('link[hreflang], link[rel="alternate"]')).toHaveCount(0);
    const hrefs = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));
    for (const href of hrefs) expect(href, href).not.toMatch(/^\/(id|en)(\/|#|$)/);
  });
}

for (const path of ["/en", "/en/menu", "/en/menu/sample-01", "/en/about", "/en/guides/takoyaki", "/fr", "/fr/menu"]) {
  test("former English and unknown language addresses return 404 without redirect: " + path, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(response.headers().location).toBeUndefined();
  });
}

for (const path of publicPaths) {
  test("former /id address redirects permanently without a chain: " + (path || "homepage"), async ({ request }) => {
    const response = await request.get("/id" + path + "?utm=x", { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe((path || "/") + "?utm=x");
    expect((await request.get(path || "/", { maxRedirects: 0 })).status()).toBe(200);
  });
}

test("/id/ and /en/ with trailing slash end on the homepage / a 404, and other routes are untouched", async ({ request }) => {
  const legacy = await request.get("/id/");
  expect(legacy.url()).toBe("http://127.0.0.1:3030/");
  expect(legacy.status()).toBe(200);
  expect((await request.get("/en/")).status()).toBe(404);
  for (const path of ["/idle", "/identity", "/admin/login"]) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).not.toBe(308);
  }
});
