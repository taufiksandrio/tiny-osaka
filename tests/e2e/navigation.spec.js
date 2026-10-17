import { test, expect, locales, publicPaths } from "./fixtures";

for (const locale of locales) {
  const labels = locale === "id"
    ? { main: "Navigasi utama", menu: "Menu", promo: "Promo & event", footer: "Halaman lainnya", guides: "Panduan makanan", language: "Pilih bahasa", breadcrumb: "Jejak halaman" }
    : { main: "Main navigation", menu: "Menu", promo: "Promos & events", footer: "More pages", guides: "Food guides", language: "Choose language", breadcrumb: "Breadcrumb" };

  test(`${locale}: homepage CTA, product detail and breadcrumb`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await page.locator(".hero-actions").getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/menu$`));
    await page.locator(".menu-card").first().getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/menu/sample-01$`));
    await expect(page.locator(".notice-box")).toContainText(locale === "id" ? "bukan produk resmi" : "not an official product");
    await expect(page.locator(".info-list")).toContainText(locale === "id" ? "Belum tersedia" : "Not yet available");
    await expect(page.locator(".ordering-section .platform-card")).toHaveCount(2);
    await expect(page.locator(".ordering-section a, .ordering-section button")).toHaveCount(0);
    await expect(page.locator(".ordering-section")).toContainText(locale === "id" ? "Tautan belum tersedia" : "Link not yet available");
    await page.getByRole("navigation", { name: labels.breadcrumb }).getByRole("link", { name: labels.menu, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/menu$`));
  });

  test(`${locale}: navbar promo, guide footer and ordering anchor`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const navbar = page.getByRole("navigation", { name: labels.main });
    await expect(navbar.getByRole("link")).toHaveCount(4);
    await navbar.getByRole("link", { name: labels.promo, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/promos$`));
    await expect(page.locator(".empty-state")).toBeVisible();
    await page.getByRole("navigation", { name: labels.footer }).getByRole("link", { name: labels.guides, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/guides$`));
    await page.locator(".menu-card").first().getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/guides/takoyaki$`));
    await page.getByRole("navigation", { name: labels.breadcrumb }).getByRole("link", { name: labels.guides, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/guides$`));
    await page.getByRole("navigation", { name: labels.main }).getByRole("link").last().click();
    await expect(page).toHaveURL(new RegExp(`/${locale}#ordering$`));
    await expect(page.locator("#ordering")).toBeInViewport();
  });
}

for (const path of publicPaths) {
  test('former English address redirects to Indonesian: ' + (path || 'homepage'), async ({ page }) => {
    await page.goto('/en' + path);
    await expect(page).toHaveURL('http://127.0.0.1:3030/id' + path);
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(page.getByRole('navigation', { name: 'Pilih bahasa' })).toHaveCount(0);
  });
}
