import { test, expect } from "./fixtures";

// Default e2e env has no GA4_MEASUREMENT_ID / production indexing: analytics must be fully inert (AC-1, AC-6).
test("/privasi renders Indonesian policy with owner placeholders", async ({ page }) => {
  await page.goto("/privasi");
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.getByRole("heading", { level: 1, name: "Kebijakan privasi" })).toBeVisible();
  await expect(page.getByText("[ISI OLEH PEMILIK:", { exact: false }).first()).toBeVisible();
});

test("analytics inert when disabled: no banner, no settings button, no gtag script", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Pengukuran kunjungan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pengaturan privasi" })).toHaveCount(0);
  await expect(page.locator("script[src*='googletagmanager']")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kebijakan privasi" })).toHaveAttribute("href", "/privasi");
});
