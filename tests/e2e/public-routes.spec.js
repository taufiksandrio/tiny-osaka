import { test, expect, publicPaths } from "./fixtures";

{
  for (const path of publicPaths) {
    test(`${path || "/"}: server content and localized metadata`, async ({ page, request }) => {
      const url = path || "/";
      const response = await request.get(url);
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain(`lang="id"`);
      expect(html).toMatch(/<h1\b/);
      expect(html).toContain('name="robots" content="noindex, nofollow"');
      expect(html).not.toContain('type="application/ld+json"');

      await page.goto(url);
      await expect(page.locator("html")).toHaveAttribute("lang", "id");
      await expect(page).toHaveTitle(/Pratinjau beranda|Temukan ruang|Slot menu|Sedikit tentang|Kenali,|Panduan|Ruang untuk|Bandung, lewat/);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Pratinjau|Contoh|di Bandung|Ruang untuk panduan|Template editorial|Halaman pratinjau/);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".preview-banner")).toContainText("PRATINJAU");

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

  test(`every page has a distinct localized title`, async ({ request }) => {
    const titles = [];
    for (const path of publicPaths) {
      const response = await request.get(path || "/");
      const title = (await response.text()).match(/<title>(.*?)<\/title>/)?.[1];
      expect(title).toBeTruthy();
      titles.push(title);
    }
    expect(new Set(titles).size).toBe(publicPaths.length);
  });
}

test("root is served directly without redirect", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
});

test("unknown language prefixes, pages and fixture slugs return 404", async ({ request }) => {
  for (const path of ["/fr", "/fr/menu", "/fr/menu/sample-01", "/missing", "/menu/missing", "/en/menu/missing", "/guides/missing", "/en/guides/missing"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(await response.text(), path).toMatch(/name="robots" content="noindex/);
  }
});
