import AxeBuilder from "@axe-core/playwright";
import { test, expect, publicPaths } from "./fixtures";

{
  for (const path of publicPaths) {
    test(`${path || "/"}: accessible structure and responsive layout`, async ({ page }, testInfo) => {
      await page.goto(path || "/");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const duplicateIds = await page.locator("[id]").evaluateAll((nodes) => {
        const ids = nodes.map((node) => node.id);
        return ids.filter((id, index) => ids.indexOf(id) !== index);
      });
      expect(duplicateIds).toEqual([]);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      if (results.violations.length || results.incomplete.length) {
        await testInfo.attach("axe-results", { body: JSON.stringify({ violations: results.violations, incomplete: results.incomplete }, null, 2), contentType: "application/json" });
      }
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }

  for (const path of ["", "/menu/sample-01", "/guides/takoyaki"]) {
    test(`${path || "/"}: keyboard skip link and navbar promo`, async ({ page }) => {
      await page.goto(path || "/");
      const skip = page.getByRole("link", { name: "Langsung ke konten", exact: true });
      await page.keyboard.press("Tab");
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      await expect(skip).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("Enter");
      await expect(page.locator("main")).toBeFocused();

      // Reload resets natural tab order; verify a real keyboard journey to promos.
      await page.goto(path || "/");
      const promo = page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Promo & event", exact: true });
      if (!(await promo.isVisible())) {
        // Below 768 px the same links live in the Sheet opened by "Buka menu" (keyboard: focus the button, Enter).
        const openMenu = page.getByRole("button", { name: "Buka menu", exact: true });
        for (let index = 0; index < 12 && !(await openMenu.evaluate((el) => el === document.activeElement)); index += 1) await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
        const sheetPromo = page.getByRole("navigation", { name: "Navigasi seluler" }).getByRole("link", { name: "Promo & event", exact: true });
        for (let index = 0; index < 12 && !(await sheetPromo.evaluate((el) => el === document.activeElement)); index += 1) await page.keyboard.press("Tab");
        await expect(sheetPromo).toBeFocused();
        await expect(sheetPromo).toHaveCSS("outline-style", "solid");
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/promos$/);
        return;
      }
      // Desktop: the inline nav is in the tab order; reach it with Tab (bounded, no fixed count).
      for (let index = 0; index < 12 && !(await promo.evaluate((el) => el === document.activeElement)); index += 1) await page.keyboard.press("Tab");
      await expect(promo).toBeFocused();
      await expect(promo).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/promos$/);
    });
  }
}
