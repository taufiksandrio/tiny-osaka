import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fields } from "../fixtures/page-content.mjs";
import { homeDraft } from "../../src/features/public-site/home-draft.mjs";
const origin = "http://127.0.0.1:3033";
const login = async (page, role) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email akun internal", { exact: true }).fill(process.env[role === "owner" ? "QA_AUTH_OWNER_EMAIL" : "QA_AUTH_STAFF_EMAIL"]);
  await page.getByLabel("Password", { exact: true }).fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15000 });
};
const write = async (page, path, data, method = "post") => {
  const response = await page.request[method]("/api/cms/pages" + path, { headers: { origin }, data });
  expect(response.ok(), await response.text()).toBe(true); return response.json();
};
const complete = async page => {
  let row = await write(page, "", { pageKey: "about" });
  for (const locale of ["id", "en"]) row = await write(page, `/${row.id}`, { revisionId: row.id, expectedVersion: row.version, locale, fields: fields() }, "patch");
  return row;
};
const token = row => ({ revisionId: row.id, expectedVersion: row.version, expectedHash: row.contentHash });
const act = async (page, title) => { await page.getByRole("button", { name: title, exact: true }).click(); await page.getByRole("button", { name: "Konfirmasi", exact: true }).click(); };
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const current = []; errors.set(page, current); page.on("pageerror", error => current.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test("anonymous CMS redirects and API fails closed", async ({ page }, testInfo) => {
  await page.goto("/admin/pages"); await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get("/api/cms/pages")).status()).toBe(401);
  expect((await page.request.post("/api/cms/pages", { headers: { origin }, data: { pageKey: "about" } })).status()).toBe(401);
  await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
});
test("shadcn dashboard navigation, account menu and mobile focus are accessible", async ({ page }, testInfo) => {
  await login(page, "staff");
  await expect(page.locator("main")).toContainText("Template halaman");
  await expect(page.locator('main [data-slot="card"]').first()).toContainText("9");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
  await page.getByRole("button", { name: "Menu akun" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Menu akun" })).toBeFocused();
  if (testInfo.project.name !== "desktop") {
    const trigger = page.getByRole("button", { name: "Buka navigasi" });
    await trigger.click(); const dialog = page.getByRole("dialog", { name: "Tiny Osaka CMS" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Keamanan", exact: true })).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
    await trigger.click(); await dialog.getByRole("link", { name: "Halaman website", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  } else {
    await page.getByRole("navigation", { name: "Navigasi CMS" }).getByRole("link", { name: "Halaman website", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/admin\/pages$/);
  await expect(page.locator("aside").getByRole("link", { name: "Halaman website", exact: true, includeHidden: true })).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("pages.png"), fullPage: true });
});
test("Staff edits draft with safe preview, accessible fields and incomplete-review validation", async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await login(page, "staff"); await page.getByRole("link", { name: "Kelola halaman website" }).click();
  await page.getByRole("link", { name: "about", exact: true }).click();
  await page.getByRole("button", { name: "Buat draft baru" }).click();
  await expect(page.getByRole("heading", { name: "Editor halaman about" })).toBeVisible();
  await expect(page.getByLabel("Judul", { exact: true })).toHaveJSProperty("tagName", "INPUT");
  await expect(page.getByLabel("Ringkasan", { exact: true })).toHaveJSProperty("tagName", "TEXTAREA");
  await expect(page.getByRole("heading", { name: "Metadata SEO", exact: true })).toBeVisible();
  await page.getByLabel("Judul", { exact: true }).fill("QA editor title");
  await page.getByLabel("Bahasa konten", { exact: true }).selectOption("en");
  await page.getByLabel("Judul", { exact: true }).fill("QA English unsaved title");
  await page.getByLabel("Bahasa konten", { exact: true }).selectOption("id");
  await expect(page.getByLabel("Judul", { exact: true })).toHaveValue("QA editor title");
  const body = page.getByRole("group", { name: "Isi", exact: true });
  await body.getByRole("button", { name: "Tambah paragraf" }).click();
  await body.getByLabel("Teks", { exact: true }).fill("<script>literal preview</script>");
  await body.getByLabel("Tebal", { exact: true }).check();
  await body.getByLabel("Tautan internal").selectOption("/id/menu");
  await body.getByRole("button", { name: "Tambah daftar", exact: true }).click();
  const list = body.getByRole("group", { name: "Blok 2", exact: true });
  await list.getByLabel("Daftar bernomor", { exact: true }).check();
  await list.getByLabel("Teks", { exact: true }).fill("QA ordered item");
  await list.getByRole("button", { name: "Tambah item", exact: true }).click();
  await list.getByLabel("Teks", { exact: true }).nth(1).fill("QA second item");
  await list.getByRole("button", { name: "Hapus item 2", exact: true }).click();
  await list.getByRole("button", { name: "Naikkan blok 2", exact: true }).click();
  const spacing = await page.locator(".cms-editor").evaluate(editor => {
    const fields = [...editor.querySelectorAll(".cms-form-field > label")].map(label => {
      const control = label.control;
      return control.getBoundingClientRect().top - label.getBoundingClientRect().bottom;
    });
    const pairs = [...editor.querySelectorAll(".cms-button-row")].flatMap(row => {
      const buttons = [...row.querySelectorAll(":scope > button")];
      return buttons.slice(1).map((button, index) => {
        const previous = buttons[index].getBoundingClientRect(), current = button.getBoundingClientRect();
        return Math.abs(current.top - previous.top) < 1 ? current.left - previous.right : current.top - previous.bottom;
      });
    });
    return { fields, pairs };
  });
  expect(spacing.fields.length).toBeGreaterThan(0);
  expect(spacing.pairs.length).toBeGreaterThan(0);
  expect(spacing.fields.every(gap => gap >= 11.5)).toBe(true);
  expect(spacing.pairs.every(gap => gap >= 11.5)).toBe(true);
  await body.getByRole("group", { name: "Blok 1", exact: true }).screenshot({ path: testInfo.outputPath("list-spacing.png") });
  await expect(page.getByRole("button", { name: "Kirim untuk review" })).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("editor.png"), fullPage: true });
  await page.getByRole("button", { name: "Simpan draft Indonesia" }).click();
  await expect(page.getByRole("status")).toContainText("tersimpan");
  await expect(page.getByRole("button", { name: "Kirim untuk review" })).toBeDisabled();
  await page.getByLabel("Bahasa konten", { exact: true }).selectOption("en");
  await expect(page.getByLabel("Judul", { exact: true })).toHaveValue("QA English unsaved title");
  await page.getByRole("button", { name: "Simpan draft Inggris", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("tersimpan");
  await page.getByLabel("Bahasa konten", { exact: true }).selectOption("id");
  await page.getByRole("button", { name: "Pratinjau konten", exact: true }).click();
  await expect(page.getByRole("link", { name: "<script>literal preview</script>" })).toHaveAttribute("href", "/id/menu");
  expect(await page.locator(".cms-page-preview script").count()).toBe(0);
  await expect(page.locator(".cms-page-preview ol li")).toHaveText(["QA ordered item"]);
  await expect(page.locator(".cms-page-preview strong")).toHaveText("<script>literal preview</script>");
  await expect(page.getByRole("heading", { name: "Metadata SEO", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kirim untuk review" }).click();
  const dialog = page.getByRole("alertdialog"); await expect(dialog).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Kirim untuk review" })).toBeFocused();
  await act(page, "Kirim untuk review"); await expect(page.getByRole("status")).toContainText("Lengkapi");
  await expect(page.getByRole("alertdialog", { includeHidden: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const home = await write(page, "", { pageKey: "home" });
  await page.goto(`/admin/pages/home/${home.id}`);
  await page.getByRole("button", { name: "Pratinjau konten", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Judul belum diisi", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Kembali ke editor", exact: true }).click();
  await page.getByLabel("Judul", { exact: true }).fill("QA owner title preserved");
  await page.getByRole("button", { name: "Muat draf konten home", exact: true }).click();
  await expect(page.getByLabel("Judul", { exact: true })).toHaveValue("QA owner title preserved");
  await page.getByLabel("Bahasa konten", { exact: true }).selectOption("en");
  await expect(page.getByLabel("Judul", { exact: true })).toHaveValue(homeDraft.en.title);
  await page.getByRole("button", { name: "Simpan draft Inggris", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("tersimpan");
  await expect(page.getByRole("button", { name: "Kirim untuk review", exact: true })).toBeDisabled();
  await page.getByLabel("Bahasa konten", { exact: true }).selectOption("id");
  await page.getByRole("button", { name: "Simpan draft Indonesia", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("tersimpan");
  await page.getByRole("button", { name: "Pratinjau konten", exact: true }).click();
  const art = page.locator(".home-art-image");
  await expect(art).toBeVisible(); await expect.poll(() => art.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator(".home-art figcaption")).toHaveText("Takoyaki Shio Negi · Tiny Osaka");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("home-preview.png"), fullPage: true });
  await page.getByLabel("Bahasa konten", { exact: true }).selectOption("en");
  await expect(page.locator(".home-headline")).toHaveText(homeDraft.en.title);
  await page.screenshot({ path: testInfo.outputPath("home-preview-en.png"), fullPage: true });
  const publicHome = await page.request.get("/id"); expect(await publicHome.text()).not.toContain("QA owner title preserved");
});
test("Staff submits, Owner approves/publishes, clone keeps live content and approval separate", async ({ page, browser }, testInfo) => {
  await login(page, "staff"); const row = await complete(page);
  await page.goto("/admin/pages/about");
  const revisionLink = page.getByRole("link", { name: `Buka revisi ${row.id}`, exact: true });
  await expect(revisionLink).toBeVisible();
  const listing = page.locator("main");
  await expect(listing).toContainText("WIB");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("revisions.png"), fullPage: true });
  await revisionLink.click();
  await act(page, "Kirim untuk review"); await expect(page.locator("main")).toContainText("review");
  await expect(page.getByRole("button", { name: "Setujui revisi" })).toHaveCount(0);
  const context = await browser.newContext(); const owner = await context.newPage();
  try {
    await login(owner, "owner"); await owner.goto(`/admin/pages/about/${row.id}`);
    await act(owner, "Setujui revisi"); await expect(owner.locator("main")).toContainText("Disetujui");
    await act(owner, "Terbitkan revisi"); await expect(owner.locator("main")).toContainText("Sedang tampil di publik");
    for (const locale of ["id", "en"]) { await owner.goto(`/${locale}/about`); await expect(owner.getByRole("heading", { level: 1 })).toHaveText(fields().title); }
    await act(page, "Buat draft dari revisi ini"); await expect(page).not.toHaveURL(new RegExp(row.id));
    await page.getByLabel("Judul", { exact: true }).fill("QA unpublished replacement");
    await page.getByRole("button", { name: "Simpan draft Indonesia" }).click(); await expect(page.getByRole("status")).toContainText("tersimpan");
    await owner.goto("/id/about"); await expect(owner.getByRole("heading", { level: 1 })).toHaveText(fields().title);
  } finally { await context.close(); }
});
test("forged Staff actions, foreign origins and invalid fields are denied through HTTP", async ({ page }) => {
  await login(page, "staff"); let row = await complete(page);
  row = await write(page, `/${row.id}/actions`, { action: "submit", revisionId: row.id, expectedVersion: row.version });
  for (const action of ["approve", "reject", "publish", "archive"]) {
    const response = await page.request.post(`/api/cms/pages/${row.id}/actions`, { headers: { origin }, data: { action, ...token(row) } });
    expect(response.status()).toBe(403);
  }
  expect((await page.request.post("/api/cms/pages", { headers: { origin: "https://evil.invalid" }, data: { pageKey: "about" } })).status()).toBe(403);
  expect((await page.request.post("/api/cms/pages", { headers: { origin }, data: { pageKey: "about", role: "owner" } })).status()).toBe(400);
  expect((await page.request.get(`/api/cms/pages/${row.id}`)).headers()["cache-control"]).toBe("no-store");
});
test("two editor tabs retain unsaved text when a stale save conflicts", async ({ page, context }) => {
  await login(page, "staff"); const row = await complete(page);
  await page.goto(`/admin/pages/about/${row.id}`); const other = await context.newPage();
  try {
    await other.goto(`/admin/pages/about/${row.id}`);
    await page.getByLabel("Judul", { exact: true }).fill("QA first writer");
    await page.getByRole("button", { name: "Simpan draft Indonesia" }).click(); await expect(page.getByRole("status")).toContainText("tersimpan");
    await other.getByLabel("Judul", { exact: true }).fill("QA preserved losing text");
    await other.getByRole("button", { name: "Simpan draft Indonesia" }).click();
    await expect(other.getByRole("status")).toContainText("Revisi berubah");
    await expect(other.getByLabel("Judul", { exact: true })).toHaveValue("QA preserved losing text");
  } finally { await other.close(); }
});
