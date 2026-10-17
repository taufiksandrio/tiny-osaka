import { test, expect } from "@playwright/test";
const origin = "http://127.0.0.1:3033";
const login = async (page, role) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email akun internal", { exact: true }).fill(process.env[role === "owner" ? "QA_AUTH_OWNER_EMAIL" : "QA_AUTH_STAFF_EMAIL"]);
  await page.getByLabel("Password", { exact: true }).fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/);
};
test("anonymous access to the retired schedule API still requires authentication", async ({ page }) => {
  expect((await page.request.get("/api/cms/publications")).status()).toBe(401);
  expect((await page.request.post("/api/cms/publications", { headers: { origin }, data: {} })).status()).toBe(401);
  await page.goto("/admin/publications"); await expect(page).toHaveURL(/\/admin\/login$/);
});
for (const role of ["owner", "staff"]) test(`${role} cannot schedule, and old queue links lead to the page table`, async ({ page }) => {
  await login(page, role); await page.goto("/admin/publications"); await expect(page).toHaveURL(origin + "/admin/pages");
  await expect(page.getByRole("link", { name: "Publikasi terjadwal", exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/cms/publications")).status()).toBe(410);
  expect((await page.request.post("/api/cms/publications", { headers: { origin }, data: { action: "schedule", domain: "page" } })).status()).toBe(410);
  await page.goto("/admin/pages/about");
  await expect(page.getByLabel("Jadwal publikasi (opsional, WIB)")).toHaveCount(0);
  const response = await page.request.post("/api/cms/catalog/00000000-0000-0000-0000-000000000000/actions", { headers: { origin }, data: {
    action: "approve", data: { revisionId: "00000000-0000-0000-0000-000000000000", dueAt: new Date(Date.now() + 60000).toISOString() } } });
  expect(response.status()).toBe(410);
});
