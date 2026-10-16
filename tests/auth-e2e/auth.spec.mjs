import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const current = []; errors.set(page, current); page.on("pageerror", error => current.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const login = async (page, role) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email akun internal").fill(process.env[role === "owner" ? "QA_AUTH_OWNER_EMAIL" : "QA_AUTH_STAFF_EMAIL"]);
  await page.getByLabel("Password", { exact: true }).fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
};

test("anonymous redirects to login; CMS metadata, keyboard and accessibility", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Masuk ke CMS" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Langsung ke konten" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("Owner signs in and out with HttpOnly cookie and protected dashboard", async ({ page, context }) => {
  await login(page, "owner"); await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator("main")).toContainText("Peran: Owner");
  await expect(page.getByRole("link", { name: "Keamanan akun dan MFA" })).toBeVisible();
  expect((await context.cookies()).some(cookie => cookie.name.endsWith("session_token") && cookie.httpOnly && cookie.sameSite === "Lax")).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Keluar" }).click(); await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin"); await expect(page).toHaveURL(/\/admin\/login$/);
});
test("Staff cannot reach Owner security page or forge MFA/signup API", async ({ page }) => {
  await login(page, "staff"); await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator("main")).toContainText("Peran: Staff");
  await expect(page.getByRole("link", { name: "Keamanan akun dan MFA" })).toHaveCount(0);
  const response = await page.request.post("/api/auth/two-factor/enable", { headers: { origin: "http://127.0.0.1:3033" }, data: { password: process.env.QA_AUTH_PASSWORD, role: "owner" } });
  expect(response.status()).toBe(403);
  expect((await page.request.post("/api/auth/sign-up/email", { data: {} })).status()).toBe(404);
  expect((await page.goto("/admin/security")).status()).toBe(404);
});
test("reset UI is honest when real email adapter is absent", async ({ page }) => {
  await page.goto("/admin/reset-password"); await expect(page.locator("main")).toContainText("Pengiriman email belum dikonfigurasi");
  await page.getByLabel("Email akun", { exact: true }).fill("qa@example.invalid");
  await page.getByRole("button", { name: "Minta tautan reset" }).click();
  await expect(page.getByRole("status")).toContainText("Layanan belum tersedia");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("reset and verification fragments keep tokens out of HTTP request URLs", async ({ page }) => {
  const urls = []; page.on("request", request => urls.push(request.url()));
  await page.goto("/admin/reset-password#token=synthetic-invalid-token");
  await page.getByLabel("Password baru (minimal 12 karakter)", { exact: true }).fill(process.env.QA_AUTH_PASSWORD);
  await page.getByLabel("Ulangi password baru").fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Simpan password baru" }).click();
  await expect(page.getByRole("status")).toContainText("Permintaan gagal");
  await page.goto("/admin/verify-email#token=synthetic-invalid-token");
  await page.getByRole("button", { name: "Verifikasi email" }).click();
  await expect(page.getByRole("status")).toContainText("Permintaan gagal");
  expect(urls.some(url => url.includes("synthetic-invalid-token"))).toBe(false);
});
test("Owner enrolls MFA, completes a later login challenge, and disables MFA", async ({ page }) => {
  await login(page, "owner"); await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: "Keamanan akun dan MFA" }).click();
  await page.getByLabel("Konfirmasi password saat ini").fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Siapkan MFA" }).click();
  await expect(page.locator(".auth-secret")).toBeVisible();
  const secret = new TextDecoder().decode(base32.decode(await page.locator(".auth-secret").innerText()));
  const otp = () => createOTP(secret).totp();
  await page.getByLabel("Kode dari authenticator").fill(await otp());
  await page.getByRole("button", { name: "Aktifkan MFA" }).click();
  await expect(page.getByRole("status")).toContainText("MFA aktif");
  await page.getByRole("button", { name: "Kode sudah saya simpan" }).click();
  await expect(page.locator("main")).toContainText("MFA aktif.");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Kembali ke CMS" }).click(); await page.getByRole("button", { name: "Keluar" }).click();
  await login(page, "owner"); await expect(page.getByLabel("Kode verifikasi")).toBeVisible();
  expect((await page.request.get("/api/auth/get-session")).ok()).toBe(true);
  expect(await (await page.request.get("/api/auth/get-session")).json()).toBe(null);
  await page.getByLabel("Kode verifikasi").fill(await otp());
  await page.getByRole("button", { name: "Verifikasi", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: "Keamanan akun dan MFA" }).click();
  await page.getByLabel("Konfirmasi password saat ini").fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Nonaktifkan MFA" }).click();
  await expect(page.getByRole("button", { name: "Siapkan MFA" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
