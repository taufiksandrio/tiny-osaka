import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const runtimeErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = []; runtimeErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(runtimeErrors.get(page)).toEqual([]));
for (const locale of ["id", "en"]) {
  test(`${locale} empty database shows no examples and returns detail 404`, async ({ page, request }) => {
    expect(process.env.QA_PUBLIC_EMPTY).toBe("1");
    await page.goto(`/${locale}/menu`);
    await expect(page.locator("main")).toContainText(locale === "id" ? "Menu belum diterbitkan." : "The menu has not been published yet.");
    await expect(page.locator(".preview-banner")).toHaveCount(0);
    expect(await page.locator("main").textContent()).not.toMatch(/QA Product|sample-01/);
    expect((await request.get(`/${locale}/menu/${process.env.QA_PUBLIC_SLUG}`)).status()).toBe(404);
    expect((await request.get(`/${locale}/guides/takoyaki`)).status()).toBe(404);
  });
  for (const key of ["home", "about", "menu", "guides", "promos", "location", "guide-takoyaki", "guide-okonomiyaki", "guide-burger"]) {
    const suffix = key === "home" ? "" : key.startsWith("guide-") ? "/guides/" + key.slice(6) : "/" + key;
    test(`${locale} published ${key} SSR, accessibility and mobile layout`, async ({ page, request }) => {
      const response = await request.get(`/${locale}${suffix}`);
      expect(response.status()).toBe(200);
      expect(await response.text()).toContain(`QA ${key} ${locale}`);
      await page.goto(`/${locale}${suffix}`);
      await expect(page.locator("h1")).toHaveText(`QA ${key} ${locale}`);
      await expect(page).toHaveTitle(`QA ${key} ${locale}`);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator(".preview-banner")).toHaveCount(0);
      await expect(page.locator("main script")).toHaveCount(0);
      await expect(page.locator("main")).toContainText(`<script>literal only</script>`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
  test(`${locale} published product prices and modifier requirements`, async ({ page }) => {
    await page.goto(`/${locale}/menu/${process.env.QA_PUBLIC_SLUG}`);
    await expect(page.locator("h1")).toHaveText(`QA Product ${locale}`);
    await expect(page.getByRole("status")).toContainText(locale === "id" ? "Lengkapi" : "Complete");
    await page.getByRole("checkbox").check();
    await expect(page.getByRole("status")).toContainText(locale === "id" ? "400.000" : "400,000");
    await page.getByRole("checkbox").uncheck();
    await expect(page.getByRole("status")).toContainText(locale === "id" ? "Lengkapi" : "Complete");
    await expect(page.getByRole("img", { name: locale === "id" ? "QA gambar" : "QA image" })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test(`${locale} unknown product and guide stay unpublished`, async ({ request }) => {
    expect((await request.get(`/${locale}/menu/sample-01`)).status()).toBe(404);
    expect((await request.get(`/${locale}/guides/unknown`)).status()).toBe(404);
    expect((await request.get("/fr/menu")).status()).toBe(404);
  });
  test(`${locale} YouTube only loads after consent`, async ({ page }) => {
    await page.goto(`/${locale}/about`);
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByRole("button", { name: locale === "id" ? "Muat video YouTube" : "Load YouTube video" }).click();
    await expect(page.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/Abc_123-xyz");
  });
}
