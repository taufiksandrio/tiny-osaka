import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fields } from "../fixtures/page-content.mjs";
import { seedCmsCatalog } from "../fixtures/cms-catalog.mjs";
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
const token = row => ({ revisionId: row.id, expectedVersion: row.version, expectedHash: row.contentHash });
const approved = async page => {
  let row = await write(page, "", { pageKey: "about" });
  for (const locale of ["id", "en"]) row = await write(page, `/${row.id}`, { revisionId: row.id, expectedVersion: row.version, locale, fields: fields() }, "patch");
  row = await write(page, `/${row.id}/actions`, { action: "submit", revisionId: row.id, expectedVersion: row.version });
  return write(page, `/${row.id}/actions`, { action: "approve", ...token(row) });
};
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const current = []; errors.set(page, current); page.on("pageerror", error => current.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
test("anonymous queue and mutations require authentication", async ({ page }) => {
  await page.goto("/admin/publications"); await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get("/api/cms/publications")).status()).toBe(401);
  expect((await page.request.post("/api/cms/publications", { headers: { origin }, data: {} })).status()).toBe(401);
});
test("Owner schedules exact approved page in WIB, opens queue and cancels accessibly", async ({ page }, info) => {
  await login(page, "owner"); const row = await approved(page);
  expect((await page.request.post("/api/cms/publications", { headers: { origin }, data: { action: "schedule", role: "owner" } })).status()).toBe(400);
  await page.goto(`/admin/pages/about/${row.id}`);
  await expect(page.getByRole("heading", { name: "Jadwalkan publikasi", exact: true })).toBeVisible();
  const time = new Date(Date.now() + 86400000 + 7 * 3600000).toISOString().slice(0, 16);
  await page.getByLabel("Tanggal dan waktu (WIB)").fill(time);
  await page.getByRole("button", { name: "Simpan jadwal", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Jadwal tersimpan" })).toBeVisible();
  await page.getByRole("link", { name: "Lihat publikasi terjadwal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publikasi terjadwal", exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText("Terjadwal");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("publication-queue.png"), fullPage: true });
  await page.getByRole("link", { name: "Buka revisi", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(row.id + "$"));
  await page.goto("/admin/publications");
  await page.getByRole("button", { name: "Batalkan jadwal", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Jadwal dibatalkan.");
  await expect(page.locator("main")).toContainText("Dibatalkan");
});
test("Staff reads history but cannot forge schedule or cancel, CSRF and extra fields rejected", async ({ page }) => {
  await login(page, "staff"); await page.goto("/admin/publications");
  await expect(page.getByRole("button", { name: "Batalkan jadwal", exact: true })).toHaveCount(0);
  expect((await page.request.post("/api/cms/publications", { headers: { origin }, data: { action: "schedule" } })).status()).toBe(403);
  expect((await page.request.post("/api/cms/publications", { headers: { origin: "https://example.invalid" }, data: {} })).status()).toBe(403);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("approved catalog shows shadcn schedule form and pending job can be cancelled", async ({ page }) => {
  await login(page, "owner");
  const catalogWrite = async (action, data) => {
    const path = action === "create" ? "" : `/${data.revisionId}${["submit", "approve"].includes(action) ? "/actions" : ""}`;
    const response = await page.request[action === "create" || path.endsWith("actions") ? "post" : "patch"]("/api/cms/catalog" + path,
      { headers: { origin }, data: action === "create" ? data : { action, data } });
    expect(response.ok(), await response.text()).toBe(true); return response.json();
  };
  let graph = await seedCmsCatalog(catalogWrite);
  graph = await catalogWrite("submit", { revisionId: graph.revision.id, expectedVersion: graph.revision.version });
  graph = await catalogWrite("approve", token(graph.revision));
  await page.goto(`/admin/catalog/${graph.revision.id}`);
  await page.getByLabel("Tanggal dan waktu (WIB)").fill(new Date(Date.now() + 86400000 + 7 * 3600000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Simpan jadwal", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Jadwal tersimpan" })).toBeVisible();
  await page.getByRole("link", { name: "Lihat publikasi terjadwal", exact: true }).click();
  const card = page.locator('[data-slot="card"]').filter({ has: page.getByRole("button", { name: "Batalkan jadwal", exact: true }) });
  await expect(card).toContainText("Katalog menu");
  await card.getByRole("button", { name: "Batalkan jadwal", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Jadwal dibatalkan.");
});
