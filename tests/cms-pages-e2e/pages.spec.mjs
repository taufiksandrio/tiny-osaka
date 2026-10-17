import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fields } from "../fixtures/page-content.mjs";
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

test("anonymous CMS redirects and API fails closed", async ({ page }) => {
  await page.goto("/admin/pages"); await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get("/api/cms/pages")).status()).toBe(401);
  expect((await page.request.post("/api/cms/pages", { headers: { origin }, data: { pageKey: "about" } })).status()).toBe(401);
});
test("Staff edits draft with safe preview, accessible fields and incomplete-review validation", async ({ page }) => {
  await login(page, "staff"); await page.getByRole("link", { name: "Kelola halaman website" }).click();
  await page.getByRole("link", { name: "about", exact: true }).click();
  await page.getByRole("button", { name: "Buat draft baru" }).click();
  await expect(page.getByRole("heading", { name: "Editor halaman about" })).toBeVisible();
  await page.getByLabel("Judul", { exact: true }).fill("QA editor title");
  const body = page.getByRole("group", { name: "Isi", exact: true });
  await body.getByRole("button", { name: "Tambah paragraf" }).click();
  await body.getByLabel("Teks", { exact: true }).fill("<script>literal preview</script>");
  await body.getByLabel("Tebal", { exact: true }).check();
  await body.getByLabel("Tautan internal").selectOption("/id/menu");
  await expect(page.getByRole("button", { name: "Kirim untuk review" })).toBeDisabled();
  await page.getByRole("button", { name: "Simpan draft Indonesia" }).click();
  await expect(page.getByRole("status")).toContainText("tersimpan");
  await page.getByRole("button", { name: "Pratinjau konten", exact: true }).click();
  await expect(page.getByRole("link", { name: "<script>literal preview</script>" })).toHaveAttribute("href", "/id/menu");
  expect(await page.locator(".cms-preview script").count()).toBe(0);
  await act(page, "Kirim untuk review"); await expect(page.getByRole("status")).toContainText("Lengkapi");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("Staff submits, Owner approves/publishes, clone keeps live content and approval separate", async ({ page, browser }) => {
  await login(page, "staff"); const row = await complete(page);
  await page.goto(`/admin/pages/about/${row.id}`);
  await act(page, "Kirim untuk review"); await expect(page.locator("main")).toContainText("review");
  await expect(page.getByRole("button", { name: "Setujui revisi" })).toHaveCount(0);
  const context = await browser.newContext(); const owner = await context.newPage();
  try {
    await login(owner, "owner"); await owner.goto(`/admin/pages/about/${row.id}`);
    await act(owner, "Setujui revisi"); await expect(owner.locator("main")).toContainText("approved");
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
