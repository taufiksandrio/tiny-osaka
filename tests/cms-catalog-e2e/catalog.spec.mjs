import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const runtimeErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
 const errors=[]; runtimeErrors.set(page, errors); page.on('pageerror', error=>errors.push(error.message));
 await page.route('**/*', route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
test.afterEach(async ({ page })=>expect(runtimeErrors.get(page)).toEqual([]));
const origin = "http://127.0.0.1:3033";
const login = async (page, role = "staff") => {
  await page.goto("/admin/login");
  await page.getByLabel("Email akun internal", { exact: true }).fill(process.env[role === "owner" ? "QA_AUTH_OWNER_EMAIL" : "QA_AUTH_STAFF_EMAIL"]);
  await page.getByLabel("Password", { exact: true }).fill(process.env.QA_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/, { timeout: 15000 });
};

const create=async page=>{const r=await page.request.post('/api/cms/catalog',{headers:{origin},data:{}});expect(r.ok()).toBe(true);return r.json()};
const act=async(page,name)=>{await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:'Konfirmasi',exact:true}).click()};
const edit=async page=>{
 await page.getByLabel('Nama kategori * (wajib)',{exact:true}).fill('QA kategori sederhana');await page.getByRole('button',{name:'Tambah kategori',exact:true}).click();
 await page.getByLabel('Nama produk * (wajib)',{exact:true}).fill('QA produk sederhana');await page.getByLabel('Harga (Rp) * (wajib)',{exact:true}).fill('25000');await page.getByLabel('Kategori produk * (wajib)',{exact:true}).selectOption({index:1});
};
test('anonymous catalog remains protected',async({page})=>{await page.goto('/admin/catalog');await expect(page).toHaveURL(/\/admin\/login$/);expect((await page.request.get('/api/cms/catalog')).status()).toBe(401)});
test('Staff adds category and product locally then saves names and default price once',async({page},info)=>{
 await login(page);const initial=await create(page);const id=initial.revision.id;await page.goto('/admin/catalog/'+id);await edit(page);
 const before=await(await page.request.get('/api/cms/catalog/'+id)).json();expect(before.categories).toHaveLength(0);expect(before.products).toHaveLength(0);
 await expect(page.getByRole('button',{name:'Kirim untuk review',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Simpan semua perubahan',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Semua perubahan tersimpan.');
 const saved=await(await page.request.get('/api/cms/catalog/'+id)).json();expect(saved.products).toHaveLength(1);expect(saved.productVariants[0].basePrice).toBe(25000);expect(saved.productTranslations.map(row=>row.locale)).toEqual(['id']);
 await page.getByRole('button',{name:'Pratinjau katalog',exact:true}).click();await expect(page.locator('main')).toContainText('QA produk sederhana');expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('simple-catalog.png'),fullPage:true});await act(page,'Kirim untuk review');await expect(page.locator('main')).toContainText('Menunggu review');
 expect((await page.request.post('/api/cms/catalog/'+id+'/actions',{headers:{origin},data:{action:'approve',data:{revisionId:id,expectedVersion:saved.revision.version,expectedHash:'a'.repeat(64)}}})).status()).toBe(403);
});
test('Owner sees readiness errors beside buttons then can approve and publish a simple catalog',async({page})=>{
 await login(page,'owner');const initial=await create(page),id=initial.revision.id;await page.goto('/admin/catalog/'+id);
 await page.getByRole('button',{name:'Setujui',exact:true}).click();await expect(page.getByRole('status')).toContainText('Lengkapi isian wajib');await expect(page.getByRole('heading',{name:'Katalog belum lengkap',exact:true})).toBeVisible();
 await edit(page);await page.getByRole('button',{name:'Simpan semua perubahan',exact:true}).click();await expect(page.getByRole('status')).toContainText('tersimpan');
 await act(page,'Setujui');await expect(page.locator('main')).toContainText('Sedang tampil di publik');
 await page.goto('/id/menu');await expect(page.locator('main')).toContainText('QA produk sederhana');
});
