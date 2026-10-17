import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const errors = new WeakMap(), origin = "http://127.0.0.1:3033";
test.beforeEach(async ({ page }) => {
  const current = []; errors.set(page, current); page.on("pageerror", error => current.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const login = async (page, role) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email akun internal", { exact: true }).fill(process.env[role === "owner" ? "QA_AUTH_OWNER_EMAIL" : "QA_AUTH_STAFF_EMAIL"]);
  await page.getByLabel("Password", { exact: true }).fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/);
};
const fill = async (page, title) => {
  await page.getByLabel("Judul * (wajib)", { exact: true }).fill(title);
  await page.getByLabel("Isi * (wajib)", { exact: true }).fill("QA isi halaman yang langsung disimpan.");
};
const save = async page => {
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Perubahan tersimpan dan sudah tampil di website.");
};
test("anonymous editor and current-page API require login", async ({ page }) => {
  await page.goto("/admin/pages/about"); await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get("/api/cms/pages/by-key/about")).status()).toBe(401);
  expect((await page.request.put("/api/cms/pages/by-key/about", { headers: { origin }, data: {} })).status()).toBe(401);
});
test("Staff opens one editor from the table, sees required fields, saves and edits the live page again", async ({ page }, info) => {
  await login(page, "staff"); await page.goto("/admin/pages");
  await expect(page.getByRole("columnheader", { name: "Nama halaman" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Terakhir diubah (WIB)" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(9);
  await expect(page.getByRole("link", { name: "Publikasi terjadwal", exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("pages-table.png"), fullPage: true });
  await page.getByRole("link", { name: "Edit halaman Tentang", exact: true }).click(); await expect(page).toHaveURL(origin + "/admin/pages/about");
  await page.getByLabel("Judul * (wajib)", { exact: true }).fill("");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Lengkapi isian wajib"); await expect(page.locator("#page-title")).toBeFocused();
  await fill(page, "QA Staff simpan langsung");
  await expect(page.getByRole("button", { name: /draft|review|setujui|terbitkan/i })).toHaveCount(0);
  await save(page);
  const first = await (await page.request.get("/api/cms/pages/by-key/about")).json();
  expect(first.isLive).toBe(true); expect(first.translations.map(row => row.locale)).toEqual(["id"]);
  expect(await (await page.request.get("/id/about")).text()).toContain("QA Staff simpan langsung");
  await fill(page, "QA Staff perubahan kedua"); await save(page); await expect(page).toHaveURL(origin + "/admin/pages/about");
  expect(await (await page.request.get("/id/about")).text()).toContain("QA Staff perubahan kedua");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: info.outputPath("direct-page-editor.png"), fullPage: true });
  await page.goto("/admin/pages/about/" + first.id); await expect(page).toHaveURL(origin + "/admin/pages/about");
  await page.goto("/admin/pages"); await expect(page.locator("tbody tr").filter({ hasText: "Tentang" }).locator("time")).toBeVisible();
});
test("Owner uses the same single Save and preview has no approval controls", async ({ page }) => {
  await login(page, "owner"); await page.goto("/admin/pages/about"); await fill(page, "QA Owner simpan langsung");
  await page.getByRole("button", { name: "Pratinjau konten", exact: true }).click();
  await expect(page.locator(".cms-page-preview")).toContainText("QA Owner simpan langsung");
  await expect(page.getByRole("button", { name: "Simpan", exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Jadwal publikasi (opsional, WIB)")).toHaveCount(0);
  await save(page); await page.goto("/id/about"); await expect(page.locator("h1")).toHaveText("QA Owner simpan langsung");
});
test("a stale editor preserves input and cannot overwrite a newer save; CSRF and forged fields fail", async ({ page, browser }) => {
  await login(page, "owner"); await page.goto("/admin/pages/about");
  const other = await browser.newPage();
  try {
    await login(other, "staff"); await other.goto("/admin/pages/about");
    await fill(other, "QA perubahan yang dipertahankan"); await fill(page, "QA pemenang"); await save(page);
    await other.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(other.getByRole("status")).toContainText("Halaman sudah diubah pengguna lain");
    await expect(other.locator("#page-title")).toHaveValue("QA perubahan yang dipertahankan");
    expect(await (await page.request.get("/id/about")).text()).toContain("QA pemenang");
  } finally { await other.close(); }
  const current = await (await page.request.get("/api/cms/pages/by-key/about")).json();
  const data = { pageKey: "about", expectedRevisionId: current.id, expectedVersion: current.version,
    fields: current.translations[0].fields, mediaOperations: [] };
  expect((await page.request.put("/api/cms/pages/by-key/about", { headers: { origin: "https://foreign.invalid" }, data })).status()).toBe(403);
  expect((await page.request.put("/api/cms/pages/by-key/about", { headers: { origin }, data: { ...data, role: "owner" } })).status()).toBe(400);
});
