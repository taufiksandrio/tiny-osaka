import { test, expect, locales, publicPaths } from "./fixtures";

for (const locale of locales) {
  for (const path of publicPaths) {
    test(`${locale}${path || "/"}: server content and localized metadata`, async ({ page, request }) => {
      const url = `/${locale}${path}`;
      const response = await request.get(url);
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toMatch(/<h1\b/);
      expect(html).toContain('name="robots" content="noindex, nofollow"');
      expect(html).not.toContain('type="application/ld+json"');

      await page.goto(url);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page).toHaveTitle(locale === "id"
        ? /Pratinjau beranda|Temukan ruang|Slot menu|Sedikit tentang|Kenali,|Panduan|Ruang untuk|Bandung, lewat/
        : /Homepage preview|Make room|Menu slot|Meet Tiny Osaka|Get to know|Guide to|A place for|Bandung, through/);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", locale === "id"
        ? /Pratinjau|Contoh|di Bandung|Ruang untuk panduan|Template editorial|Halaman pratinjau/
        : /An English preview|A preview|The first|The second|The third|in Bandung|A space|An editorial|A page preview/);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".preview-banner")).toContainText(locale === "id" ? "PRATINJAU" : "PREVIEW");

      const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
      for (const href of new Set(links)) {
        const target = new URL(href);
        expect(target.origin, href).toBe("http://127.0.0.1:3030");
        const destination = await request.get(target.pathname);
        expect(destination.status(), href).toBe(200);
        if (target.hash) {
          expect(await destination.text(), href).toContain(`id="${target.hash.slice(1)}"`);
        }
      }
    });
  }

  test(`${locale}: every page has a distinct localized title`, async ({ request }) => {
    const titles = [];
    for (const path of publicPaths) {
      const response = await request.get(`/${locale}${path}`);
      const title = (await response.text()).match(/<title>(.*?)<\/title>/)?.[1];
      expect(title).toBeTruthy();
      titles.push(title);
    }
    expect(new Set(titles).size).toBe(publicPaths.length);
  });
}

test("root redirects temporarily to Indonesian", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/id");
});

test("unknown locales, pages and fixture slugs return 404", async ({ request }) => {
  for (const path of ["/fr", "/fr/menu", "/fr/menu/sample-01", "/id/missing", "/id/menu/missing", "/en/menu/missing", "/id/guides/missing", "/en/guides/missing"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(await response.text(), path).toMatch(/name="robots" content="noindex/);
  }
});
