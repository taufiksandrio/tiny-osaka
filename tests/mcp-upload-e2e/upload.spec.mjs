import { test, expect } from "@playwright/test";
import sharp from "sharp";

// URLs minted by scripts/run-mcp-upload-qa.mjs for this viewport project. Viewing a page never consumes a token.
const urls = JSON.parse(process.env.QA_MCP_UPLOAD_URLS ?? "{}");
if (!urls.view) throw new Error("QA_MCP_UPLOAD_URLS is missing: run through npm run test:mcp-upload-e2e");
const origin = "http://127.0.0.1:3033";
const CSP_PATTERN = /Content Security Policy|violates the following|Refused to/i;
const sessions = JSON.parse(process.env.QA_MCP_SESSIONS ?? "{}");
const watched = new WeakMap();
// The API route for a user-path token (the page URL itself is not a POST handler).
const apiUrl = pageUrl => pageUrl.replace("/admin/mcp/upload/", "/api/mcp/upload/");

const photo = format => sharp({ create: { width: 32, height: 24, channels: 3, background: "#c46234" } })[format]().toBuffer();

test.beforeEach(async ({ page }) => {
  const seen = []; watched.set(page, seen);
  page.on("pageerror", error => seen.push("pageerror: " + error.message));
  page.on("console", message => { if (message.type() === "error") seen.push("console: " + message.text()); });
});
// Every test: no CSP violation and no uncaught page error in the browser console.
test.afterEach(async ({ page }) => {
  expect(watched.get(page).filter(line => line.startsWith("pageerror") || CSP_PATTERN.test(line))).toEqual([]);
});

const login = async (page, role) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email akun internal", { exact: true }).fill(process.env[role === "owner" ? "QA_AUTH_OWNER_EMAIL" : "QA_AUTH_STAFF_EMAIL"]);
  await page.getByLabel("Password", { exact: true }).fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15000 });
};
const useSession = (page, role) => page.context().addCookies(sessions[role]);
const fileInput = page => page.getByLabel("Foto", { exact: true });

test("(a) anonymous visitor is redirected to login and an anonymous POST cannot consume the token", async ({ page }) => {
  await page.goto(urls.view);
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { name: "Masuk ke CMS" })).toBeVisible();
  // Cookie-less POST with a user-path token: refused with AUTH_REQUIRED, nothing consumed (checked in the runner afterwards).
  const response = await page.request.post(apiUrl(urls.view), { headers: { origin, "content-type": "image/png" }, data: await photo("png") });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ code: "AUTH_REQUIRED" });
});

test("(b) the same Owner sees the upload form for a valid token, and viewing does not consume it", async ({ page }) => {
  await login(page, "owner");
  await page.goto(urls.view);
  await expect(page.getByRole("heading", { name: "Unggah foto", exact: true })).toBeVisible();
  await expect(fileInput(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Unggah foto", exact: true })).toBeDisabled();
  await page.reload();
  await expect(fileInput(page)).toBeVisible();
});

test("(c) mobile layout: no horizontal scroll and every control at least 44 px", async ({ page }) => {
  await useSession(page, "owner");
  await page.goto(urls.view);
  await expect(fileInput(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const undersized = await page.evaluate(() => [...document.querySelectorAll("a[href], button, input, select, textarea, [role=button]")]
    .filter(el => { const box = el.getBoundingClientRect(); const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44); })
    .map(el => `${el.tagName.toLowerCase()} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)} [${(el.textContent || "").trim().slice(0, 30)}] in ${el.closest("header,nav,main,footer,aside")?.tagName}`));
  expect(undersized).toEqual([]);
});

test("(d) a small JPG and a small PNG are stored, and the page reports done", async ({ page }) => {
  test.setTimeout(90000);
  await useSession(page, "owner");
  const library = async () => (await (await page.request.get("/api/cms/media")).json()).rows.length;
  for (const [url, name, mimeType, buffer] of [[urls.png, "foto-kecil.png", "image/png", await photo("png")],
    [urls.jpg, "foto-kecil.jpg", "image/jpeg", await photo("jpeg")]]) {
    await page.goto(url);
    const before = await library();
    await fileInput(page).setInputFiles({ name, mimeType, buffer });
    await expect(page.locator("strong", { hasText: name })).toBeVisible();
    await expect(page.getByRole("img", { name: "Pratinjau foto yang dipilih", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Unggah foto", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/mcp\/upload\/[^?]+\?r=ok$/);
    await expect(page.getByRole("heading", { name: "Foto berhasil diunggah", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Foto sudah tersimpan di pustaka media");
    expect(await library()).toBe(before + 1);
  }
});

test("(e) an expired token and an already-used token show a clear Indonesian message", async ({ page }) => {
  await useSession(page, "owner");
  await page.goto(urls.expired);
  await expect(page.getByRole("heading", { name: "Tautan kedaluwarsa", exact: true })).toBeVisible();
  await expect(page.getByText("Tautan unggah sudah kedaluwarsa. Minta Claude membuat permintaan baru.", { exact: true })).toBeVisible();
  await expect(fileInput(page)).toHaveCount(0);
  // The agent path uses the same token store without a cookie: consume the second token first.
  const agent = await page.request.post(urls.usedAgent, { headers: { "content-type": "image/png" }, data: await photo("png") });
  expect(agent.status()).toBe(200);
  await page.goto(urls.usedUser);
  await expect(page.getByRole("heading", { name: "Token sudah dipakai", exact: true })).toBeVisible();
  await expect(page.getByText("Foto untuk permintaan ini sudah diunggah lewat jalur lain.", { exact: true })).toBeVisible();
  await expect(fileInput(page)).toHaveCount(0);
});

test("(f) a file that is not an image is refused with a clear message", async ({ page }) => {
  await useSession(page, "owner");
  await page.goto(urls.notImage);
  // Declares image/jpeg but the bytes are text: the content check, not the MIME check, must refuse it.
  await fileInput(page).setInputFiles({ name: "bukan-gambar.jpg", mimeType: "image/jpeg", buffer: Buffer.from("Ini teks biasa, bukan gambar.") });
  await page.getByRole("button", { name: "Unggah foto", exact: true }).click();
  await expect(page).toHaveURL(/\?r=NOT_IMAGE$/);
  await expect(page.locator("main [role=alert]")).toContainText("Berkas bukan gambar JPG, PNG, atau WebP yang valid.");
  await expect(page.getByRole("heading", { name: "Unggahan ditolak", exact: true })).toBeVisible();
});

test("(g) the page is noindex, no-store and no-referrer", async ({ page }) => {
  await useSession(page, "owner");
  const response = await page.goto(urls.view);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"] ?? "").toMatch(/no-store/);
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["x-robots-tag"] ?? "").toMatch(/noindex/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
});

test("(h) prototype-named ?r= values do not break the page", async ({ page }) => {
  await useSession(page, "owner");
  for (const query of ["?r=__proto__", "?r=constructor", "?r=toString", "?r[]=__proto__", "?r=__proto__&r=x"]) {
    const response = await page.goto(urls.view + query);
    expect(response.status(), query).toBe(200);
    await expect(page.getByRole("heading", { name: "Unggah foto", exact: true }), query).toBeVisible();
    await expect(page.locator("main [role=alert]"), query).toHaveCount(0);
  }
});

test("Staff is refused: the Owner upload page is not found for a Staff session", async ({ page }) => {
  await useSession(page, "staff");
  const response = await page.goto(urls.view);
  expect(response.status()).toBe(404);
  await expect(fileInput(page)).toHaveCount(0);
});
