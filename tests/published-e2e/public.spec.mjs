import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

const runtimeErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = []; runtimeErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.text().includes("Content Security Policy")) errors.push(message.text()); }); // AC-21
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(runtimeErrors.get(page)).toEqual([]));
{
  test(`empty database shows no examples and returns detail 404`, async ({ page, request }) => {
    expect(process.env.QA_PUBLIC_EMPTY).toBe("1");
    await page.goto("/menu");
    await expect(page.locator("main")).toContainText("Menu belum diterbitkan.");
    await expect(page.locator(".preview-banner")).toHaveCount(0);
    expect(await page.locator("main").textContent()).not.toMatch(/QA Product|sample-01/);
    expect((await request.get(`/menu/${process.env.QA_PUBLIC_SLUG}`)).status()).toBe(404);
    expect((await request.get(`/guides/takoyaki`)).status()).toBe(404);
  });
  for (const key of ["home", "about", "menu", "guides", "promos", "location", "guide-takoyaki", "guide-okonomiyaki", "guide-burger"]) {
    const suffix = key === "home" ? "" : key.startsWith("guide-") ? "/guides/" + key.slice(6) : "/" + key;
    test(`published ${key} SSR, accessibility and mobile layout`, async ({ page, request }) => {
      const response = await request.get(suffix || "/");
      expect(response.status()).toBe(200);
      expect(await response.text()).toContain(`QA ${key}`);
      await page.goto(suffix || "/");
      await expect(page.locator("h1")).toHaveText(`QA ${key}`);
      await expect(page).toHaveTitle(`QA ${key}`);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator(".preview-banner")).toHaveCount(0);
      await expect(page.locator("main script")).toHaveCount(0);
      await expect(page.locator("main")).toContainText(`<script>literal only</script>`);
      if (key === "home") {
        const hero = page.locator(".home-art-image"); await expect(hero).toBeVisible();
        await expect.poll(() => hero.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
        await expect(page.locator(".home-art figcaption")).toHaveText("Takoyaki Shio Negi · Tiny Osaka");
        await expect(page.locator('.home-theme [data-slot="button"]').first()).toHaveAttribute("href", "/menu");
        const icon = await request.get("/icon.png"); expect(icon.status()).toBe(200); expect(icon.headers()["content-type"]).toContain("image/png");
        await expect(hero).toHaveAttribute("src", "/images/02a - Takoyaki Shio Negi.jpeg");
        expect(await hero.evaluate(img => [img.naturalWidth, img.naturalHeight])).toEqual([1600, 1200]);
        const photo = await request.get("/images/02a%20-%20Takoyaki%20Shio%20Negi.jpeg");
        expect(photo.status()).toBe(200); expect(photo.headers()["content-type"]).toContain("image/jpeg");
        expect(Buffer.compare(await photo.body(), await readFile("public/images/02a - Takoyaki Shio Negi.jpeg"))).toBe(0);
        const dimensions = await hero.boundingBox();
        expect(dimensions.width / dimensions.height).toBeCloseTo(4 / 3, 2);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
  test(`published product shows single price without modifier UI`, async ({ page }) => {
    await page.goto(`/menu/${process.env.QA_PUBLIC_SLUG}`);
    await expect(page.locator("h1")).toHaveText(`QA Product`);
    await expect(page.locator("main")).toContainText(/Rp\s?250\.000/);
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "QA gambar" })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test(`unknown product and guide stay unpublished`, async ({ request }) => {
    expect((await request.get(`/menu/sample-01`)).status()).toBe(404);
    expect((await request.get(`/guides/unknown`)).status()).toBe(404);
    expect((await request.get("/fr/menu")).status()).toBe(404);
    expect((await request.get("/en/menu", { maxRedirects: 0 })).status()).toBe(404);
  });
  test(`YouTube only loads after consent`, async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByRole("button", { name: "Muat video YouTube" }).click();
    await expect(page.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/Abc_123-xyz");
  });
}
