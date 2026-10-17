import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedCmsCatalog } from "../fixtures/cms-catalog.mjs";
const origin = "http://127.0.0.1:3033";
const login = async (page, role = "staff") => {
  await page.goto("/admin/login");
  await page.getByLabel("Email akun internal", { exact: true }).fill(process.env[role === "owner" ? "QA_AUTH_OWNER_EMAIL" : "QA_AUTH_STAFF_EMAIL"]);
  await page.getByLabel("Password", { exact: true }).fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/, { timeout: 15000 });
};
const write = async (page, action, data) => {
  const path = action === "create" ? "" : `/${data.revisionId ?? data.sourceRevisionId}${["clone", "submit", "approve", "reject", "publish", "archive", "readiness"].includes(action) ? "/actions" : ""}`;
  const response = await page.request[action === "create" || path.endsWith("actions") ? "post" : "patch"]("/api/cms/catalog" + path,
    { headers: { origin }, data: action === "create" ? data : { action, data } });
  expect(response.ok(), await response.text()).toBe(true); return response.json();
};
const token = graph => ({ revisionId: graph.revision.id, expectedVersion: graph.revision.version, expectedHash: graph.revision.contentHash });
const act = async (page, name) => {
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Konfirmasi", exact: true }).click();
};
const save = async (page, form, button) => {
  const response = page.waitForResponse(response => response.url().includes("/api/cms/catalog/") && response.request().method() === "PATCH");
  await form.getByRole("button", { name: button, exact: true }).click(); expect((await response).ok()).toBe(true);
  await expect(page.getByRole("status")).toContainText("tersimpan");
};
const translation = async (page, title, locale, name) => {
  const language = locale === "id" ? "Indonesia" : "Inggris", form = page.getByRole("form", { name: `${title} ${language}`, exact: true });
  await form.getByLabel("Nama", { exact: true }).fill(name); await form.getByLabel("Deskripsi", { exact: true }).fill("QA synthetic description");
  await save(page, form, `Simpan ${language}`);
};
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const list = []; errors.set(page, list); page.on("pageerror", error => list.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
test("anonymous catalog UI and API fail closed", async ({ page }) => {
  await page.goto("/admin/catalog"); await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get("/api/cms/catalog")).status()).toBe(401);
  expect((await page.request.post("/api/cms/catalog", { headers: { origin }, data: {} })).status()).toBe(401);
});
test("Staff builds bilingual catalog through shadcn forms with modifiers and unsaved preview", async ({ page }, testInfo) => {
  test.setTimeout(90000); await login(page);
  await page.getByRole("link", { name: "Kelola katalog menu", exact: true }).click();
  await page.getByRole("button", { name: "Buat draft katalog", exact: true }).click(); await expect(page.getByRole("heading", { name: "Editor katalog", exact: true })).toBeVisible();
  const categorySlug = `qa-ui-category-${Date.now()}`, productSlug = `qa-ui-product-${Date.now()}`;
  let form = page.getByRole("form", { name: "Tambah kategori", exact: true });
  await form.getByLabel("Slug kategori", { exact: true }).fill(categorySlug); await save(page, form, "Tambah kategori");
  await page.locator("summary").filter({ hasText: categorySlug }).click();
  const idForm = page.getByRole("form", { name: "Kategori Indonesia", exact: true }), enForm = page.getByRole("form", { name: "Kategori Inggris", exact: true });
  await idForm.getByLabel("Nama", { exact: true }).fill("QA category id"); await enForm.getByLabel("Nama", { exact: true }).fill("QA category en");
  await save(page, idForm, "Simpan Indonesia"); await expect(enForm.getByLabel("Nama", { exact: true })).toHaveValue("QA category en");
  await expect(page.getByRole("button", { name: "Kirim untuk review", exact: true })).toBeDisabled(); await save(page, enForm, "Simpan Inggris");
  form = page.getByRole("form", { name: "Tambah produk", exact: true });
  await form.getByLabel("Slug produk", { exact: true }).fill(productSlug); await form.getByLabel("Kategori produk", { exact: true }).selectOption({ label: categorySlug });
  await save(page, form, "Tambah produk"); await page.locator("summary").filter({ hasText: productSlug }).click();
  const productForm = page.getByRole("form", { name: "Produk Indonesia", exact: true });
  await productForm.getByLabel("Nama", { exact: true }).fill("<script>QA preview literal</script>");
  await page.getByRole("button", { name: "Pratinjau katalog", exact: true }).click();
  const preview = page.getByRole("region", { name: "Pratinjau katalog", exact: true });
  await expect(preview.getByRole("heading", { name: "<script>QA preview literal</script>" })).toBeVisible(); expect(await preview.locator("script").count()).toBe(0);
  await expect(preview).toContainText("Termasuk perubahan belum disimpan"); await page.getByRole("button", { name: "Kembali ke editor", exact: true }).click();
  await expect(productForm.getByLabel("Nama", { exact: true })).toHaveValue("<script>QA preview literal</script>");
  await translation(page, "Produk", "id", "QA product id"); await translation(page, "Produk", "en", "QA product en");
  form = page.getByRole("form", { name: "Tambah varian", exact: true }); await form.getByLabel("Harga dasar (Rp)", { exact: true }).fill("25000"); await save(page, form, "Tambah varian");
  await translation(page, "Varian standard", "id", "QA standard id"); await translation(page, "Varian standard", "en", "QA standard en");
  form = page.getByRole("form", { name: "Tambah kelompok modifier", exact: true }); await form.getByLabel("Kode", { exact: true }).fill("extras"); await save(page, form, "Tambah kelompok");
  await translation(page, "Modifier extras", "id", "QA extras id"); await translation(page, "Modifier extras", "en", "QA extras en");
  form = page.getByRole("form", { name: "Tambah opsi", exact: true }); await form.getByLabel("Kode", { exact: true }).fill("extra"); await form.getByLabel("Tambahan harga (Rp)", { exact: true }).fill("5000"); await save(page, form, "Tambah opsi");
  await translation(page, "Opsi extra", "id", "QA extra id"); await translation(page, "Opsi extra", "en", "QA extra en");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Periksa kesiapan", exact: true }).click(); await expect(page.getByRole("heading", { name: "Katalog siap diajukan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pratinjau katalog", exact: true }).click();
  await expect(preview).toContainText(/Rp\s*25\.000/); await preview.getByRole("checkbox").check(); await expect(preview).toContainText(/Rp\s*30\.000/);
  await page.getByLabel("Bahasa preview", { exact: true }).selectOption("en"); await expect(preview).toContainText("QA product en");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("catalog-preview.png"), fullPage: true });
  await act(page, "Kirim untuk review"); await expect(page.locator("main")).toContainText("Menunggu review");
});
test("Owner reviews/publishes and clone protects public menu; forged API actions fail", async ({ page, browser }) => {
  test.setTimeout(60000); await login(page); let graph = await seedCmsCatalog((action, data) => write(page, action, data));
  graph = await write(page, "submit", { revisionId: graph.revision.id, expectedVersion: graph.revision.version });
  for (const action of ["approve", "reject", "publish", "archive"]) expect((await page.request.post(`/api/cms/catalog/${graph.revision.id}/actions`, { headers: { origin }, data: { action, data: token(graph) } })).status()).toBe(403);
  expect((await page.request.post("/api/cms/catalog", { headers: { origin: "https://evil.invalid" }, data: {} })).status()).toBe(403);
  expect((await page.request.post("/api/cms/catalog", { headers: { origin }, data: { role: "owner" } })).status()).toBe(400);
  expect((await page.request.get(`/api/cms/catalog/${graph.revision.id}`)).headers()["cache-control"]).toBe("no-store");
  const context = await browser.newContext(), owner = await context.newPage();
  try {
    await login(owner, "owner"); await owner.goto(`/admin/catalog/${graph.revision.id}`);
    await act(owner, "Setujui revisi"); await expect(owner.locator("main")).toContainText("Disetujui");
    await act(owner, "Terbitkan revisi"); await expect(owner.locator("main")).toContainText("Sedang tampil di publik");
    for (const locale of ["id", "en"]) { await owner.goto(`/${locale}/menu`); await expect(owner.locator("main")).toContainText("QA product " + locale); }
    await page.goto(`/admin/catalog/${graph.revision.id}`); await act(page, "Buat draft dari revisi ini"); await expect(page).not.toHaveURL(new RegExp(graph.revision.id));
    await page.locator("summary").filter({ hasText: graph.products[0].slug }).click(); await translation(page, "Produk", "id", "QA unpublished replacement");
    await owner.goto("/id/menu"); await expect(owner.locator("main")).toContainText("QA product id"); await expect(owner.locator("main")).not.toContainText("QA unpublished replacement");
  } finally { await context.close(); }
});
test("stale catalog form keeps unsaved text after another tab wins", async ({ page, context }) => {
  await login(page); const graph = await seedCmsCatalog((action, data) => write(page, action, data));
  await page.goto(`/admin/catalog/${graph.revision.id}`); const other = await context.newPage();
  try {
    await other.goto(`/admin/catalog/${graph.revision.id}`);
    for (const tab of [page, other]) await tab.locator("summary").filter({ hasText: graph.products[0].slug }).click();
    await translation(page, "Produk", "id", "QA winning edit");
    const form = other.getByRole("form", { name: "Produk Indonesia", exact: true }); await form.getByLabel("Nama", { exact: true }).fill("QA losing text preserved");
    await form.getByRole("button", { name: "Simpan Indonesia", exact: true }).click(); await expect(other.getByRole("status")).toContainText("Revisi berubah");
    await expect(form.getByLabel("Nama", { exact: true })).toHaveValue("QA losing text preserved");
  } finally { await other.close(); }
});
