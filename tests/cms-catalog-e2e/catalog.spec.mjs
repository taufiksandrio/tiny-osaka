import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const runtimeErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = []; runtimeErrors.set(page, errors); page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(runtimeErrors.get(page)).toEqual([]));
const origin = "http://127.0.0.1:3033";
// The login endpoint is rate limited, so each role signs in through the UI once per run and reuses the session cookies afterwards.
const sessions = {};
const login = async (page, role = "staff") => {
  if (sessions[role]) { await page.context().clearCookies(); await page.context().addCookies(sessions[role]); return; }
  await page.goto("/admin/login");
  await page.getByLabel("Email akun internal", { exact: true }).fill(process.env[role === "owner" ? "QA_AUTH_OWNER_EMAIL" : "QA_AUTH_STAFF_EMAIL"]);
  await page.getByLabel("Password", { exact: true }).fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/, { timeout: 15000 });
  sessions[role] = await page.context().cookies();
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
  await expect(dialog).toBeVisible(); await expect(dialog.locator("input[type=file]")).toHaveCount(1);
  await expect(dialog.locator("img")).toHaveCount(0);
  for (const label of ["Link GrabFood", "Link GoFood", "Link ShopeeFood"]) {
    const input = dialog.getByLabel(label, { exact: true });
    await expect(input).toHaveAttribute("type", "url"); await expect(input).toHaveAttribute("inputmode", "url"); await expect(input).toHaveAttribute("autocomplete", "off");
    await expect(input).not.toHaveAttribute("required", /.*/); await expect(input).not.toHaveAttribute("aria-required", /.*/);
    await expect(input).toHaveAttribute("placeholder", "https://"); expect(await input.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await expect(dialog.getByText("Opsional. Tempel link produk atau toko dari aplikasi/situs resmi.")).toHaveCount(3);
  await expect(dialog.locator("form")).toHaveAttribute("novalidate", "");
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

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LINK = "https://example.test/pesan/produk";
const openAdd = async page => {
  await page.getByRole("button", { name: "Tambah produk", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah produk" }); await expect(dialog).toBeVisible(); return dialog;
};
const pickFile = (dialog, file) => dialog.locator("input[type=file]").setInputFiles(file);
const save = dialog => dialog.getByRole("button", { name: "Simpan", exact: true }).click();

test("order links are optional, saved, shown in Edit, cleared with null, and never rendered in the admin card", async ({ page }) => {
  const plain = unique("QA kartu polos"), linked = unique("QA kartu link"); await login(page, "owner"); await page.goto("/admin/catalog");
  await addProduct(page, { name: plain, description: "Sama", price: 9000 });
  const dialog = await openAdd(page);
  await fillModal(page, { name: linked, description: "Sama", price: 9000 });
  await dialog.getByLabel("Link GrabFood", { exact: true }).fill(" " + LINK + "/grab ");
  await dialog.getByLabel("Link GoFood", { exact: true }).fill(LINK + "/go");
  await dialog.getByLabel("Link ShopeeFood", { exact: true }).fill(LINK + "/shopee");
  await save(dialog); await expect(dialog).toBeHidden();
  const stored = (await cards(page)).find(row => row.name === linked);
  expect([stored.grabfoodUrl, stored.gofoodUrl, stored.shopeefoodUrl]).toEqual([LINK + "/grab", LINK + "/go", LINK + "/shopee"]);
  expect((await cards(page)).find(row => row.name === plain)).toMatchObject({ grabfoodUrl: null, gofoodUrl: null, shopeefoodUrl: null });
  const html = name => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) }).evaluate((el, label) => el.innerHTML.split(label).join("NAMA"), name);
  expect(await html(linked)).toBe(await html(plain));
  const card = page.getByRole("listitem").filter({ hasText: linked });
  await expect(card.locator("a")).toHaveCount(0); await expect(card.locator("button")).toHaveCount(2);
  await expect(card).not.toContainText(/GrabFood|GoFood|ShopeeFood/); expect(await card.innerHTML()).not.toContain("example.test");
  // Edit prefills, an untouched save keeps links, clearing one sends null and leaves the others.
  await card.getByRole("button", { name: "Edit " + linked }).click();
  const edit = page.getByRole("dialog", { name: "Ubah produk" });
  await expect(edit.getByLabel("Link GoFood", { exact: true })).toHaveValue(LINK + "/go");
  await save(edit); await expect(edit).toBeHidden();
  expect((await cards(page)).find(row => row.name === linked).grabfoodUrl).toBe(LINK + "/grab");
  await card.getByRole("button", { name: "Edit " + linked }).click();
  await edit.getByLabel("Link GoFood", { exact: true }).fill("   "); await save(edit); await expect(edit).toBeHidden();
  expect((await cards(page)).find(row => row.name === linked)).toMatchObject({ grabfoodUrl: LINK + "/grab", gofoodUrl: null, shopeefoodUrl: LINK + "/shopee" });
  await page.goto("/menu"); expect(await page.content()).not.toContain("example.test/pesan"); // not shown publicly (Q-R option b)
  await cleanup(page, [plain, linked]);
});

test("invalid order links show Indonesian inline errors, keep every input, and focus the first bad field", async ({ page }) => {
  const name = unique("QA link salah"); await login(page, "staff"); await page.goto("/admin/catalog");
  const before = (await cards(page)).length; const dialog = await openAdd(page);
  await fillModal(page, { name, description: "Isi tetap", price: 5000 });
  const grab = dialog.getByLabel("Link GrabFood", { exact: true }), go = dialog.getByLabel("Link GoFood", { exact: true }), shopee = dialog.getByLabel("Link ShopeeFood", { exact: true });
  await grab.fill("http://example.test/a"); await go.fill("javascript:alert(1)"); await shopee.fill(LINK);
  await grab.blur(); await expect(grab).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText("Link GrabFood harus diawali https://.")).toBeVisible();
  expect(await grab.getAttribute("aria-describedby")).toContain((await grab.getAttribute("id")) + "-error");
  await save(dialog);
  await expect(dialog).toBeVisible(); await expect(grab).toBeFocused();
  await expect(dialog.getByText("Link GoFood harus diawali https://.")).toBeVisible();
  await expect(dialog.getByRole("alert").filter({ hasText: "2 isian perlu diperbaiki" })).toHaveCount(1);
  await expect(shopee).not.toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByLabel("Nama produk (wajib)")).toHaveValue(name); await expect(dialog.getByLabel("Deskripsi (opsional)")).toHaveValue("Isi tetap");
  await expect(shopee).toHaveValue(LINK);
  await grab.fill(LINK + "/g"); await go.fill(""); await grab.blur(); await expect(grab).not.toHaveAttribute("aria-invalid", "true");
  expect((await cards(page)).length).toBe(before);
  await save(dialog); await expect(dialog).toBeHidden();
  await login(page, "owner"); await cleanup(page, [name]);
});

test("server INVALID_ORDER_URL message appears next to its field", async ({ page }) => {
  await login(page, "owner"); await page.goto("/admin/catalog");
  await page.route("**/api/cms/catalog", route => route.request().method() === "POST" ?
    route.fulfill({ status: 400, json: { code: "INVALID_ORDER_URL", field: "gofoodUrl", message: "Link GoFood tidak valid." } }) : route.continue());
  const dialog = await openAdd(page); await fillModal(page, { name: unique("QA server link"), price: 100 });
  await dialog.getByLabel("Link GoFood", { exact: true }).fill(LINK); await save(dialog);
  const go = dialog.getByLabel("Link GoFood", { exact: true });
  await expect(go).toHaveAttribute("aria-invalid", "true"); await expect(go).toBeFocused(); await expect(dialog.getByText("Link GoFood tidak valid.").first()).toBeVisible();
  await expect(dialog.getByLabel("Link GrabFood", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
});

test("image picker validates the file on the client, needs alt text, shows no preview and uploads nothing before Simpan", async ({ page }) => {
  await login(page, "owner"); await page.goto("/admin/catalog");
  let uploads = 0, writes = 0;
  page.on("request", request => { if (request.url().includes("/api/cms/media/upload")) uploads++; if (request.url().endsWith("/api/cms/catalog") && request.method() === "POST") writes++; });
  const dialog = await openAdd(page); await fillModal(page, { name: unique("QA gambar"), price: 100 });
  await expect(dialog.locator("input[type=file]")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  await pickFile(dialog, { name: "catatan.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
  await expect(dialog.getByText("Format gambar harus JPEG, PNG, atau WebP.").first()).toBeVisible();
  await pickFile(dialog, { name: "besar.png", mimeType: "image/png", buffer: Buffer.alloc(10_000_001) });
  await expect(dialog.getByText("Ukuran gambar maksimal 10 MB.").first()).toBeVisible();
  await expect(dialog.getByLabel("Teks alternatif gambar (wajib)")).toHaveCount(0);
  await pickFile(dialog, { name: "foto.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByText("Gambar dipilih: foto.png").first()).toBeVisible(); await expect(dialog.locator("img")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Ganti gambar", exact: true })).toBeVisible(); await expect(dialog.getByRole("button", { name: "Hapus gambar", exact: true })).toBeVisible();
  const alt = dialog.getByLabel("Teks alternatif gambar (wajib)"); await expect(alt).toHaveValue("");
  await save(dialog); await expect(dialog).toBeVisible(); await expect(alt).toBeFocused(); await expect(alt).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText("Teks alternatif gambar wajib diisi.").first()).toBeVisible();
  await alt.fill("<b>"); await alt.blur(); await expect(dialog.getByText("Teks alternatif tidak boleh memuat < atau >.").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Hapus gambar", exact: true }).click();
  await expect(dialog.getByLabel("Teks alternatif gambar (wajib)")).toHaveCount(0); await expect(dialog.getByText("Belum ada gambar.")).toBeVisible();
  await pickFile(dialog, { name: "foto.png", mimeType: "image/png", buffer: PNG });
  await dialog.getByRole("button", { name: "Batal", exact: true }).click(); await expect(dialog).toBeHidden();
  expect(uploads).toBe(0); expect(writes).toBe(0);
});

test("upload failures show a local message, create nothing, and keep the input", async ({ page }) => {
  await login(page, "owner"); await page.goto("/admin/catalog");
  const cases = [[429, { code: "UPLOAD_BUSY" }, "Upload sedang penuh"], [413, { code: "INPUT_TOO_LARGE" }, "Ukuran gambar maksimal 10 MB."], [400, { code: "INVALID_MEDIA" }, "Gambar tidak dapat dipakai"], [503, { code: "MEDIA_UNAVAILABLE" }, "Layanan unggah gambar sedang bermasalah"]];
  let writes = 0; page.on("request", request => { if (request.url().endsWith("/api/cms/catalog") && request.method() === "POST") writes++; });
  const name = unique("QA upload gagal"); const dialog = await openAdd(page); await fillModal(page, { name, description: "Tetap", price: 700 });
  await pickFile(dialog, { name: "foto.png", mimeType: "image/png", buffer: PNG }); await dialog.getByLabel("Teks alternatif gambar (wajib)").fill("Takoyaki di piring");
  await dialog.getByLabel("Link GoFood", { exact: true }).fill(LINK);
  for (const [status, json, text] of cases) {
    await page.route("**/api/cms/media/upload", route => route.fulfill({ status, json }));
    await save(dialog); await expect(dialog.getByText(text).first()).toBeVisible(); await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Nama produk (wajib)")).toHaveValue(name); await expect(dialog.getByLabel("Teks alternatif gambar (wajib)")).toHaveValue("Takoyaki di piring");
    await expect(dialog.getByLabel("Link GoFood", { exact: true })).toHaveValue(LINK); await expect(dialog.getByText(/^Gambar dipilih: foto.png/).first()).toBeVisible();
    await page.unroute("**/api/cms/media/upload");
  }
  expect(writes).toBe(0); expect((await cards(page)).some(row => row.name === name)).toBe(false);
});

test("upload then POST/PATCH payloads follow the API contract (replace, alt only, remove) using mocked network", async ({ page }) => {
  await login(page, "owner"); await page.goto("/admin/catalog");
  const name = unique("QA kontrak gambar"), bodies = [], uploadTypes = [];
  let current = null, nextId = UUID_A;
  const card = extra => ({ slug: "qa-kontrak", name, description: "", price: 500, sortOrder: 99, image: null, grabfoodUrl: null, gofoodUrl: null, shopeefoodUrl: null, version: "v" + bodies.length, ...extra });
  await page.route("**/api/cms/media/upload", route => { uploadTypes.push(route.request().headers()["content-type"]); route.fulfill({ json: { id: nextId, kind: "image" } }); });
  await page.route("**/api/cms/catalog", route => {
    if (route.request().method() === "POST") { bodies.push(route.request().postDataJSON()); current = card({ image: { assetId: UUID_A, alt: bodies.at(-1).imageAlt }, gofoodUrl: bodies.at(-1).gofoodUrl ?? null }); return route.fulfill({ status: 201, json: { product: current } }); }
    return route.fulfill({ json: { products: current ? [current] : [], updatedAt: new Date().toISOString(), role: "owner" } });
  });
  await page.route("**/api/cms/catalog/products/qa-kontrak", route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    current = card({ ...current, image: body.imageAssetId === null ? null : body.imageAssetId ? { assetId: body.imageAssetId, alt: body.imageAlt } : body.imageAlt !== undefined ? { ...current.image, alt: body.imageAlt } : current.image, version: "v" + bodies.length });
    return route.fulfill({ json: { product: current } });
  });
  const dialog = await openAdd(page); await fillModal(page, { name, price: 500 });
  await pickFile(dialog, { name: "foto.png", mimeType: "image/png", buffer: PNG }); await dialog.getByLabel("Teks alternatif gambar (wajib)").fill("  Takoyaki baru  ");
  await dialog.getByLabel("Link GoFood", { exact: true }).fill(LINK); await save(dialog); await expect(dialog).toBeHidden();
  expect(uploadTypes).toEqual(["image/png"]);
  expect(bodies[0]).toMatchObject({ imageAssetId: UUID_A, imageAlt: "Takoyaki baru", gofoodUrl: LINK }); expect("grabfoodUrl" in bodies[0]).toBe(false);
  const open = async () => { await page.getByRole("button", { name: "Edit " + name, exact: true }).click(); return page.getByRole("dialog", { name: "Ubah produk" }); };
  let edit = await open();
  await expect(edit.getByText("Gambar terpasang.")).toBeVisible(); await expect(edit.locator("img")).toHaveCount(0);
  await expect(edit.getByLabel("Teks alternatif gambar (wajib)")).toHaveValue("Takoyaki baru"); await expect(edit.getByLabel("Link GoFood", { exact: true })).toHaveValue(LINK);
  await edit.getByLabel("Teks alternatif gambar (wajib)").fill("Alt diubah"); await save(edit); await expect(edit).toBeHidden();
  expect(bodies[1]).toMatchObject({ imageAlt: "Alt diubah" }); for (const key of ["imageAssetId", "grabfoodUrl", "gofoodUrl", "shopeefoodUrl"]) expect(key in bodies[1]).toBe(false);
  expect(uploadTypes.length).toBe(1);
  edit = await open(); nextId = UUID_B;
  await pickFile(edit, { name: "baru.png", mimeType: "image/png", buffer: PNG });
  await expect(edit.getByLabel("Teks alternatif gambar (wajib)")).toHaveValue(""); await save(edit);
  await expect(edit.getByText("Teks alternatif gambar wajib diisi.").first()).toBeVisible(); expect(uploadTypes.length).toBe(1); // invalid form never uploads
  await edit.getByLabel("Teks alternatif gambar (wajib)").fill("Foto kedua"); await save(edit); await expect(edit).toBeHidden();
  expect(bodies[2]).toMatchObject({ imageAssetId: UUID_B, imageAlt: "Foto kedua" }); expect(uploadTypes.length).toBe(2);
  edit = await open(); await edit.getByRole("button", { name: "Hapus gambar", exact: true }).click();
  await expect(edit.getByText("Gambar akan dilepas saat Anda menekan Simpan.")).toBeVisible(); await expect(edit.getByLabel("Teks alternatif gambar (wajib)")).toHaveCount(0);
  await save(edit); await expect(edit).toBeHidden();
  expect(bodies[3].imageAssetId).toBeNull(); expect("imageAlt" in bodies[3]).toBe(false); expect(uploadTypes.length).toBe(2);
});
