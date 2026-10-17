import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const runtimeErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
 const errors=[]; runtimeErrors.set(page, errors); page.on('pageerror', error=>errors.push(error.message));
 await page.route('**/*', route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
test.afterEach(async ({ page })=>expect(runtimeErrors.get(page)).toEqual([]));
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

const create = page => write(page, "", { pageKey: "about" });
const act = async (page, name) => { await page.getByRole("button", { name, exact: true }).click(); await page.getByRole("button", { name: "Konfirmasi", exact: true }).click(); };
const fill = async page => { await page.getByLabel("Judul * (wajib)", { exact: true }).fill("QA halaman sederhana"); await page.getByLabel("Isi * (wajib)", { exact: true }).fill("QA isi halaman yang ditinjau."); };
test("anonymous editor/API deny access", async ({ page }) => {
 await page.goto("/admin/pages"); await expect(page).toHaveURL(/\/admin\/login$/); expect((await page.request.get("/api/cms/pages")).status()).toBe(401);
});
test("Staff saves one Indonesian form, required errors and success appear beside the same action row", async ({ page }, info) => {
 await login(page,"staff"); const row=await create(page); await page.goto('/admin/pages/about/'+row.id);
 await expect(page.getByLabel("Bahasa konten",{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Kirim untuk review',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Lengkapi isian wajib'); await expect(page.locator('#page-title')).toBeFocused();
 await fill(page); await expect(page.getByRole('button',{name:'Kirim untuk review',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Simpan semua perubahan',exact:true}).click(); await expect(page.getByRole('status')).toHaveText('Semua perubahan tersimpan.');
 const saved=await (await page.request.get('/api/cms/pages/'+row.id)).json(); expect(saved.translations.map(t=>t.locale)).toEqual(['id']);
 await page.getByRole('button',{name:'Pratinjau konten',exact:true}).click(); await expect(page.locator('.cms-page-preview')).toContainText('QA halaman sederhana');
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('simple-page.png'),fullPage:true});
 await act(page,'Kirim untuk review'); await expect(page.locator('main')).toContainText('Menunggu review');
 await expect(page.getByRole('button',{name:'Setujui',exact:true})).toHaveCount(0);
 expect((await page.request.post('/api/cms/pages/'+row.id+'/actions',{headers:{origin},data:{action:'approve',revisionId:row.id,expectedVersion:saved.version,expectedHash:'a'.repeat(64)}})).status()).toBe(403);
});
test("Owner directly approves and publishes an Indonesian-only page then clones without changing live",async({page})=>{
 await login(page,'owner');const row=await create(page);await page.goto('/admin/pages/about/'+row.id);await fill(page);
 await page.getByRole('button',{name:'Simpan semua perubahan',exact:true}).click();await expect(page.getByRole('status')).toContainText('tersimpan');
 await expect(page.getByRole('button',{name:'Kirim untuk review',exact:true})).toHaveCount(0);
 await act(page,'Setujui');await expect(page.locator('main')).toContainText('Sedang tampil di publik');
 await page.goto('/id/about');await expect(page.getByRole('heading',{level:1})).toHaveText('QA halaman sederhana'); await expect(page.locator('main')).not.toContainText('Konten belum diterbitkan.');
 await page.goto('/admin/pages/about/'+row.id);await act(page,'Buat draft dari revisi ini');await expect(page).not.toHaveURL(new RegExp(row.id));
 await page.getByLabel('Judul * (wajib)',{exact:true}).fill('QA perubahan belum terbit');
 expect(await (await page.request.get('/id/about')).text()).toContain('QA halaman sederhana');
});
test("stale global save preserves typed changes and reports conflict; foreign origins and English writes fail",async({page,browser})=>{
 await login(page,'owner');const row=await create(page);await page.goto('/admin/pages/about/'+row.id);await fill(page);
 const other=await browser.newPage();try{await login(other,'owner');await other.goto('/admin/pages/about/'+row.id);await fill(other);
 await page.getByRole('button',{name:'Simpan semua perubahan',exact:true}).click();await expect(page.getByRole('status')).toContainText('tersimpan');
 await other.getByRole('button',{name:'Simpan semua perubahan',exact:true}).click();await expect(other.getByRole('status')).toContainText('Revisi berubah');await expect(other.locator('#page-title')).toHaveValue('QA halaman sederhana');
 }finally{await other.close()}
 expect((await page.request.patch('/api/cms/pages/'+row.id,{headers:{origin:'https://foreign.invalid'},data:{}})).status()).toBe(403);
 expect((await page.request.patch('/api/cms/pages/'+row.id,{headers:{origin},data:{revisionId:row.id,expectedVersion:1,locale:'en',fields:{}}})).status()).toBe(400);
});
