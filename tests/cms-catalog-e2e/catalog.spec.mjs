import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const runtimeErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = []; runtimeErrors.set(page, errors); page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(runtimeErrors.get(page)).toEqual([]));
const origin = "http://127.0.0.1:3033";
const login = async (page, role = "staff") => {
  await page.goto("/admin/login");
  await page.getByLabel("Email akun internal", { exact: true }).fill(process.env[role === "owner" ? "QA_AUTH_OWNER_EMAIL" : "QA_AUTH_STAFF_EMAIL"]);
  await page.getByLabel("Password", { exact: true }).fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/, { timeout: 15000 });
};
const unique = label => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const fillModal = async (page, { name, description = "", price }) => {
  await page.getByLabel("Nama produk (wajib)", { exact: true }).fill(name);
  await page.getByLabel("Deskripsi (opsional)", { exact: true }).fill(description);
  await page.getByLabel("Harga dalam rupiah (wajib)", { exact: true }).fill(String(price));
};
const addProduct = async (page, values) => {
  await page.getByRole("button", { name: "Tambah produk", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah produk" });
  await expect(dialog).toBeVisible(); await fillModal(page, values);
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click(); await expect(dialog).toBeHidden();
};
const cards = async page => (await (await page.request.get("/api/cms/catalog")).json()).products;
const cleanup = async (page, names) => {
  for (const product of await cards(page)) if (names.includes(product.name)) expect((await page.request.delete("/api/cms/catalog/products/" + product.slug, { headers: { origin } })).status()).toBe(200);
};

test("anonymous catalog remains protected", async ({ page }) => {
  await page.goto("/admin/catalog"); await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get("/api/cms/catalog")).status()).toBe(401);
});

test("old id URLs are gone and no id appears in the catalog URL", async ({ page }) => {
  await login(page, "owner");
  for (const path of ["/admin/catalog/00000000-0000-4000-8000-000000000000", "/admin/pages/home/00000000-0000-4000-8000-000000000000", "/admin/publications"]) {
    const response = await page.goto(path); expect(response.status()).toBe(404); expect(new URL(page.url()).pathname).toBe(path);
  }
  await page.goto("/admin/catalog");
  await page.getByRole("button", { name: "Tambah produk", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible(); expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe("/admin/catalog");
});

test("Staff adds a product from the modal; it appears first, goes public, and has no Hapus button", async ({ page }, info) => {
  const name = unique("QA produk staff"); await login(page, "staff"); await page.goto("/admin/catalog");
  await page.getByRole("button", { name: "Tambah produk", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah produk" });
  await expect(dialog).toBeVisible(); await expect(dialog.locator("input[type=file]")).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Tambah produk", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Tambah produk", exact: true }).click(); await expect(dialog).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
  await addProduct(page, { name, description: "Deskripsi uji", price: 25000 });
  const first = page.getByRole("list", { name: "Produk katalog" }).getByRole("listitem").first();
  await expect(first).toContainText(name); await expect(first).toContainText("25.000");
  await expect(first.getByRole("button", { name: "Edit " + name })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Hapus / })).toHaveCount(0);
  expect((await page.request.delete("/api/cms/catalog/products/x", { headers: { origin } })).status()).toBe(403);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("catalog-cards.png"), fullPage: true });
  await page.goto("/menu"); await expect(page.locator("main")).toContainText(name);
  await login(page, "owner"); await cleanup(page, [name]);
});

test("validation keeps input and shows local errors without changing the catalog", async ({ page }) => {
  const name = unique("QA validasi"); await login(page, "owner"); await page.goto("/admin/catalog");
  const before = (await cards(page)).length;
  await page.getByRole("button", { name: "Tambah produk", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah produk" });
  await fillModal(page, { name, description: "<b>x</b>", price: "12,5" });
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toBeVisible(); await expect(dialog.getByLabel("Nama produk (wajib)")).toHaveValue(name);
  await expect(dialog).toContainText("Deskripsi maksimal"); await expect(dialog).toContainText("Harga harus angka bulat");
  expect((await cards(page)).length).toBe(before);
});

test("Owner edits then deletes immediately without a confirmation dialog", async ({ page }) => {
  const name = unique("QA produk owner"), renamed = name + " ubah"; await login(page, "owner"); await page.goto("/admin/catalog");
  await addProduct(page, { name, price: 18000 });
  await page.getByRole("button", { name: "Edit " + name, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ubah produk" }); await expect(dialog.getByLabel("Harga dalam rupiah (wajib)")).toHaveValue("18000");
  await fillModal(page, { name: renamed, price: 19000 }); await dialog.getByRole("button", { name: "Simpan", exact: true }).click(); await expect(dialog).toBeHidden();
  const card = page.getByRole("listitem").filter({ hasText: renamed }); await expect(card).toContainText("19.000");
  await card.getByRole("button", { name: "Hapus " + renamed, exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("dihapus permanen"); await expect(page.getByRole("listitem").filter({ hasText: renamed })).toHaveCount(0);
  await page.reload(); await expect(page.locator("main")).not.toContainText(renamed);
  expect((await cards(page)).some(product => product.name === renamed)).toBe(false);
});

test("public menu lists newest products first without category or variant UI", async ({ page }) => {
  const names = ["A", "B", "C"].map(letter => unique("QA urutan " + letter)); await login(page, "owner"); await page.goto("/admin/catalog");
  for (const name of names) await addProduct(page, { name, price: 1000 });
  const titles = await page.getByRole("listitem").locator("h3").allTextContents();
  expect(titles.slice(0, 3)).toEqual([...names].reverse());
  await page.goto("/menu");
  const shown = await page.locator("main article h2").allTextContents();
  expect(shown.filter(title => names.includes(title))).toEqual([...names].reverse());
  await expect(page.locator("main")).not.toContainText("Varian, topping"); await expect(page.locator("main fieldset")).toHaveCount(0);
  await cleanup(page, names);
});
