# Tiny Osaka

Website Tiny Osaka memiliki beranda dan halaman pendukung bilingual dengan konten
contoh. Suite otomatis Phase 1C lulus setelah perbaikan aksesibilitas; review
manual dan gate keamanan/release tetap terbuka.
Website ini masih merupakan pratinjau development, belum siap dirilis.

## Prasyarat

- Node.js 22.x, minimal 22.16.0 (environment awal: 22.16.0).
- npm 10.x (environment awal: 10.9.2).
- Git.

Aplikasi berjalan melalui Node.js; Apache/PHP dari XAMPP tidak diperlukan.
PostgreSQL dan environment variable belum dibutuhkan pada Phase 0.

## Stack

- Next.js 16.4.1, App Router.
- JavaScript/JSX, React dan React DOM 19.3.1.
- Tailwind CSS dan plugin PostCSS 4.3.3, PostCSS 8.5.30.
- ESLint 10.12.0 dan eslint-config-next 16.4.1. Pemeriksaan peer dependency
  belum lulus; lihat hasil upgrade di bawah.

Dependency langsung memakai versi exact; dependency transitif dikunci dalam
`package-lock.json`. Headless UI akan ditambahkan saat komponen interaktif pertama
membutuhkannya, dengan persetujuan fase terkait.

## Menjalankan development

```powershell
npm ci
npm.cmd run dev -- --hostname=127.0.0.1
```

Buka http://127.0.0.1:3000/id atau http://127.0.0.1:3000/en.
Route `/` diarahkan sementara (307) ke `/id`. Hentikan server dengan Ctrl+C.

## Verifikasi

```powershell
npm ls --depth=0
npm run lint
npm run build
npm audit
git diff --check
git status --short --branch
```

Untuk memeriksa hasil build, hentikan dev server lalu jalankan:

```powershell
npm.cmd run start -- --hostname=127.0.0.1
```

Periksa beranda kedua bahasa, styling, HTML hasil server, `lang="id"`/`lang="en"`,
serta metadata robots `noindex, nofollow`. Tidak ada font, gambar, analytics,
atau API eksternal yang diperlukan halaman ini. Lint dijalankan terpisah dari build.

Perintah server di atas memakai `npm.cmd` agar forwarding argument konsisten pada
Windows PowerShell. Pada Linux/macOS, gunakan `npm` sebagai penggantinya.

Unit, integration, Playwright E2E, dan Lighthouse belum disiapkan pada bootstrap.
Quality gate lengkap dalam `docs/SECURITY_AND_QA.md` tetap wajib sebelum release.
Audit dependency bukan pengganti review keamanan; jangan menjalankan perbaikan
dependency otomatis tanpa meninjau perubahan.

### Hasil verifikasi ulang sebelum upgrade ESLint — 15 Oktober 2026

Verifikasi dilakukan pada branch `chore/phase0-verification`, dengan Node.js
22.16.0 dan npm 10.9.2. SHA-256 `package.json` dan `package-lock.json` sebelum
dan sesudah instalasi sama; versi dependency tidak diubah.

| Pemeriksaan | Hasil aktual |
| --- | --- |
| `npm.cmd ci` | Berhasil pada percobaan ulang; 359 paket diinstal. Percobaan pertama gagal `EPERM` karena file native terkunci ketika dev server berjalan. Proses Node dengan path Tiny Osaka dihentikan sebelum mencoba ulang. |
| `npm.cmd ls --depth=0` | Exit 0; dependency langsung sesuai versi, tetapi enam paket tetap ditandai `extraneous` setelah instalasi bersih. |
| `npm.cmd explain braces` | Mengonfirmasi `braces@3.0.3` pada rantai dependency development di bawah. |
| `npm.cmd run lint` | Lulus, exit 0. |
| `npm.cmd run build` | Lulus, exit 0; route `/` dan `/_not-found` dihasilkan statis. |
| `npm.cmd audit --json` | Exit 1; lima entri severity tinggi pada satu rantai dependency development. |
| `npm.cmd audit --omit=dev --json` | Lulus, exit 0; nol kerentanan terlapor pada dependency production. |
| Pemeriksaan HTML hasil build | `lang="id"`, robots `noindex, nofollow`, teks Tiny Osaka, dan referensi stylesheet tersedia. |
| `git diff --check` | Lulus, exit 0. |

Enam paket `extraneous`: `@emnapi/core`, `@emnapi/runtime`,
`@emnapi/wasi-threads`, `@img/sharp-wasm32`, `@napi-rs/wasm-runtime`, dan
`@tybys/wasm-util`. Penyebabnya belum dipastikan; instalasi bersih tidak
menghilangkan laporan tersebut. Tidak dilakukan prune atau perubahan lockfile.

ESLint 9.39.5 tetap memberikan peringatan sudah tidak didukung. Lima entri audit
berasal dari rantai `eslint-config-next → @next/eslint-plugin-next → fast-glob →
micromatch → braces`, terkait
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Saran npm adalah downgrade `eslint-config-next` ke 14.2.35; saran ini tidak
diterapkan karena kompatibilitas dengan Next.js 16.4.1 belum diverifikasi.
Tidak menjalankan `npm audit fix` atau `npm audit fix --force`.

Unit, integration, Playwright E2E, Lighthouse, pemeriksaan visual browser,
dan pemeriksaan HTTP dev/production server belum dijalankan pada verifikasi
ulang ini. Pemeriksaan HTML dilakukan pada file hasil build, bukan melalui
browser. Dev server yang dihentikan belum dijalankan kembali; gunakan perintah
development di atas bila diperlukan.

Bootstrap ini belum memenuhi gate keamanan release. Audit production tanpa
temuan bukan bukti seluruh aplikasi aman. Langkah berikutnya adalah meninjau
toolchain lint yang masih didukung dan solusi rantai dependency rentan;
perubahan dependency memerlukan rencana dan persetujuan terpisah.

Untuk membatalkan pembaruan dokumentasi verifikasi ini, hapus hanya subsection
hasil verifikasi ulang dan pulihkan paragraf temuan verifikasi awal dari diff
yang ditinjau. Jangan memulihkan seluruh README dari `HEAD`, karena perubahan
bootstrap README sudah ada sebelum verifikasi ulang ini. Instalasi lokal dapat
diulang dengan `npm.cmd ci` memakai lockfile yang sama.

### Hasil upgrade ESLint — 15 Oktober 2026

Upgrade terbatas yang disetujui dijalankan pada branch
`chore/phase0-verification`: `npm.cmd install --save-dev --save-exact
eslint@10.12.0`. Instalasi berhasil (exit 0), dengan peringatan
`ERESOLVE overriding peer dependency`. Tidak memakai `--force` atau
`--legacy-peer-deps`.

Perubahan file: `package.json` mem-pin ESLint 10.12.0, `package-lock.json`
memperbarui resolusi dependency, dan README mencatat hasil aktual.
`eslint.config.mjs` tetap memakai `eslint-config-next/core-web-vitals`.
Versi dependency langsung lainnya tetap sama. Kode website dan metadata SEO
tidak diubah; halaman development tetap menggunakan `noindex`.

| Pemeriksaan sesudah upgrade | Hasil aktual |
| --- | --- |
| `npm.cmd ls eslint --all` | Gagal, exit 1 (`ELSPROBLEMS`): ESLint 10.12.0 ditandai `invalid` terhadap peer range tiga plugin. |
| `npm.cmd run lint` | Lulus, exit 0. |
| `npm.cmd run build` | Lulus, exit 0; route `/` dan `/_not-found` dihasilkan statis. |
| `eslint --print-config src/app/page.jsx` | Aturan Next.js `no-img-element` dan aksesibilitas `alt-text` aktif sebagai warning; `react-hooks/rules-of-hooks` aktif sebagai error. |
| Uji stdin Next.js | Contoh `<img>` dengan alt memicu `@next/next/no-img-element`; exit 1 sesuai harapan dengan `--max-warnings=0`. |
| Uji stdin React Hooks | Pemanggilan `useState` bersyarat memicu `react-hooks/rules-of-hooks`; exit 1 sesuai harapan. |
| Uji stdin aksesibilitas | Contoh `<img>` tanpa alt memicu `jsx-a11y/alt-text`; exit 1 sesuai harapan dengan `--max-warnings=0`. |
| `npm.cmd audit --json` | Exit 1; tetap lima entri severity tinggi pada rantai dependency development yang sama. |
| `npm.cmd audit --omit=dev --json` | Lulus, exit 0; nol kerentanan production terlapor. |
| `git diff --check` | Lulus, exit 0. |

Konfigurasi efektif dibaca ulang memakai parser JSON Node.js setelah
`ConvertFrom-Json` Windows PowerShell gagal menangani key `ai` dan `AI` pada
output konfigurasi. Ketiga uji pelanggaran hanya menggunakan stdin; tidak
menambahkan kode uji ke website. Lockfile hanya berisi satu instalasi ESLint,
versi 10.12.0; tidak ada ESLint 9 tersarang.

Plugin `eslint-plugin-import@2.32.0`, `eslint-plugin-jsx-a11y@6.10.2`, dan
`eslint-plugin-react@7.37.5` belum mencantumkan ESLint 10 dalam peer range.
Lint dan uji aturan yang berhasil tidak membuktikan seluruh aturan kompatibel.
Instalasi bersih `npm ci` belum diulang setelah upgrade ini. Unit, integration,
Playwright E2E, Lighthouse, dan pemeriksaan browser/HTTP juga belum dijalankan.

Upgrade menghapus pemakaian langsung ESLint 9 yang tidak didukung, tetapi belum
memenuhi gate dependency dan keamanan release. Langkah berikutnya memerlukan
review kompatibilitas peer dependency dan solusi upstream untuk rantai `braces`;
tidak ada perubahan plugin tambahan, pengurangan aturan, atau pengecualian audit
yang diterapkan.

Rollback upgrade: gunakan salinan `package.json` dan `package-lock.json` sebelum
upgrade bila tersedia, lalu jalankan `npm.cmd ci`. Tanpa salinan lockfile tersebut,
`npm.cmd install --save-dev --save-exact eslint@9.39.5` mengembalikan versi langsung
sebelumnya tetapi melakukan resolusi ulang, sehingga bukan pemulihan lockfile
yang identik. Pulihkan hanya perubahan dokumentasi tahap upgrade ini. Jangan
menggunakan `git restore` terhadap seluruh README atau menghapus file untracked;
baseline bootstrap belum di-commit. Rollback belum dijalankan.

### Percobaan instalasi bersih setelah upgrade — 15 Oktober 2026

Keputusan sementara untuk development telah disetujui; lihat
[ADR-001](docs/DECISIONS.md#adr-001--toolchain-lint-sementara-untuk-development).
Keputusan ini tidak meluluskan gate keamanan release atau memberi izin deploy.

`npm.cmd ci` dijalankan dengan Node.js 22.16.0 dan npm 10.9.2 pada branch
`chore/phase0-verification`. Hasil: gagal, exit 1, `EPERM` ketika menghapus
`node_modules/lightningcss-win32-x64-msvc/lightningcss.win32-x64-msvc.node`.
File kemungkinan sedang digunakan; proses penguncinya belum diperiksa pada
percobaan ini. Peringatan peer dependency ketiga plugin juga muncul sebelum
kegagalan. Tidak memakai `--force`/`--legacy-peer-deps`, tidak menghentikan
proses, dan tidak mencoba ulang, sesuai rencana berhenti bila instalasi gagal.

SHA-256 sebelum dan sesudah percobaan tetap sama:

| File | SHA-256 |
| --- | --- |
| `package.json` | `668C4D5CB7441A78AE7C4FE2F88B11DE32C73598274305B5A7DECB7638A10C27` |
| `package-lock.json` | `E6C48E652CA4C44AFB481EE94E258F0355CB60BBFC9F8FB4C5647DF3D34181A9` |

`npm.cmd ls eslint --all`, lint, build, dan kedua audit tidak dijalankan ulang
setelah kegagalan ini. Hasil lulus lint/build dan hasil audit pada subsection
upgrade adalah hasil sebelumnya, bukan verifikasi instalasi bersih terbaru.
`git diff --check` setelah pembaruan dokumentasi lulus. Unit, integration,
Playwright E2E, Lighthouse, dan browser/HTTP tidak dijalankan pada tahap ini.

`npm ci` dapat menghapus sebagian dependency sebelum gagal; kondisi
`node_modules` setelah percobaan ini belum dianggap tervalidasi. Langkah
pemulihan yang perlu direncanakan adalah mengidentifikasi dan menghentikan
proses lokal Tiny Osaka yang mengunci file, lalu mencoba ulang `npm.cmd ci`
dari lockfile yang sama dan menjalankan pemeriksaan yang tertunda.

Tahap ini hanya mengubah README dan `docs/DECISIONS.md`; kode website,
konfigurasi lint, manifest, lockfile, dan SEO tidak diubah. Tidak ada commit,
push, atau deployment. Rollback dokumentasi cukup menghapus subsection ini
dan ADR-001, dengan mempertahankan seluruh perubahan sebelumnya. Penghapusan
catatan tidak memulihkan dependency lokal yang mungkin sudah terhapus.

## Phase 1A — beranda bilingual (15 Oktober 2026)

Lingkup disetujui: beranda `/id` dan `/en`, header/footer, pemilih bahasa,
hero, tiga slot menu contoh, pengantar restoran, dan informasi pemesanan.
Semua konten halaman dirender server-side. Warna krem/merah/arang dikunci
dalam kode. Wordmark dan visual tipografi adalah placeholder desain, bukan
logo asli atau foto produk. Data contoh terpisah dalam `fixtures/menu.js`.
Tidak ada harga, bahan, rating, diskon, jam buka, atau tautan merchant rekaan.
GoFood/GrabFood ditampilkan sebagai informasi tautan yang belum tersedia,
bukan tombol pemesanan aktif. Tidak ada CMS, database, checkout, atau tracking.

Root layout dipindah ke `src/app/[locale]/layout.jsx` agar atribut bahasa HTML
sesuai route. Locale selain `id`/`en` ditolak. Header memakai tautan anchor
yang tetap tampil dan membungkus pada mobile, tanpa menu JavaScript tambahan.
Halaman tetap `noindex`; canonical/hreflang metadata produksi dan sitemap
menunggu domain serta tahap SEO. Link pemilih bahasa memiliki `hreflang`.

### Verifikasi Phase 1A

- `npm.cmd ci`: berhasil, exit 0; 350 paket diinstal. Peringatan peer dependency
  tetap muncul dan audit bawaan instalasi tetap melaporkan lima entri high.
  Hash SHA-256 manifest/lockfile tetap sama dengan catatan sebelum pemulihan.
- `npm.cmd run lint`, `npm.cmd run build`, `git diff --check`: lulus, exit 0.
- Start pada port 3000 gagal `EADDRINUSE`; pemeriksaan build memakai
  `npm.cmd run start -- --hostname=127.0.0.1 --port=3001` dan berhasil.
- HTTP melalui Node fetch: `/` = 307 ke `/id`; `/id` dan `/en` = 200 dengan
  judul lokal, satu H1, `lang` sesuai bahasa dan `noindex, nofollow`;
  `/fr` dan `/id/missing` = 404. Tidak ditemukan tautan HTTP eksternal pada beranda.
- Chrome headless melalui DevTools Protocol: tidak ada overflow horizontal
  pada ID 1440/390px dan EN 320/390px; seluruh stylesheet termuat dan
  semua anchor menunjuk elemen yang tersedia. Screenshot ID desktop dan mobile
  ditinjau secara visual. Pemilih bahasa bekerja dua arah, anchor menu dan
  kembali ke atas bekerja. Urutan Tab mencakup skip link, brand, navigasi,
  pemilih bahasa dan CTA. Skip link menerima fokus terlihat (outline solid)
  dan Enter memindahkan fokus ke konten utama. Tidak ada runtime exception
  aplikasi teramati. Skrip pemeriksaan awal memiliki kesalahan escaping pada
  evaluasi klik; pemeriksaan klik diulang dengan ekspresi yang diperbaiki dan lulus.
- Unit/integration, Playwright E2E, Lighthouse, screen reader, dan audit lengkap
  terpisah tidak dijalankan pada tahap ini. QA Chrome bukan pengganti Playwright
  Phase 1C. Masalah peer dependency dan keamanan sebelumnya belum selesai;
  gate release tetap terbuka. Phase 1B/1C belum diimplementasikan.

### Rollback Phase 1A

Salinan sebelum perubahan tersedia lokal di
`C:\Users\Lenovo\AppData\Local\Temp\tiny-osaka-phase1a-c4cec42cff1e44c79cc542a33a51f424`.
Salinan ini sementara dan tidak menjadi backup permanen. Pulihkan hanya
`next.config.mjs`, `src/app/layout.jsx`, `src/app/page.jsx`,
`src/styles/globals.css`, README dan `docs/DECISIONS.md` dari salinan tersebut.
Hapus hanya file baru Phase 1A: `src/app/[locale]/layout.jsx`,
`src/app/[locale]/page.jsx`, `src/features/public-site/content.js`,
`src/features/public-site/fixtures/menu.js`, serta kedua komponen header/footer.
Pertahankan `jsconfig.json`, package/lockfile, dan semua file bootstrap lainnya.
Jangan menggunakan pembersihan massal atau mengembalikan seluruh working tree
ke HEAD, karena baseline belum di-commit. Tinjau perbedaan sebelum pemulihan.

## Phase 1B — halaman pendukung (15 Oktober 2026)

Halaman baru memakai desain 1A dan konten server-rendered. Rute berikut tersedia
dengan prefix `/id` dan `/en`, memakai slug yang sama untuk kedua bahasa:

| Rute setelah locale | Isi |
| --- | --- |
| `/menu` | Daftar tiga slot contoh |
| `/menu/sample-01`, `/menu/sample-02`, `/menu/sample-03` | Detail contoh, informasi produk yang belum tersedia, dan slot terkait |
| `/about` | Pengantar restoran dengan cerita lengkap yang belum tersedia |
| `/guides` | Daftar template panduan |
| `/guides/takoyaki`, `/guides/okonomiyaki`, `/guides/burger` | Template editorial, bukan artikel final atau resep |
| `/promos` | Placeholder informasi promo/event; tidak menyatakan status promo di platform merchant |
| `/location` | Kota dan layanan yang diketahui; alamat, jam, dan cakupan menunggu verifikasi |

Header, footer, CTA beranda, kartu menu, breadcrumb, dan link terkait terhubung
ke halaman yang tersedia. Pemilih bahasa memakai Client Component kecil dengan
`usePathname`, mempertahankan route halaman/detail saat berganti ID/EN.
Data contoh tetap terpisah dalam fixtures. Semua halaman memiliki satu H1,
judul/deskripsi lokal, `lang` sesuai locale dan `noindex, nofollow`.
Tidak ada schema Restaurant/LocalBusiness atau tautan merchant rekaan.
Domain, canonical/hreflang metadata produksi, sitemap, artikel final, konten
katalog resmi, CMS, filter katalog, dan integrasi merchant tetap belum tersedia.
Tidak menambah dependency; hash manifest/lockfile sama dengan sebelum 1B.

### Verifikasi Phase 1B

- `npm.cmd run lint`, `npm.cmd run build`, `git diff --check`: lulus, exit 0.
- Start awal di port 3001 gagal `EADDRINUSE` karena server 1A masih berjalan;
  HTTP awal `/id/menu` merespons 404 dari server lama. Penghentian proses Node
  dengan path repo diulang, lalu `npm.cmd run start -- --hostname=127.0.0.1
  --port=3001` berhasil. Beberapa proses turunan keluar saat dihentikan;
  pemeriksaan HTTP berikut dijalankan pada server build 1B terbaru.
- Skrip assertion Node via stdin: 24 halaman ID/EN = 200; 24 judul unik,
  deskripsi tersedia, tepat satu H1, `lang` benar dan `noindex, nofollow`.
  Delapan rute invalid = 404; `/` tetap 307 ke `/id`. Sebanyak 26 tujuan tautan
  internal (termasuk anchor lintas halaman) valid. Tidak ditemukan tautan HTTP
  eksternal atau JSON-LD pada 24 halaman yang diperiksa. Semua assertion lulus.
- Chrome headless melalui DevTools Protocol: 24 halaman pada lebar 320, 390,
  dan 1440px (72 kombinasi) tanpa overflow horizontal, ID ganda, atau anchor
  lokal putus. Stylesheet termuat dan tujuan pemilih bahasa sesuai pathname.
  Dua arah pemilih bahasa diuji pada seluruh 12 jenis halaman (termasuk tiga
  produk dan tiga panduan) dan lulus. Skip link melalui Tab/Enter memiliki
  outline terlihat dan memindahkan fokus ke main; navigasi breadcrumb dan
  footer juga lulus. Tidak ada runtime exception aplikasi teramati.
- Screenshot menu desktop, detail produk mobile, dan panduan mobile ditinjau
  visual; screenshot lokasi mobile juga diambil. Tidak ada dependency test
  baru atau file pengujian permanen ditambahkan.
- Unit/integration, Playwright E2E, Lighthouse, screen reader dan audit dependency
  terbaru tidak dijalankan pada tahap ini. Pemeriksaan Chrome ini bukan pengganti
  Playwright Phase 1C. Temuan peer dependency dan keamanan sebelumnya tetap
  terbuka; website belum memenuhi gate release.

### File dan rollback Phase 1B

Salinan delapan file existing sebelum 1B tersedia sementara di
`C:\Users\Lenovo\AppData\Local\Temp\tiny-osaka-phase1b-49c587828a544ceb9dba0c55379960c4`:
`src/app/[locale]/page.jsx`, `src/features/public-site/content.js`,
`src/features/public-site/fixtures/menu.js`, komponen `SiteHeader.jsx` dan
`SiteFooter.jsx`, `src/styles/globals.css`, README, dan `docs/DECISIONS.md`.
Untuk rollback, tinjau lalu pulihkan hanya file tersebut dan hapus hanya 13
file baru berikut:

- Tujuh route `page.jsx`: `[locale]/menu`, `[locale]/menu/[slug]`,
  `[locale]/about`, `[locale]/guides`, `[locale]/guides/[slug]`,
  `[locale]/promos`, `[locale]/location` di bawah `src/app/`.
- `src/features/public-site/page-content.js` dan `fixtures/guides.js`.
- Empat komponen di `src/features/public-site/components/`:
  `LanguageSwitcher.jsx`, `PageIntro.jsx`, `MenuCard.jsx`, `OrderingNotice.jsx`.

Pertahankan seluruh baseline 1A, package/lockfile, dan file untracked lainnya.
Jangan memakai pembersihan massal working tree. Backup lokal bersifat sementara,
bukan backup permanen. Tidak ada commit, push, atau deployment pada tahap ini.

## Phase 1C — suite E2E dan aksesibilitas

Alat development dipin ke `@playwright/test@1.64.1` (Apache-2.0) dan
`@axe-core/playwright@4.14.0` (MPL-2.0). Keduanya mendukung Node.js 22.16.0.
Pengujian memakai Chromium yang diunduh Playwright, bukan Chrome sistem.

Setup awal setelah dependency terinstal:

```powershell
.\node_modules\.bin\playwright.cmd install chromium
```

Jalankan dari root repo:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

`test:e2e` membutuhkan build terbaru; tidak melakukan build secara otomatis.
Playwright menjalankan `next start` di `127.0.0.1:3030` dan menghentikan server
pengujian setelah run. Server yang sudah memakai port tersebut tidak digunakan
ulang; kosongkan port atau hentikan proses yang telah diidentifikasi sebelum
mencoba ulang. Tidak ada parameter untuk mengganti target dengan URL produksi.
Server preview 3000/3001/3002 tidak digunakan oleh suite ini.

Tiga project Chromium: desktop 1440x1000, mobile 390x844, dan small-mobile
320x740. Ada 222 kasus yang ditemukan melalui `playwright test --list`:
route/metadata, navigasi, bahasa, dan aksesibilitas. Konfigurasi memakai dua
worker lokal/satu worker CI, tanpa retry dan menolak `test.only`.

- `public-routes.spec.js`: 24 halaman ID/EN, konten HTML server, judul/deskripsi
  lokal, noindex, H1, link/anchor internal, redirect root, dan 404 invalid route.
- `navigation.spec.js`: CTA ke menu/detail, placeholder informasi produk dan
  merchant, navbar promo/event, panduan melalui footer, breadcrumb, anchor
  pemesanan, serta pemilih bahasa pada seluruh route.
- `accessibility.spec.js`: overflow, ID ganda, axe WCAG A/AA termasuk tag 2.1/2.2,
  skip link, fokus terlihat dan navigasi keyboard ke promo.
- `fixtures.js`: menolak HTTP(S)/WebSocket browser di luar server lokal,
  memblokir service worker melalui config, dan melaporkan runtime exception.
  Hasil tidak mengklaim pembatasan jaringan seluruh OS atau proses server.

Laporan tersedia di `playwright-report/index.html` dan `test-results/results.json`.
Screenshot serta trace disimpan untuk kegagalan; hasil axe yang gagal atau
inconclusive dilampirkan. Kedua direktori output diabaikan Git dan ESLint.
Untuk melihat laporan, jalankan:

```powershell
.\node_modules\.bin\playwright.cmd show-report
```

Axe bukan bukti kepatuhan aksesibilitas menyeluruh. Temuan `incomplete` perlu
review manual; unit/integration domain CMS, Lighthouse, screen reader,
Firefox/WebKit dan seluruh gate release belum tercakup tahap ini.

### Hasil awal Phase 1C — 15 Oktober 2026

| Pemeriksaan | Hasil aktual |
| --- | --- |
| Instalasi dua dependency exact | Berhasil, exit 0; peringatan peer ESLint sebelumnya tetap muncul. |
| `playwright install chromium` | Berhasil, exit 0; Chromium/headless shell v1248 dan komponen pendukung diunduh ke cache Playwright lokal. |
| `npm.cmd run lint` | Lulus setelah callback fixture `use` diganti nama menjadi `runTest`; nama lama terdeteksi sebagai React Hook dalam try/catch. Tidak ada aturan lint dinonaktifkan. |
| `npm.cmd run build` | Lulus, exit 0; halaman publik tetap statis. |
| `playwright test --list` | 222 test di tiga file, exit 0. |
| `npm.cmd run test:e2e` | Gagal, exit 1; 150 passed, 72 failed, 0 skipped/flaky, durasi sekitar 157 detik. |
| `npm.cmd audit --json` | Exit 1; lima entri high development pada rantai yang sama seperti sebelumnya. |
| `npm.cmd audit --omit=dev --json` | Lulus, exit 0; nol kerentanan production terlapor. |
| `git diff --check` | Lulus, exit 0. |

Seluruh 72 kegagalan berasal dari scan axe (24 halaman x tiga viewport):

- `label-content-name-mismatch`: 72 scan menemukan accessible name wordmark
  tidak sesuai dengan teks terlihat.
- `color-contrast`: 54 scan menemukan angka besar `.slot-number` yang terlalu
  transparan; rasio contoh 1.49–1.97:1, di bawah syarat 3:1 untuk teks besar.

150 kasus lainnya lulus: 84 route/metadata, 48 navigasi dan pergantian bahasa,
serta 18 keyboard. Tidak ada laporan koneksi browser eksternal atau runtime
exception. Pemeriksaan axe menyertakan 72 entri `incomplete` terkait karakter
panah dekoratif; ini bukan tambahan jumlah test gagal dan perlu review manual.
Peringatan terminal `NO_COLOR`/`FORCE_COLOR` juga muncul dan bukan penyebab gagal.

Tidak ada perubahan kode produk pada tahap 1C. Perbaikan CSS angka placeholder
dan accessible name header memerlukan persetujuan lingkup terpisah. Tidak ada
aturan axe dinonaktifkan atau temuan yang disembunyikan. Instalasi bersih setelah
penambahan dependency, unit/integration CMS, Lighthouse, screen reader,
Firefox/WebKit dan pemeriksaan keamanan menyeluruh belum dijalankan.
Pada run awal ini, Phase 1C belum memenuhi acceptance; lihat hasil perbaikan
berikut untuk status pengujian terbaru. Website belum siap release.

### Verifikasi ulang setelah perbaikan aksesibilitas — 15 Oktober 2026

Perbaikan dua file produk telah disetujui secara terpisah: opacity `.slot-number`
di `src/styles/globals.css` dinaikkan dari `.28` ke `.75`, dan `aria-label`
redundan wordmark pada `SiteHeader.jsx` dihapus agar nama aksesibel mengikuti
teks link yang terlihat. Stamp dekoratif tetap `aria-hidden`.
Tidak ada aturan lint/axe, test, dependency atau metadata SEO yang diubah.

| Pemeriksaan ulang | Hasil aktual |
| --- | --- |
| `npm.cmd run lint` | Lulus, exit 0. |
| `npm.cmd run build` | Lulus, exit 0. |
| `npm.cmd run test:e2e` | Lulus, exit 0; 222 passed, 0 failed/skipped/flaky, durasi sekitar 98 detik. |
| Scan axe dalam suite | 72 scan, nol pelanggaran; kedua temuan sebelumnya tidak muncul lagi. |
| `git diff --check` | Lulus, exit 0. |

Tidak ada laporan runtime exception atau koneksi browser eksternal. Sebanyak
72 entri axe `incomplete` terkait kontras karakter panah dekoratif masih
dilampirkan untuk review manual, bukan dianggap pelanggaran otomatis yang
sudah dipastikan. Hasil automated suite tidak membuktikan kepatuhan
aksesibilitas menyeluruh. Lighthouse, screen reader, Firefox/WebKit,
unit/integration domain CMS dan gate keamanan release tetap belum selesai.
Audit tidak diulang pada perbaikan dua file ini karena dependency tidak berubah;
temuan lima entri high development dan peer dependency sebelumnya masih terbuka.

Laporan terbaru ada di `playwright-report/index.html` dan `test-results/results.json`.
Salinan file sebelum perbaikan dan JSON laporan awal (150 passed/72 failed)
tersedia sementara di
`C:\Users\Lenovo\AppData\Local\Temp\tiny-osaka-phase1c-fix-33949a8d9c71448f908c118eab14b087`.
Untuk rollback perbaikan ini saja, pulihkan `src/styles/globals.css`,
`src/features/public-site/components/SiteHeader.jsx`, README dan
`docs/DECISIONS.md` dari salinan tersebut. Suite Phase 1C tetap dipertahankan.
Rollback mengembalikan dua temuan aksesibilitas lama; tidak dijalankan.
Tidak ada commit, push atau deployment pada tahap ini.

### Rollback Phase 1C

Salinan tujuh file existing sebelum tahap ini tersedia sementara di
`C:\Users\Lenovo\AppData\Local\Temp\tiny-osaka-phase1c-d1a65483bb384c819441b5946ad008e6`.
Pulihkan hanya `package.json`, `package-lock.json`, `.gitignore`,
`eslint.config.mjs`, README, `docs/SECURITY_AND_QA.md` dan `docs/DECISIONS.md`.
Hapus hanya file baru `playwright.config.mjs` dan empat file di `tests/e2e/`
yang disebutkan di atas. Instalasi dependency lama dapat dipulihkan dengan
`npm.cmd ci` setelah proses pengunci lokal dihentikan. Browser cache global
tidak dihapus otomatis. Pertahankan semua perubahan website 1A/1B/navbar dan
file untracked lainnya; jangan memakai pembersihan massal working tree.

## Struktur

```text
src/
  app/
    [locale]/
      layout.jsx
      page.jsx
      about/page.jsx
      menu/page.jsx
      menu/[slug]/page.jsx
      guides/page.jsx
      guides/[slug]/page.jsx
      promos/page.jsx
      location/page.jsx
  features/
    public-site/
      content.js
      page-content.js
      components/
        SiteHeader.jsx
        SiteFooter.jsx
        LanguageSwitcher.jsx
        PageIntro.jsx
        MenuCard.jsx
        OrderingNotice.jsx
      fixtures/
        menu.js
        guides.js
  styles/
    globals.css
```

Alias `@/*` mengarah ke `src/*`. Modul berbasis fitur dibuat ketika implementasinya
dimulai, mengikuti arsitektur yang disetujui.

## Batas Phase 0

CMS, schema database, authentication, merchant integration,
dan katalog bisnis resmi belum diimplementasikan. Routing bilingual beranda
ditambahkan pada Phase 1A, dengan halaman pendukung pada Phase 1B di atas.
Tidak ada secret atau konfigurasi
layanan live. Halaman bootstrap memakai metadata `noindex`; konfigurasi SEO
produksi perlu ditinjau pada fase berikutnya. `noindex` bukan kontrol akses.

`AGENTS.md`, `docs/`, `.agents/skills/`, dan `prompts/` tetap menjadi referensi
proyek. Implementasi ini tidak mencakup commit, push, atau deployment.
`agentRules: false` pada konfigurasi Next.js mencegah dev server menambahkan
instruksi otomatis ke `AGENTS.md`.

## Rollback bootstrap

Tinjau `git status` dan diff sebelum rollback. Pulihkan hanya perubahan README
bootstrap dari Git, lalu hapus hanya file baru Phase 0 yang sudah diidentifikasi,
beserta output lokal `node_modules/` dan `.next/` jika diperlukan. Pertahankan
seluruh dokumentasi/instruksi existing, termasuk yang masih untracked.
Jangan menggunakan pembersihan massal working tree.

## Fondasi ORM lokal (2026-10-15)

Branch: `feat/catalog-data-plan`. Desain katalog ada di
[PHASE2_PLAN.md](docs/PHASE2_PLAN.md); batas implementasi tercatat di ADR-007.
Paket runtime: drizzle-orm 0.45.4, pg 8.23.1, server-only 0.0.1. Paket development:
drizzle-kit 0.31.11. Semuanya dipasang dengan versi exact, tanpa audit fix/force.

`drizzle.config.mjs` menggunakan dialect PostgreSQL dan schema JS/MJS di
`src/server/db/schema.mjs`. Schema masih kosong; belum ada tabel atau migrasi.
`createDatabaseClient` di `src/server/db/client.mjs` khusus server dan baru
membuat pool saat dipanggil; import/build tidak membuka koneksi. Pemakai berikutnya
harus mengatur reuse pool dan memanggil `close()` saat selesai. Pool awal maksimal
dua koneksi; angka ini belum diukur untuk production.

`.env.example` hanya komentar/template tanpa kredensial asli. Role LOGIN belum
dibuat; jangan mengaktifkan placeholder atau memakai akun `postgres`. Setelah
provisioning yang disetujui, simpan DATABASE_URL dan TEST_DATABASE_URL dengan
password berbeda pada file env lokal yang diabaikan Git. Parser menerima
loopback 127.0.0.1 atau ::1 port 5432, nama database sesuai target, dan role
`tiny_osaka_dev_app`/`tiny_osaka_dev_migrator` atau pasangan `_test_`.
URL tambahan/query/fragment ditolak. Pemilihan target test tidak pernah fallback
ke DATABASE_URL. Guard nama bukan pengganti verifikasi privilege PostgreSQL.

Node CLI/Drizzle Kit tidak otomatis membaca `.env.local` seperti Next.js;
berikan environment secara eksplisit setelah akun tersedia. Jangan menaruh
password di argumen command, screenshot, chat atau log. Error validasi hanya
pesan umum, sedangkan penanganan error query saat integrasi nanti tetap perlu
menjaga secret. Tidak ada script migrasi/push/Studio yang ditambahkan.

Verifikasi yang benar-benar dijalankan:

- Instalasi runtime dan Kit berhasil, exit 0; percobaan awal tanpa akses registry
  tidak menghasilkan output dan dihentikan, lalu instalasi diulang dengan akses
  registry. Peringatan peer ESLint lama dan deprecation esbuild-kit tetap ada.
- `node --test tests/unit/db-config.test.mjs`: 7 lulus, 0 gagal/skip. Meliputi
  pemisahan dev/test, URL/role terlarang, pesan error tanpa secret, import
  server-only dan inisialisasi/tutup client serta import config tanpa koneksi.
- `npm exec -- drizzle-kit --version`: Kit 0.31.11 dan ORM 0.45.4.
- `npm run lint` dan `npm run build`: lulus, exit 0; 24 halaman publik tetap
  menggunakan fixture. Keluaran Next "Running TypeScript" tidak menambah source TS.
- `npm audit --json`: gagal, exit 1, 5 high lama + 4 moderate baru melalui
  Drizzle Kit/esbuild. `npm audit --omit=dev`: lulus, 0 kerentanan, exit 0.
  Detail dan advisory ada di [DEPENDENCIES.md](docs/DEPENDENCIES.md).
- `npm run test:e2e`: 222 lulus, 0 gagal/skip/flaky, exit 0 (4,0 menit).
  Worker selesai tetapi teardown server lokal tertahan. Pemeriksaan proses via
  CIM awal ditolak sandbox; pemeriksaan dengan izin tambahan mengidentifikasi
  server test. `Stop-Process` gagal dengan NullReferenceException. Setelah
  `taskkill /PID 33560 /T /F` menutup hanya server milik test ini, runner selesai
  dan menulis laporan. Tidak ada test/rule yang diubah atau dilewati. Teardown
  tanpa intervensi pada lingkungan ini masih perlu diperiksa pada run berikutnya.
- `git diff --check`: lulus; diff kode, dokumentasi dan versi lockfile ditinjau.

Koneksi PostgreSQL nyata, privilege role, schema/migrasi, katalog/CMS, Lighthouse
dan security release lengkap belum diuji. Audit findings belum terselesaikan;
hasil build bukan persetujuan release. Tidak ada perubahan SEO, API merchant,
database, konten publik, commit atau push.

Rollback khusus tahap ini: hapus `.env.example`, `drizzle.config.mjs`, tiga file
di `src/server/db/` dan `tests/unit/db-config.test.mjs`; batalkan empat tambahan
paket, script `test:db-config`, lockfile dan dokumentasi tahap ini saja, lalu
pulihkan dependency tree dari lockfile sebelum instalasi. Pertahankan perubahan
desain 2A yang sudah ada sebelumnya dan seluruh pekerjaan lain. Jangan memakai
reset/clean massal.

## Akun database lokal dan pengujian koneksi (2026-10-15)

ADR-008 mencatat persetujuan untuk script `scripts/setup-local-db.ps1` dan SQL
pendamping. Script dijalankan di terminal Windows interaktif, bukan melalui
input password chat. Masukkan password postgres, atur password unik untuk
`tiny_osaka_dev_app` dan `tiny_osaka_test_app`, lalu masukkan ulang password
aplikasi untuk file env. Gunakan minimal 20 karakter dan password berbeda.
`psql --single-transaction` mencakup pembuatan role, grants dan pengaturan
password SCRAM; pemeriksaan awal menolak role yang sudah ada atau database
yang tidak sesuai baseline.

Role aplikasi hanya mendapat CONNECT ke database masing-masing, tanpa role
membership atau hak membuat database/schema/tabel/role. Database lain dalam
cluster tidak diubah; ini bukan isolasi seluruh cluster. Role ini berbeda dari
akun pengguna CMS yang baru akan ditangani Phase 3. Migrator belum dibuat.

Script membuat `.env.local` (DATABASE_URL) dan `.env.test.local`
(TEST_DATABASE_URL) tanpa overwrite. ACL file kosong lebih dahulu dibatasi
ke SID Windows pengguna yang menjalankan script, kemudian password disimpan.
Admin Windows tetap dapat mengambil alih file; ini bukan enkripsi disk. Env
dan `test-results/local-db-setup-status.json` diabaikan Git. Status hanya memuat
tahap proses/boolean, tanpa password, URL atau verifier. Jangan menampilkan
isi env di chat/log. File tetap berupa plaintext lokal dengan ACL terbatas.

Jalankan hanya setelah rencana provisioning disetujui:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-local-db.ps1
npm.cmd run test:db-connection
```

ExecutionPolicy Bypass hanya berlaku untuk proses script itu. Jangan menjalankan
ulang jika role atau env sudah ada: commit SQL dan penulisan env bukan satu
transaksi. Jika penulisan env/password ulang gagal, role bisa sudah tersedia.
Periksa status dan pulihkan tahap yang gagal tanpa membuat ulang database.

Pemulihan yang tersedia setelah keadaan akun diverifikasi: parameter
`-CompleteExistingRoles` memeriksa dua role aplikasi (LOGIN tanpa privilege
berlebih/membership, CONNECT terpisah), kemudian meminta penetapan ulang
password lewat psql dan penulisan env. Mode ini tidak membuat role/database,
mengubah grants atau menimpa env yang sudah ada. Gunakan hanya untuk menyelesaikan
setup yang terhenti setelah akun dibuat, dengan password baru berbeda 20+ karakter.

`tests/integration/db-connection.test.mjs` berisi empat kasus baca-saja: untuk
masing-masing target, koneksi Drizzle harus memakai role/database yang benar
tanpa privilege berlebih; koneksi langsung driver pg ke database pasangannya
harus gagal dengan SQLSTATE 42501. Tidak ada create/truncate/drop tabel, migrasi,
seed atau panggilan merchant. Kegagalan koneksi tidak mencetak detail error asli.

Verifikasi aktual tahap ini:

- Parser PowerShell dan `node --check` untuk test integrasi: lulus.
- `npm run test:db-config`: 7 lulus; `npm run lint` dan `npm run build`: exit 0.
- Git ignore diperiksa untuk kedua env/status; `git diff --check` lulus.
- Provisioning selesai: status `configured`, kedua role aplikasi dan file env
  tersedia. ACL kedua env: inheritance disabled, satu access rule untuk pengguna
  lokal. Isi secret tidak dicetak dan tidak masuk Git.
- `npm run test:db-connection`: 4 lulus, 0 gagal/skip, exit 0. Drizzle login ke
  database masing-masing, tanpa administrative/CREATE/TEMP/membership privilege;
  PostgreSQL menolak koneksi silang di kedua arah dengan SQLSTATE 42501.
  Percobaan pertama dari sandbox gagal membaca file env privat (Node melaporkan
  not found, Get-Acl unauthorized). Rerun dalam konteks pengguna berizin lulus,
  tanpa mengubah ACL. Ini bukan kegagalan autentikasi database yang masih aktif.
- Setelah env tersedia, `npm run test:db-config` diulang (7 lulus), lint dan
  build diulang (exit 0). Build dijalankan dalam konteks pengguna berizin membaca
  env privat dan tetap menghasilkan 24 halaman publik fixture. Status lokal
  kini `configured` dengan `connectionsVerified: true`. Diff akhir ditinjau;
  `git diff --check` lulus. Kedua env tidak tercatat sebagai tracked files.
- Riwayat setup yang sudah dipulihkan: percobaan awal gagal tanpa penyebab pasti;
  probe baca-saja kemudian lulus. SQL berikutnya membuat role, tetapi env entry
  menolak password kurang dari 20 karakter. Mode CompleteExistingRoles memulihkan
  password/env; ada kegagalan autentikasi postgres di tengah sebelum percobaan
  terakhir berhasil. Diagnostik kini mencatat tahap/exit code/type/baris tanpa
  pesan mentah atau secret. Parser dan konstruksi objek ACL juga lulus.
- E2E/audit tidak diulang: tidak ada perubahan paket atau halaman publik;
  hasil sebelumnya (222 E2E lulus dengan cleanup manual; 5 high/4 moderate dev
  findings, produksi 0) tetap tercatat di atas. Ini bukan hasil pengujian baru.

Rollback: setelah meninjau dependensi role, cabut hanya CONNECT dua akun ini
dan hapus role baru bila aman. Pertahankan database/owner lama. Hapus hanya env,
dua script provisioning, test integrasi, script npm dan dokumentasi tahap ini.
Jangan membatalkan desain/fondasi ORM yang sudah ada. Belum ada commit/push,
migrasi atau perubahan SEO. Koneksi lokal dan pemisahan dua database sudah
terverifikasi; schema katalog, grant tabel, migrator dan migrasi belum dibuat.

## Phase 2B1: schema draft katalog (2026-10-16)

Schema JS di `src/server/db/schema.mjs` kini mendefinisikan tujuh tabel draft:
catalog_revisions, categories, products, category_entries, product_entries,
category_translations dan product_translations. Rincian kontrak ada di
[DATA_CONTRACTS.md](docs/DATA_CONTRACTS.md); keputusan/batas di ADR-009 dan
[rencana migrasi lokal](docs/PHASE2_PLAN.md).

File migrasi untuk review: `drizzle/0000_catalog_foundation.sql`, beserta
`drizzle/meta/0000_snapshot.json` dan `drizzle/meta/_journal.json`. SQL hanya
berisi tujuh CREATE TABLE, enam ADD CONSTRAINT dan satu CREATE INDEX. Relasi
produk/kategori/terjemahan memakai kunci gabungan dengan revision_id; update/
delete parent memakai RESTRICT. Status hanya draft, locale id/en, slug unik
dan berformat huruf kecil/angka/hyphen, title tidak kosong setelah btrim,
version positif dan sort_order nonnegatif.

Belum ada approval/publikasi, perlindungan immutable revision, writer dengan
optimistic concurrency, varian/harga/modifier/media atau halaman berbasis DB.
Kolom version sendiri tidak otomatis menangani konflik edit. Tabel dan constraint
belum diterapkan/diuji di PostgreSQL. Identitas/slug harus dilindungi sebelum
ada revisi live; konten publik tetap fixture dan noindex. Tidak ada seed fakta
restoran, perubahan paket, grant, akun, secret, commit, push atau deploy.

Hasil command aktual:

- `npm exec -- drizzle-kit generate --config=drizzle.config.mjs --name=catalog_foundation`:
  awalnya gagal karena uv_os_get_passwd ENOMEM di sandbox; retry berizin lulus,
  exit 0, menghasilkan tujuh tabel. Tidak memuat env privat atau menjalankan SQL.
- Review manual SQL dan pemeriksaan offline snapshot/journal: lulus, tujuh tabel,
  enam FK RESTRICT, 14 statement penambahan saja. Tidak ada DROP/TRUNCATE/DML.
- Query metadata baca-saja mengonfirmasi 0 tabel katalog tersebut di database
  dev dan test, exit 0; migrasi belum diterapkan ke keduanya.
- `npm run test:db-config`: 7 lulus; `npm run test:db-connection`: 4 lulus,
  masing-masing exit 0. Test koneksi hanya metadata/privilege/koneksi silang,
  bukan test constraint schema baru. File env privat tetap diabaikan Git.
- `npm run lint`, `npm run build`: lulus, exit 0; 24 halaman publik fixture tetap
  dibangun. Build/test koneksi memakai konteks yang berizin membaca env privat.
- `git diff --check`: lulus; diff kode, SQL, metadata dan dokumentasi ditinjau.
- Migrasi, test constraint PostgreSQL, seed, E2E, audit/security/Lighthouse tidak
  dijalankan pada tahap ini. Hasil dan temuan audit sebelumnya tetap berlaku;
  jangan menafsirkan pemeriksaan offline sebagai release approval.

Rollback tahap ini: pulihkan schema.mjs ke entry point kosong sebelumnya, hapus
hanya tiga file migrasi/metadata baru, dan batalkan dokumentasi 2B1 saja. Jangan
menghapus pekerjaan fondasi ORM/design/role sebelumnya atau database. Belum ada
SQL diterapkan sehingga tidak diperlukan rollback DB. Langkah berikutnya perlu
rencana dan persetujuan migrator, migrasi test DB serta pengujian constraint.

## Phase 2B2: migrasi database test (2026-10-16)

Selesai di branch `feat/catalog-data-plan`, sesuai ADR-010. Database
`tiny_osaka_test` kini memiliki tujuh tabel draft katalog dan schema `drizzle`
untuk riwayat migrasi. Database development belum dimigrasikan (query metadata:
0 tabel katalog). Halaman publik masih fixture; SEO tidak berubah.

File baru: `scripts/setup-test-migrator.ps1`/`.sql`, `scripts/lib/test-db.mjs`,
`scripts/migrate-test-db.mjs`, `tests/unit/test-db-guard.test.mjs`, dan
`tests/integration/catalog-constraints.test.mjs`. package.json menambah dua script;
.env.example dan dokumen rencana/keputusan/QA diperbarui. Tidak ada paket baru.

Setup interaktif membuat `tiny_osaka_test_migrator`: LOGIN tanpa superuser/
CREATEDB/CREATEROLE/replication/bypass-RLS, NOINHERIT, CONNECT ke test, membership
owner dengan SET true dan INHERIT/ADMIN false. Password migrator dipilih minimal
20 karakter sebelum SQL, lalu dimasukkan ulang melalui psql. Password postgres
hanya dipakai untuk provisioning interaktif. File `.env.test-migrator.local`
memuat TEST_MIGRATION_DATABASE_URL, diabaikan Git, ACL inheritance disabled dan
satu access rule pengguna lokal. App env/privilege tidak ditambah. Jika setup
terhenti, periksa status tanpa secret di test-results/test-migrator-setup-status.json;
recovery CompleteExistingRole hanya untuk keadaan role yang sudah diperiksa.

Runner memeriksa URL/role/DB, privilege dan membership aktual, lalu SET ROLE
tiny_osaka_test_owner dan search_path public. Hanya migration foundation dengan
SHA-256 `6bae882b3912c8ba1607d38a755f555749e8fd97e2f4685a8da8388d902ee081`
dan journal timestamp yang ditinjau diterima. Hash/riwayat/objek berbeda akan
ditolak. Advisory lock mencegah dua runner ini berjalan bersamaan. Migrasi
Drizzle dan metadata dibuat di dalam transaksi luar; objek dimiliki NOLOGIN
owner. Runner harus ditinjau/diperbarui sebelum migrasi berikutnya ditambahkan.

Command dan hasil aktual:

- Parser PowerShell, `node --check`, dan dua kasus `node --test
  tests/unit/test-db-guard.test.mjs`: lulus. Guard menolak dev, akun aplikasi/
  postgres, host luar, opsi URL dan fallback env yang salah tanpa echo secret.
- Setup migrator awal gagal autentikasi postgres, exit 2, sebelum akun dibuat.
  Percobaan ulang terminal berhasil: status configured, role dan env tersedia.
- `npm run db:migrate:test`: lulus exit 0, tujuh tabel dibuat di test.
- `npm run test:catalog-db`: run awal 7 lulus/1 gagal. Satu kasus RESTRICT
  mengharapkan kode 23503, tetapi PostgreSQL mengembalikan 23001. Ekspektasi test
  diperbaiki sesuai restrict_violation; schema/constraint tidak diubah.
- Rerun terarah dengan `--test-name-pattern="restricts deletion of referenced
  parent rows"`: 1 lulus, 0 gagal/skip, exit 0. Kasus lain tidak diulang; total
  delapan perilaku terverifikasi melalui run awal dan rerun satu kasus itu.
- `npm run db:migrate:test` kedua: exit 0, "already applied; no changes made".
  Riwayat tetap satu migration, hash/ownership cocok. Lint exit 0 dan diff
  whitespace review lulus; query baca-saja dev memastikan 0 tabel katalog.

Kasus database mencakup graph bilingual valid/defaults, duplicate slug/key,
locale/nama kosong, orphan/cross-revision FK, range/status/slug invalid, RESTRICT
delete, aplikasi dilarang SET ROLE/CREATE/read draft, serta semua tabel kosong
dan dimiliki owner setelah rollback. Semua dummy hanya dalam transaksi dengan
SAVEPOINT untuk penolakan yang disengaja; tidak ada seed permanen.

Sesuai permintaan, pemeriksaan lama konfigurasi/koneksi, build, E2E, audit dan
Lighthouse tidak diulang. Full release gates dan temuan 5 high/4 moderate dev
sebelumnya tetap terbuka. CMS approval, immutability, harga/modifier dan migrasi
development belum selesai. Tidak ada merchant call, commit, push atau deploy.

Rollback setelah penerapan: jangan hapus file SQL/snapshot/journal atau riwayat
Drizzle untuk "mengulang" migrasi. Periksa isi tabel dan dependensi role/objek,
lalu buat rencana reverse migration/restore khusus test untuk persetujuan.
Jangan drop database atau CASCADE cleanup. Tidak ada rollback destruktif dijalankan.

## Phase 2B3: migrasi development (2026-10-16)

Lingkup disetujui di feat/catalog-data-plan: akun migrator dev terpisah,
runner khusus dev, dan verifikasi baca-saja. Provisioning interaktif, migrasi dev dan verifikasi baca-saja selesai dan lulus.

File baru: scripts/setup-dev-migrator.ps1/.sql, scripts/lib/dev-db.mjs,
scripts/migrate-dev-db.mjs, scripts/verify-dev-db.mjs dan
tests/unit/dev-db-guard.test.mjs. package.json menambah db:migrate:dev;
.env.example dan dokumen keputusan/rencana/QA diperbarui. Paket tidak berubah.

Urutan perintah setelah test/syntax/lint lulus:

```powershell
powershell.exe -NoProfile -File scripts/setup-dev-migrator.ps1
npm.cmd run db:migrate:dev
npm.cmd run db:migrate:dev
node --env-file=.env.dev-migrator.local --env-file=.env.local scripts/verify-dev-db.mjs
```

Setup meminta password baru migrator minimal 20 karakter, password administrator
PostgreSQL, kemudian pengulangan password migrator melalui psql. Kredensial
tersimpan dalam .env.dev-migrator.local dengan ACL privat dan diabaikan Git.
App tidak mendapat grant tambahan. Runner menolak target selain database dev
lokal, memeriksa privilege nyata, hash/history SQL dan ownership; hanya foundation
ini yang diterima. Pengulangan valid tidak menerapkan ulang migration.

Hasil aktual: dua kasus node --test tests/unit/dev-db-guard.test.mjs
lulus; node --check ketiga script MJS dan parser PowerShell lulus. Hash SQL sesuai
foundation yang ditinjau; git check-ignore mengonfirmasi env dev migrator diabaikan.
npm.cmd run lint dan lint khusus empat file MJS baru lulus (exit 0); lint penuh
awalnya lambat di sandbox, retry konteks pengguna juga lulus. Review file baru
dan git diff --check lulus; Git hanya memperingatkan normalisasi LF/CRLF.
Setup interaktif selesai: configured, roleProvisioned=true. Jendela awal tidak
terlihat sehingga ditutup sebelum provisioning; pengguna menjalankan script
melalui path absolut dari terminal lokal. Env diabaikan Git; ACL terproteksi
dengan satu rule eksplisit, tidak diwariskan. Sandbox tidak dapat membaca ACL;
pemeriksaan dan migrasi dijalankan dalam konteks pengguna tanpa melonggarkan ACL.
npm.cmd run db:migrate:dev pertama lulus exit 0: tujuh tabel dibuat di dev.
Invocation kedua lulus exit 0: already applied; no changes made.
node --env-file=.env.dev-migrator.local --env-file=.env.local scripts/verify-dev-db.mjs
lulus exit 0: tujuh tabel kosong dimiliki tiny_osaka_dev_owner, satu history
dengan hash/timestamp yang sesuai, enam FK RESTRICT dan isolasi privilege app.
Verifier hanya membaca metadata/data; tidak mengulang constraint mutation suite test.
Build/E2E/audit/Lighthouse
belum diulang; temuan audit/peer dan seluruh release gate tetap terbuka.

Tidak ada seed, perubahan halaman publik/SEO, merchant call, commit/push/deploy.
Rollback setelah schema diterapkan harus melalui inspeksi data/dependensi dan
rencana reverse migration/restore yang disetujui; pertahankan SQL dan history.
Jika provisioning gagal, periksa status role/env sebelum recovery; jangan
menimpa env atau mengulangi provisioning secara buta.

## Phase 2C1: harga, varian dan topping offline (2026-10-16)

Diimplementasikan pada feat/catalog-data-plan sesuai rencana dan revisi pengguna:
tidak ada plafon harga bisnis. Produk sederhana memakai varian internal standard;
kelompok topping berlaku untuk seluruh varian produk; setiap opsi sekali pilih;
harga dasar/tambahan integer IDR nonnegatif. PostgreSQL bigint dibatasi rentang
integer aman JS (0..9007199254740991) untuk representasi, dan kalkulator menolak
overflow sebelum penjumlahan. Harga di atas 100000 didukung dan diuji.

File tahap ini:
- src/server/db/schema.mjs: enam tabel baru dengan FK komposit RESTRICT,
  constraints harga/seleksi/sort/code, ID/EN translations dan uniqueness.
- src/server/catalog/pricing.mjs: validator kesiapan harga dan calculatePrice.
- tests/unit/catalog-pricing.test.mjs: fixture sintetis dan 20 kasus unit.
- drizzle/0001_catalog_pricing.sql, drizzle/meta/0001_snapshot.json serta
  drizzle/meta/_journal.json: hasil generator offline.
- docs/DATA_CONTRACTS.md, docs/DECISIONS.md (ADR-012), docs/PHASE2_PLAN.md,
  docs/SECURITY_AND_QA.md dan README: kontrak, batas tahap dan hasil aktual.

Command/hasil aktual:
- node --test tests/unit/catalog-pricing.test.mjs: 20/20 lulus, exit 0.
- node --check src/server/db/schema.mjs dan src/server/catalog/pricing.mjs:
  lulus; parser test juga berjalan melalui node:test.
- npm.cmd exec -- drizzle-kit generate --config=drizzle.config.mjs --name=catalog_pricing:
  percobaan sandbox gagal uv_os_get_passwd ENOMEM (exit 1); retry konteks pengguna
  berizin lulus (exit 0), schema total 13 tabel. Tidak mengeksekusi SQL.
- Review SQL/snapshot/journal offline via assertion Node: lulus exit 0.
  Enam CREATE TABLE, enam ADD CONSTRAINT; setiap FK memiliki scope revision/product
  dengan RESTRICT update/delete. Tujuh definisi tabel lama identik di snapshot;
  snapshot baru terhubung ke snapshot 0000; entry journal 0000 tetap identik.
- SHA-256 SQL 0000 tetap
  6bae882b3912c8ba1607d38a755f555749e8fd97e2f4685a8da8388d902ee081.
- npm.cmd run lint: lulus exit 0. Review file dan git diff --check lulus;
  peringatan LF/CRLF Git hanya normalisasi line ending.

Database dev/test masih foundation tujuh tabel. SQL 0001 belum diterapkan; tidak
ada bukti constraint harga/topping dari PostgreSQL pada tahap ini. Runner migrasi
dev/test tetap sengaja terkunci pada 0000 dan akan menolak tambahan file/journal.
Jangan bypass guard; rencana berikutnya harus memperbarui guard history/hash/objek,
menerapkan ke test dahulu dan menguji constraint nyata sebelum migrasi dev.

Validator menerima graph yang dimuat server, bukan harga kiriman client. Ia belum
terhubung ke route/CMS; auth, approval, immutable revision, publikasi, bilingual
readiness dan perbandingan harga merchant belum diimplementasikan. Draft belum
lengkap boleh tersimpan, tetapi graph tidak valid ditolak ketika divalidasi untuk
harga. Tidak ada menu/harga restoran nyata, seed, dependency/lockfile change,
credential/grant change, merchant call, commit/push/deploy atau perubahan SEO/UI.

Build, integration DB, E2E, audit dan Lighthouse tidak dijalankan ulang untuk
tahap offline ini; preferensi focused checks tetap berlaku dan release gate serta
temuan dependency sebelumnya belum selesai.

Rollback sebelum 0001 diterapkan: hapus hanya module/test harga dan SQL/snapshot
0001; pulihkan journal ke satu entry 0000 yang sama, hapus enam definisi tabel
baru beserta import bigint/unique dan dokumentasi tahap ini saja. Pertahankan
SQL/snapshot/history 0000, schema foundation, database dan pekerjaan sebelumnya.
Setelah 0001 nantinya diterapkan, gunakan rencana reverse migration/restore khusus,
bukan rollback file tersebut. Rollback belum dijalankan.

## Phase 2C2: migrasi harga/topping ke test (2026-10-16)

Selesai di feat/catalog-data-plan, sesuai persetujuan rencana dan ADR-013.
Database test sekarang memiliki 13 tabel katalog dan dua history migration yang
sesuai. Development tetap tujuh tabel foundation; belum menerima 0001.

File tahap ini:
- scripts/migrate-test-db.mjs: transisi foundation ke pricing, hash/journal/state
  guards, pemeriksaan sebelum/sesudah dan pengulangan tanpa perubahan.
- scripts/lib/test-migration-plan.mjs serta tests/unit/test-migration-plan.test.mjs:
  manifest terpin dan pengujian penolakan artifact/history/object drift.
- tests/integration/pricing-constraints.test.mjs: sebelas kasus PostgreSQL/Drizzle
  dengan fixture transaksi dan rollback; tidak ada seed permanen.
- tests/integration/catalog-constraints.test.mjs: pemeriksaan 13 tabel kosong/owner.
- package.json: script test:pricing-db; tidak mengubah paket atau lockfile.
- README, docs/DECISIONS.md, docs/PHASE2_PLAN.md, docs/SECURITY_AND_QA.md: hasil aktual.

Hasil command aktual (seluruhnya exit 0):
- node --test tests/unit/test-migration-plan.test.mjs: 6 lulus, 0 gagal.
- node --check runner/helper/test integrasi baru: lulus.
- npm.cmd run lint: lulus.
- npm.cmd run db:migrate:test pertama: applied 0001_catalog_pricing; 13 tables
  owned by tiny_osaka_test_owner. Transaksi hanya pada database test lokal.
- npm.cmd run test:catalog-db: 8 lulus, 0 gagal.
- npm.cmd run test:pricing-db: 11 lulus, 0 gagal.
- npm.cmd run db:migrate:test kedua: reviewed 0000/0001 already applied; no changes.
- Query metadata dev melalui node --env-file=.env.local --input-type=module:
  transaksi READ ONLY, login dev_app, tepat tujuh tabel foundation; pricing tidak ada.
- Review file/diff dan git diff --check: lulus; Git memberi peringatan normalisasi
  LF/CRLF saja. Eksekusi database memakai konteks pengguna berizin membaca env
  privat; ACL tidak dilonggarkan dan kredensial tidak ditampilkan.

Teruji: harga di atas 100000, angka nol, pemetaan bigint Drizzle tepat sampai
Number.MAX_SAFE_INTEGER, penolakan overflow total oleh validator, CHECK nominal,
unique kode/ID, locale/nama, min/max/single, FK lintas revisi/produk/grup dan
RESTRICT delete/update. Tiga belas tabel kosong sesudah rollback, dimiliki owner
NOLOGIN, dua belas FK RESTRICT. Akun app ditolak membaca/menghapus enam tabel baru
serta tidak mempunyai privilege tabel mana pun pada tabel tersebut.

Batas DB/service tetap eksplisit: draft dengan opsi tidak mencukupi dapat disimpan,
tetapi validator kesiapan menolaknya. CHECK per baris bukan validasi total pilihan,
auth, approval revision, publikasi atau verifikasi kesamaan harga merchant.
Tidak ada perubahan UI/SEO, grants/kredensial/dependency, merchant call, commit,
push, deploy atau migrasi dev. Dev runner tetap terkunci 0000 dan membutuhkan
rencana pembaruan tersendiri. Build/E2E/audit/Lighthouse dan suite unit lama yang
tidak berubah tidak diulang; release gates dan temuan sebelumnya tetap terbuka.

Rollback test kini memerlukan inspeksi data/dependensi dan persetujuan reverse
migration/restore. Jangan menghapus SQL 0001, snapshot, journal atau history untuk
mengulangnya; jangan drop/reset/truncate/CASCADE cleanup. Tidak ada rollback
destruktif dijalankan. Seluruh pekerjaan fase sebelumnya dipertahankan.

## Phase 2C3: migrasi harga/topping ke development (2026-10-16)

Selesai pada feat/catalog-data-plan sesuai rencana dan ADR-014. Development kini
memiliki 13 tabel katalog kosong dan history 0000/0001 yang cocok, sama dengan
schema test. Tidak ada record sintetis dimasukkan ke dev.

File tahap ini:
- scripts/migrate-dev-db.mjs: transisi 0000 ke 0001 dengan guard hash/journal/
  history/owner/object-kind, lock dev yang sama dan transaksi. Foundation berisi
  data ditolak sebelum eksekusi; kondisi itu tidak ditemukan pada migrasi ini.
- scripts/lib/dev-migration-plan.mjs dan tests/unit/dev-migration-plan.test.mjs:
  manifest khusus dev dan pengujian penolakan drift termasuk owner test.
- scripts/verify-dev-db.mjs: verifikasi baca-saja 13 tabel, dua migration,
  metadata owner, 12 FK RESTRICT, tabel kosong dan isolasi privilege aplikasi.
- README, docs/DECISIONS.md, docs/PHASE2_PLAN.md, docs/SECURITY_AND_QA.md: hasil aktual.

Command dan hasil aktual, seluruhnya exit 0:
- node --test tests/unit/dev-migration-plan.test.mjs: 6 lulus, 0 gagal.
- node --check scripts/migrate-dev-db.mjs, scripts/lib/dev-migration-plan.mjs,
  scripts/verify-dev-db.mjs: lulus.
- npm.cmd run lint: lulus.
- npm.cmd run db:migrate:dev pertama: applied 0001_catalog_pricing;
  13 tables owned by tiny_osaka_dev_owner.
- npm.cmd run db:migrate:dev kedua: reviewed 0000/0001 already applied; no changes.
- node --env-file=.env.dev-migrator.local --env-file=.env.local scripts/verify-dev-db.mjs:
  lulus; 13 tabel kosong milik owner, dua hash/timestamp migration sesuai,
  12 FK RESTRICT dan isolasi privilege app. Semua query verifikasi READ ONLY.
- Review file/diff dan git diff --check: lulus; peringatan LF/CRLF hanya normalisasi.

Eksekusi DB memakai konteks pengguna berizin membaca env privat; ACL tidak diubah,
password tidak ditampilkan. Tidak ada perubahan test DB/runner, SQL/snapshot/
journal, grants/kredensial, paket/lockfile, merchant call, UI/SEO, commit/push/deploy.
Guard nama/kind/owner/history bukan fingerprint schema menyeluruh. Pengujian
constraint nyata sebelumnya lulus di test; suite mutasi tidak dijalankan di dev.
Build/E2E/audit/Lighthouse dan suite lama tidak diulang sesuai focused checks;
release gates serta temuan dependency sebelumnya tetap terbuka.

Website masih fixture; schema harga bukan auth, CMS, approval atau publikasi.
Langkah berikutnya memerlukan rencana untuk fondasi revision/write/approval atau
kontrak konten yang tersisa sebelum menghubungkan data ke halaman publik.

Rollback development setelah penerapan memerlukan inspeksi data/dependensi dan
persetujuan reverse migration/restore; pertahankan SQL/snapshots/journal/history
0000 dan 0001. Jangan gunakan file removal untuk membatalkan DB, drop/reset/
truncate/CASCADE cleanup. Tidak ada rollback destruktif dijalankan.

## Phase 2D1: writer draft dan konflik edit (2026-10-16)

Selesai di feat/catalog-data-plan sesuai ADR-015. Writer internal server dapat
membuat draft kosong dan mengubah harga varian dengan expectedVersion. Versi dan
harga disimpan dalam satu transaksi; salah scope membatalkan kenaikan versi;
versi lama ditolak. Harga tetap integer IDR nonnegatif tanpa plafon bisnis,
dengan batas representasi JS-safe. Versi int4 tidak boleh overflow.

File tahap ini: src/server/catalog/drafts.mjs,
tests/unit/catalog-drafts.test.mjs, tests/integration/catalog-drafts.test.mjs,
package.json (test:drafts-db), README, docs/DATA_CONTRACTS.md, docs/DECISIONS.md,
docs/PHASE2_PLAN.md, docs/SECURITY_AND_QA.md. Tidak ada dependency/lockfile change.

Hasil aktual:
- node --conditions=react-server --test tests/unit/catalog-drafts.test.mjs:
  4 lulus, 0 gagal, exit 0; input invalid tidak mengakses DB dan error driver
  disanitasi tanpa raw detail/cause.
- node --check module writer dan test integrasi: lulus.
- npm.cmd run lint awal: lulus, exit 0.
- npm.cmd run test:drafts-db pertama: 8 lulus/1 gagal, exit 1. Assertion kedua
  worker menunggu lock gagal ketika menggunakan pg_stat_activity. Semua fixture
  tetap dibersihkan dan pemeriksaan tabel kosong lulus pada run ini.
- Deteksi lock diubah ke pg_blocking_pids, tanpa privilege tambahan atau
  pelemahan syarat concurrency. Keterbatasan visibilitas pg_stat_activity saat
  SET ROLE diduga menjadi penyebab probe awal.
- Targeted node --conditions=react-server --env-file=.env.test-migrator.local
  --env-file=.env.test.local --test --test-name-pattern="two actual simultaneous editors"
  tests/integration/catalog-drafts.test.mjs: 1 lulus, exit 0.
- npm.cmd run test:drafts-db penuh setelah perbaikan: 9 lulus/0 gagal, exit 0.
  Dua koneksi benar-benar menunggu lock bersamaan; tepat satu save menang,
  satu REVISION_CONFLICT, dan versi hanya naik sekali. Semua 13 tabel kosong
  setelah pembersihan ID fixture. Akun app tetap ditolak create/update writer.
- npm.cmd run lint setelah perbaikan dan git diff --check: lulus, exit 0.
  Review file/diff selesai; warning LF/CRLF Git hanya normalisasi line ending.

Test memakai record sintetis sementara yang di-commit agar terlihat oleh dua
koneksi. Cleanup hanya memakai ID revisi/identitas yang dibuat test, berurutan
dalam transaksi; tidak ada drop/reset/truncate/CASCADE atau seed permanen.
Eksekusi test berizin membaca env privat tanpa mengubah ACL/menampilkan secret.
Tidak ada perubahan schema/migrasi, development, app grants, UI/SEO, merchant
API, commit/push/deploy. Build, E2E, audit/Lighthouse dan suite lama tidak diulang;
release gates dan temuan dependency sebelumnya tetap terbuka.

Writer memerlukan DB context yang diberikan server; belum ada endpoint atau
workflow auth/RBAC. Ia tidak menyalin katalog, membekukan revisi approved/live,
atau menerapkan approval/publikasi. Semua writer anak berikutnya perlu mengikuti
kontrak versi root; raw SQL tidak otomatis dilindungi kontrak service ini.

Rollback kode: hapus hanya module/test writer, entry script baru dan dokumentasi
fase ini; pertahankan schema/migrasi/data/pekerjaan sebelumnya. Fixture sudah
bersih. Jika cleanup run mendatang gagal, inspeksi ID fixture yang dilaporkan dan
pulihkan hanya record sintetis itu; jangan reset database. Rollback belum dijalankan.

## Phase 2D2: salin katalog ke draft baru (2026-10-16)

Selesai di feat/catalog-data-plan sesuai ADR-016. cloneCatalogDraft menerima ID
sumber dan expectedSourceVersion, mengunci root sumber FOR SHARE, lalu membuat
root baru draft/version 1 dan menyalin sepuluh tabel anak dalam satu transaksi.
Kolom disalin melalui whitelist eksplisit; revisi sumber tidak berubah. Identitas
produk/kategori dan slug tetap shared; ID varian/grup/opsi dipertahankan dalam
key yang dibatasi revisi. Belum ada approval/lineage/published pointer yang disalin.

File tahap ini: src/server/catalog/drafts.mjs,
tests/unit/catalog-drafts.test.mjs, tests/integration/catalog-clone.test.mjs,
package.json (test:clone-db), README, docs/DATA_CONTRACTS.md, docs/DECISIONS.md,
docs/PHASE2_PLAN.md, docs/SECURITY_AND_QA.md. Tidak ada perubahan paket/lockfile.

Command aktual dan hasil, seluruhnya exit 0:
- node --conditions=react-server --test tests/unit/catalog-drafts.test.mjs:
  5 lulus, 0 gagal; termasuk validasi clone sebelum akses DB dan error aman.
- node --check src/server/catalog/drafts.mjs dan tests/integration/catalog-clone.test.mjs:
  lulus. Deklarasi Drizzle lokal juga diperiksa untuk dukungan SELECT FOR SHARE.
- npm.cmd run lint: lulus.
- npm.cmd run test:drafts-db: 9 lulus, 0 gagal; writer lama tetap berfungsi.
- npm.cmd run test:clone-db: 11 lulus, 0 gagal pada run pertama. Semua sepuluh
  tabel anak identik dengan sumber (kecuali revision_id), FK valid, ID/slug stabil,
  versi root baru 1, sumber/unrelated revision tidak berubah. Edit dua arah
  terisolasi; draft kosong/terjemahan belum lengkap tidak diisi dengan rekaan.
- Test SQL division-by-zero pada copy tabel anak keenam: clone root dan baris
  sebagian dibatalkan; enclosing transaction masih dapat membuat clone valid.
- Test dua koneksi: editor-first membuat clone menunggu lalu menolak versi lama;
  clone-first menahan editor hingga snapshot clone selesai. Blocking dibuktikan
  melalui pg_blocking_pids; app clone tetap ditolak karena grants tidak berubah.
- Test fixture cleanup: sumber/salinan dihapus hanya berdasarkan ID test sendiri;
  seluruh 13 tabel test kosong setelah suite. Tidak ada seed permanen.
- Review file/diff dan git diff --check: lulus; warning LF/CRLF hanya normalisasi.

Test memakai env test privat dalam konteks pengguna berizin, tanpa mengubah ACL
atau menampilkan password. Tidak ada perubahan development, schema/migration,
grants/kredensial, public UI/SEO, API merchant, commit/push/deploy. Build/E2E/audit/
Lighthouse dan suite lain yang tidak berubah tidak diulang; release gates serta
temuan dependency sebelumnya tetap terbuka.

Batas: fungsi internal server hanya menerima sumber draft saat ini; caller perlu
authorization/audit sebelum endpoint dibuat. Raw SQL atau perubahan shared slug
belum dibekukan. Clone bukan validasi kesiapan bilingual atau approval/publikasi.
Tabel anak baru di masa depan perlu whitelist clone dan test yang diperbarui.

Rollback kode: hapus hanya function/whitelist clone, penambahan unit test, test
integrasi clone, script test:clone-db dan dokumentasi tahap ini. Pertahankan writer
sebelumnya/schema/migrasi/database. Semua fixture sudah bersih; jika cleanup run
berikutnya gagal, inspeksi ID test yang dilaporkan tanpa reset database.

## Phase 2D3: edit terjemahan kategori/produk (2026-10-16)

Selesai di feat/catalog-data-plan sesuai ADR-017. saveCategoryTranslation dan
saveProductTranslation menambah/memperbarui nama/deskripsi untuk locale ID/EN
pada entry yang sudah ada di draft. expectedVersion dan perubahan teks disimpan
atomik. Harga dan teks memakai helper versi root yang sama, sehingga edit bersamaan
tidak saling menimpa. Bahasa lain, revisi lain, shared slug/identity dan status tetap.

File tahap ini: src/server/catalog/drafts.mjs,
tests/unit/catalog-drafts.test.mjs, tests/integration/catalog-translations.test.mjs,
package.json (test:translations-db), README, docs/DATA_CONTRACTS.md,
docs/DECISIONS.md, docs/PHASE2_PLAN.md, docs/SECURITY_AND_QA.md.

Command/hasil aktual, seluruhnya exit 0:
- node --conditions=react-server --test tests/unit/catalog-drafts.test.mjs:
  6 lulus, 0 gagal; input invalid ditolak sebelum DB dan error driver disanitasi.
- node --check src/server/catalog/drafts.mjs dan tests/integration/catalog-translations.test.mjs:
  lulus.
- npm.cmd run lint: lulus.
- npm.cmd run test:drafts-db: 9 lulus, 0 gagal.
- npm.cmd run test:clone-db: 11 lulus, 0 gagal.
- npm.cmd run test:translations-db: 11 lulus, 0 gagal pada run pertama.
- Review file/diff dan git diff --check: lulus; warning LF/CRLF hanya normalisasi.

Teruji: upsert ID/EN, deskripsi kosong, Unicode/newline dan karakter mirip HTML
tersimpan literal, isolasi bahasa/revisi/clone, slug/status tidak terubah,
rollback parent salah/versi lama, kegagalan SQL setelah kedua write, batas versi
int4 dan app ditolak kedua writer karena grants tidak diperluas. Dua koneksi nyata
untuk edit harga-vs-teks sama-sama menunggu root lock; tepat satu commit dan satu
REVISION_CONFLICT. Semua fixture di-commit sementara hanya di test, kemudian
ID sumber/clone/identitas milik test dibersihkan; 13 tabel kembali kosong.

Nama wajib string tidak kosong setelah trim untuk validasi; konten tetap disimpan
persis, bukan di-trim. Deskripsi wajib string, boleh kosong; omitted/null ditolak
agar tidak menghapus konten diam-diam. NUL ditolak sesuai batas PostgreSQL text.
Tidak ada render HTML/rich-text sanitization: UI kelak harus escape teks biasa.
Tidak ada perubahan development, schema/migration, dependency/lockfile, app grants,
kredensial/ACL, UI/SEO, merchant API, commit/push/deploy. Eksekusi DB memakai env
privat dalam konteks pengguna berizin tanpa menampilkan secret.

Build/E2E/audit/Lighthouse dan suite lama lain tidak diulang. Temuan dependency
sebelumnya dan release gates tetap terbuka. Auth/RBAC/audit, approval/publication,
kelengkapan bilingual saat publish, serta writer varian/modifier masih terpisah.

Rollback kode: pulihkan price writer sebelum helper bersama, hapus tambahan writer
terjemahan/unit cases/test integrasi/script test:translations-db dan dokumentasi
fase ini. Pertahankan writer/clone baseline, schema/migrasi/database. Fixture sudah
bersih; pada cleanup gagal di masa depan inspeksi hanya ID test yang dilaporkan.

## Phase 2D4: writer varian dan label ID/EN (2026-10-16)

Selesai pada feat/catalog-data-plan sesuai ADR-018. Writer dapat membuat varian
ber-ID baru, mengedit kode/harga/urutan serta upsert nama/deskripsi ID/EN varian.
Semua memakai expectedVersion dan transaksi root yang sama dengan writer lama.
Varian pertama atau satu-satunya wajib berkode standard; kode varian lain harus
unik dalam produk/revisi. Jika ada beberapa varian, standard boleh diganti kode
unik lainnya. Tidak ada penghapusan varian dalam tahap ini.

File tahap ini: src/server/catalog/drafts.mjs,
tests/unit/catalog-drafts.test.mjs, tests/integration/catalog-variants.test.mjs,
package.json (test:variants-db), README, docs/DATA_CONTRACTS.md,
docs/DECISIONS.md, docs/PHASE2_PLAN.md, docs/SECURITY_AND_QA.md.

Command aktual, seluruhnya exit 0:
- node --conditions=react-server --test tests/unit/catalog-drafts.test.mjs:
  8 lulus, 0 gagal; termasuk input variant/scope/text/version sebelum DB dan
  error driver aman untuk semua writer baru.
- node --check src/server/catalog/drafts.mjs dan tests/integration/catalog-variants.test.mjs:
  lulus.
- npm.cmd run lint: lulus.
- npm.cmd run test:drafts-db: 9 lulus, 0 gagal.
- npm.cmd run test:clone-db: 11 lulus, 0 gagal.
- npm.cmd run test:translations-db: 11 lulus, 0 gagal.
- npm.cmd run test:variants-db: 13 lulus, 0 gagal pada run pertama.
- Review file/diff dan git diff --check: lulus; warning LF/CRLF normalisasi saja.

Teruji: ID otomatis (input ID tambahan tidak dipakai create), first/sole standard,
varian bernama/kode edit, kode duplikat membatalkan versi, harga nol dan batas
integer aman JS, sort int4, UUID uppercase, scope parent/revisi/produk/varian,
ID/EN literal/isolasi, SQL failure sesudah actual write, stale/exhausted version,
clone dan edit salinan tidak mengubah sumber. Dua race nyata (create-vs-teks dan
edit-vs-price-only) menunjukkan dua worker menunggu lock bersamaan lalu tepat satu
commit/satu REVISION_CONFLICT; perubahan pihak kalah tidak tersimpan sebagian.
App tetap ditolak ketiga writer karena grants tidak berubah.

Seluruh record sintetis sumber/clone yang di-commit sementara hanya di test sudah
dibersihkan menurut ID milik test; 13 tabel kembali kosong. Tidak ada perubahan
development, schema/migration, grants/kredensial/ACL, dependency/lockfile, public
UI/SEO, merchant call, commit/push/deploy. Env test privat dibaca dalam konteks
pengguna berizin tanpa menampilkan password.

Build/E2E/audit/Lighthouse dan suite lama lain yang tidak terkait tidak diulang;
release gates serta temuan dependency sebelumnya tetap terbuka. Writer masih
internal: belum auth/RBAC/audit, approval/publikasi, delete varian atau writer
topping. Teks literal belum rich HTML dan harus di-escape pada UI kelak.

Rollback: hapus tambahan writer varian/label, tambahan unit cases, test varian,
entry test:variants-db dan dokumentasi tahap ini. Jika helper validasi teks baru
dibatalkan, pulihkan validasi inline writer terjemahan sebelumnya. Pertahankan
writer/clone baseline, schema/migrasi/database. Fixture sudah bersih; jika cleanup
run mendatang gagal, inspeksi hanya ID test yang dilaporkan tanpa reset database.

## Phase 2D5: writer kelompok topping dan opsi (2026-10-16)

Selesai pada feat/catalog-data-plan sesuai ADR-019. Enam writer internal mencakup
create/edit kelompok topping, create/edit opsi dan upsert label ID/EN keduanya.
Semua memakai expectedVersion/transaksi root yang sama. Scope dan kode unik
(divalidasi per produk untuk grup, per grup untuk opsi) dijaga; ID baru dibuat DB,
edit tidak dapat memindahkan produk/revisi/grup pemilik. Harga tambahan integer IDR
nonnegatif, tanpa plafon bisnis dan dengan batas representasi aman.

File tahap ini: src/server/catalog/drafts.mjs,
tests/unit/catalog-drafts.test.mjs, tests/integration/catalog-modifiers.test.mjs,
package.json (test:modifiers-db), README, docs/DATA_CONTRACTS.md,
docs/DECISIONS.md, docs/PHASE2_PLAN.md, docs/SECURITY_AND_QA.md.

Command aktual, seluruhnya exit 0:
- node --conditions=react-server --test tests/unit/catalog-drafts.test.mjs:
  11 lulus, 0 gagal; input enam writer baru divalidasi sebelum DB, error aman.
- node --test tests/unit/catalog-pricing.test.mjs: 20 lulus, 0 gagal.
- node --check src/server/catalog/drafts.mjs dan tests/integration/catalog-modifiers.test.mjs:
  lulus.
- npm.cmd run lint: lulus.
- npm.cmd run test:drafts-db: 9 lulus, 0 gagal.
- npm.cmd run test:clone-db: 11 lulus, 0 gagal.
- npm.cmd run test:modifiers-db: 15 lulus, 0 gagal pada run pertama.
- Review file/diff dan git diff --check: lulus; warning LF/CRLF hanya normalisasi.

Teruji: generated IDs, UUID uppercase, edit setelan/urutan grup, harga/urutan opsi,
kode duplikat, scope lintas produk/revisi/grup, aturan single/min/max dan int4,
delta nol/JS-safe, ID/EN literal, total harga dari graph yang dimuat Drizzle,
required/duplicate/overflow selections, draft underfilled hingga readiness valid,
real SQL failure untuk masing-masing enam writer, stale/exhausted version,
clone/isolasi sumber dan dua race nyata. Option-create vs group-rule serta
delta-edit vs variant-price sama-sama memakai root token; dua koneksi diamati
menunggu lock, tepat satu commit dan satu REVISION_CONFLICT. App tetap ditolak
keenam writer; seluruh fixture/clone test dibersihkan menurut ID miliknya sehingga
13 tabel kembali kosong. Tidak ada seed permanen/reset/drop/truncate/CASCADE.

Kelompok draft boleh belum cukup opsi ketika dibuat. Writer memvalidasi min/max
lokal; validator kesiapan harga menolak jumlah opsi kurang dari batas sebelum
perhitungan. Tidak ada delete/retarget parent, inventory/checkout atau repeatable
option. Caller kelak perlu auth/RBAC/audit; writer bukan approval/publikasi.
Teks literal perlu di-escape UI, bukan dianggap rich HTML.

Tidak ada perubahan development, schema/migration, dependency/lockfile, grants/
kredensial/ACL, UI/SEO, merchant API, commit/push/deploy. Env privat dibaca dalam
konteks pengguna berizin tanpa output secret. Suite DB varian/terjemahan yang tidak
berubah, build/E2E/audit/Lighthouse dan suite lain tidak terkait tidak diulang;
release gates dan temuan dependency sebelumnya tetap terbuka.

Rollback kode: hapus tambahan enam writer/helper/import modifier, unit additions,
test integrasi modifier, script test:modifiers-db dan dokumentasi fase ini.
Pertahankan writer/clone baseline, schema/migrasi/database. Fixture sudah bersih;
pada cleanup gagal berikutnya inspeksi hanya ID test yang dilaporkan.

## Phase 2D6: paket fondasi draft katalog selesai (2026-10-16)

Paket gabungan selesai di feat/catalog-data-plan sesuai ADR-020. Writer kini dapat
membuat kategori/produk beserta identitas dan slug unik, memindahkan produk antar
kategori dalam revisi yang sama dan mengatur urutan. Semua perubahan memakai
expectedVersion/transaksi root. Slug kategori/produk punya namespace terpisah;
slug duplikat lintas revisi ditolak tanpa attach identitas atau mengubah data lama.

Laporan kesiapan struktural membaca draft/version yang tepat dengan FOR SHARE,
memuat graph konsisten, lalu memeriksa kategori/produk, varian/topping, ID/EN semua
entitas, aturan pilihan dan total maksimum yang aman dihitung. ready=true hanya
berarti struktur lengkap untuk diperiksa; belum verifikasi fakta, kualitas bahasa,
approval Owner, publikasi atau kesamaan harga merchant. Tidak mengubah status/versi.

File paket:
- src/server/catalog/drafts.mjs: empat writer identitas/penempatan.
- src/server/catalog/review-readiness.mjs: pure validator dan issue list deterministik.
- src/server/catalog/review.mjs: loader server-only, source lock dan version check.
- tests/unit/catalog-drafts.test.mjs, tests/unit/catalog-review-readiness.test.mjs,
  tests/integration/catalog-foundation.test.mjs: input, graph dan alur penuh.
- package.json: test:foundation-db; tidak ada dependency/lockfile change.
- README, docs/DATA_CONTRACTS.md, docs/DECISIONS.md, docs/PHASE2_PLAN.md,
  docs/SECURITY_AND_QA.md: kontrak, progres tetap dan hasil aktual.

Hasil command aktual (seluruhnya exit 0):
- node --conditions=react-server --test tests/unit/catalog-drafts.test.mjs
  tests/unit/catalog-review-readiness.test.mjs tests/unit/catalog-pricing.test.mjs:
  43 lulus, 0 gagal (12 drafts, 11 readiness, 20 pricing).
- node --check src/server/catalog/review.mjs,
  src/server/catalog/review-readiness.mjs dan tests/integration/catalog-foundation.test.mjs:
  lulus; source writer/unit juga diparse melalui lint/test.
- npm.cmd run lint: lulus.
- npm.cmd run test:drafts-db: 9 lulus; test:clone-db: 11 lulus;
  test:translations-db: 11 lulus; test:variants-db: 13 lulus;
  test:modifiers-db: 15 lulus; test:foundation-db: 12 lulus.
  Total 71 test DB lulus, tidak ada gagal/skip.
- Review file/diff dan git diff --check: lulus; warning LF/CRLF normalisasi saja.

Test foundation membuat seluruh katalog melalui writer aplikasi, tanpa setup
kategori/produk SQL langsung, sampai ID/EN lima jenis entitas lengkap dan report
ready=true. Teruji benturan slug lintas revisi/namespace, scope kategori, rollback
SQL sesudah actual write, move/sort pada clone terisolasi, laporan stale/missing,
overflow total dan batas tepat integer aman, race slug/placement, consistency read
lock dan app denial. Semua fixture di-track sebelum commit dan dibersihkan hanya
ID milik test beserta identity ID+slug; 13 tabel test kosong setelah suite.

Pembagian progres tetap lima kelompok di PHASE2_PLAN.md: (1) fondasi draft selesai
sesuai paket ini; (2) perlindungan revisi/jalur publikasi, (3) konten halaman,
(4) referensi media, (5) integrasi publik/QA masih tersisa. Task kecil berikutnya
bukan tambahan kelompok. Auth/Owner approval berkaitan dengan Phase 3.

Tidak ada perubahan development, schema/migration, grants/kredensial/ACL,
dependency/lockfile, UI/SEO, API merchant, commit/push/deploy. Env privat dipakai
pada konteks pengguna berizin tanpa output secret. Build/public E2E/audit/Lighthouse
dan suite lain tidak terkait tidak diulang; temuan dependency dan release gate
sebelumnya tetap terbuka. Reader memakai transaksi normal karena row lock tidak
boleh dalam READ ONLY; seluruh statement reader SELECT, tanpa DML.

Batas: tidak ada delete/shared-slug edit atau CMS UI, auth/RBAC/audit, immutable
approval/publikasi, rich HTML sanitization atau verifikasi fakta restoran. Laporan
terikat versi; submit/approve kelak wajib revalidasi/freeze dalam transaksi berizin.
Raw SQL/perubahan shared identity belum diproteksi kontrak root writer.

Rollback: hapus empat writer/import identitas, dua module review, tambahan unit
cases/test foundation/script test:foundation-db dan dokumentasi paket saja.
Pertahankan seluruh writer/clone sebelumnya, schema/migrasi/database. Fixture
sudah bersih; recovery cleanup berikutnya hanya terhadap ID test yang dilaporkan.


## Phase 2 kelompok 2: backend review dan publikasi

Paket backend menambahkan penguncian revisi, hash isi, submit Staff/Owner,
approve/reject/publish/archive Owner, audit tindakan dan reader katalog terbit.
Edit revisi yang terkunci dilakukan melalui clone draft baru tanpa membawa
persetujuan lama. Draft/perubahan yang belum diterbitkan tidak mengganti katalog
aktif. Katalog aktif baru boleh diarsip setelah pengganti yang disetujui diterbitkan.

File utama: src/server/db/schema.mjs; src/server/catalog/{drafts,review,workflow,
content-hash,published}.mjs; drizzle/0002_catalog_publication.sql dan
0003_catalog_receipt_check.sql beserta meta; scripts/migrate-{test,dev}-db.mjs,
scripts/lib/{test-migration-plan,dev-migration-plan,catalog-protection,
apply-reviewed-migration}.mjs; scripts/verify-dev-db.mjs; unit hash/workflow dan
integration catalog-publication, penyesuaian tes migration/schema; package.json
dan dokumentasi kontrak/keputusan/progres/QA.

Akses workflow memakai resolver identitas server tepercaya dan ditolak secara
default selama auth belum terhubung. Login/session CMS tetap Phase 3; fungsi
backend ini belum menjadi endpoint atau UI. Tidak ada perluasan grant aplikasi,
perubahan credential/ACL, dependency baru, akses merchant, commit/push/deploy.
Halaman publik tetap fixture preview/noindex sampai kelompok 5.

Pemeriksaan yang sudah dijalankan:
- node --conditions=react-server --test tests/unit/*.test.mjs: 74 lulus.
- npm.cmd run test:workflow-unit: 8 lulus (juga tercakup dalam 74 unit).
- npm.cmd run test:catalog-regression: 90 lulus, tidak ada skip/gagal.
- npm.cmd run test:publication-db: 14 lulus setelah koreksi; seluruh 17 tabel
  test kosong dan fungsi/trigger terverifikasi. Tes rollback mencakup semua transisi.
- npm.cmd run lint: lulus.
- npm.cmd run build: lulus pada konteks pengguna dengan env privat; percobaan
  sandbox sebelumnya selesai tetapi gagal membaca .env.local sehingga diulang.
- npm.cmd audit --omit=dev --json --fetch-retries=0 --fetch-timeout=15000:
  exit 0, nol temuan runtime.
- npm.cmd audit --json --fetch-retries=0 --fetch-timeout=15000:
  exit 1, 5 high + 4 moderate pada development dependencies yang sudah tercatat.
  Audit sandbox awal gagal koneksi, diulang dalam konteks pengguna. Tidak ada fix.

0002 sudah diterapkan di test saat runner awal mengembalikan error pemeriksaan
setelah commit internal Drizzle; keadaan diperiksa, bukan diasumsikan rollback.
Runner diperbaiki menjadi satu transaksi pg untuk SQL+riwayat+pemeriksaan akhir.
Tes commit juga menemukan field version tidak tersedia di receipt approval;
0003 memperbaikinya tanpa mengubah 0002/riwayat. Kedua jalur kegagalan migrasi
(SQL dan pemeriksaan akhir) kini diuji benar-benar rollback.

Rollback sesudah migrasi berhasil memerlukan inspeksi dan reverse migration/
restore yang disetujui terpisah. Pertahankan SQL 0000-0003, metadata dan riwayat.
Jangan menjalankan runner lama untuk mengembalikan database. Risiko tersisa:
auth belum tersambung, QA/release menyeluruh dan temuan dependency development.


Final verification (2026-10-16):
- npm.cmd run test:e2e -- --workers=1: 222/222 passed in 3.9 minutes.
  Initial two-worker run: 104 passed, 2 browser-page setup timeouts, 116 not run
  after suite timeout. No tests/config were removed or weakened; single-worker
  rerun completed all desktop/mobile/small-mobile cases.
- npm.cmd run db:migrate:dev: applied pending 0002/0003 together; second run
  reported already applied with no changes.
- node --env-file=.env.local --env-file=.env.dev-migrator.local
  scripts/verify-dev-db.mjs: passed, 17 empty owner tables, four exact history
  rows, 16 RESTRICT FKs, eight exact function bodies and 36 enabled triggers;
  app has no new privileges.
- npm.cmd run db:migrate:test repeated: no changes, final protections verified.
- npm.cmd run test:db-connection: 4/4 passed, both isolated app roles and both
  cross-database CONNECT denials.
- Final unit rerun: 74/74; lint, syntax checks and git diff --check passed.
  .gitattributes fixes drizzle SQL to LF because core.autocrlf=true otherwise
  risks changing reviewed migration hashes on a later Windows checkout.

Both local databases now retain 0000-0003 history and contain no catalog fixtures.
No production or merchant call occurred. Actual auth/session integration, verified
business content, public DB integration, Lighthouse/staging/release and nine
development dependency audit entries remain outside this completed backend scope.

File tambahan: .gitattributes menjaga SQL LF; metadata snapshot/journal 0002/0003
menjaga urutan schema. Perubahan package-lock/dependency lain yang sudah ada
sebelum paket ini dipertahankan; paket ini tidak menginstal dependency.

## Phase 2 kelompok 3: backend konten halaman bilingual (ADR-022)

Paket selesai pada feat/catalog-data-plan. Sembilan identitas mengikuti rute yang
sudah ada: home, about, menu, guides, promos, location, guide-takoyaki,
guide-okonomiyaki, guide-burger. Template dan target tautan tetap milik kode.
ID/EN disimpan dalam satu revisi; tidak ada fallback bahasa otomatis. Draft boleh
parsial, sedangkan submit memerlukan semua field yang ditentukan pada kedua bahasa.

Teks terstruktur mendukung paragraf, heading H2/H3, daftar, bold/italic dan tautan
internal allowlist. Tidak menerima node HTML, script, style, iframe atau URL luar.
Teks yang menyerupai HTML tetap literal dan kelak wajib dirender sebagai teks React.
Batas teknis: 64 KiB JSON input per terjemahan, 128 KiB representasi jsonb di DB,
100 blok/dokumen, 100 span per inline, 1000 span per dokumen; batas field di kontrak.

Workflow server-only meliputi createDraft/saveTranslation/cloneDraft/submit untuk
Staff atau Owner dan approve/reject/publish/archive khusus Owner. Semua write lewat
factory memerlukan resolver identitas server tepercaya; tanpa auth akses ditolak.
Login/session/UI CMS tetap Phase 3. Approval mengikat revisi/versi/hash; edit sumber
beku perlu clone tanpa approval. Publikasi mengganti pointer per halaman secara
atomik. Arsip halaman aktif ditolak sampai pengganti disetujui dan diterbitkan.

File paket: src/server/db/schema.mjs; src/server/pages/{templates,validation,
content-hash,drafts,workflow,published}.mjs; drizzle/0004_page_content.sql dan meta;
scripts/lib/page-protection.mjs, catalog-protection.mjs, manifest migrasi test/dev;
kedua runner migrasi dan verify-dev-db.mjs; tests/fixtures/page-content.mjs,
unit page-content dan integration pages beserta penyesuaian tes schema/migration;
package.json (test:pages-db), README dan docs kontrak/keputusan/progres/QA.

Command aktual, seluruhnya exit 0:
- npm.cmd exec -- drizzle-kit generate --config=drizzle.config.mjs --name=page_content:
  SQL schema dihasilkan offline; trigger ditinjau sebelum hash dipatok dan diterapkan.
- node --conditions=react-server --test tests/unit/*.test.mjs: 89/89 lulus.
- npm.cmd run test:pages-db: 18/18; test:catalog-regression: 90/90;
  test:publication-db: 14/14; test:db-connection: 4/4 lulus. Total 126 integrasi DB.
- npm.cmd run lint dan npm.cmd run build: lulus.
- npm.cmd run test:e2e -- --workers=1: 222/222 lulus dalam 4.7 menit.
- npm.cmd run db:migrate:test: 0004 diterapkan; ulang tanpa perubahan.
- npm.cmd run db:migrate:dev: 0004 diterapkan setelah tes; ulang tanpa perubahan.
- node --env-file=.env.local --env-file=.env.dev-migrator.local
  scripts/verify-dev-db.mjs: 24 tabel kosong, lima history, 24 RESTRICT FK,
  fungsi/trigger katalog dan halaman serta isolasi privilege terverifikasi.

Tes mencakup semua template, JSONB/hash deterministik, bilingual wajib, input
berbahaya, stale/version exhaustion, scope, frozen SQL denial, clone, persetujuan,
pointer, audit, actual SQL rollback setiap operasi dan konflik sesi independen.
Fixture komit test dibersihkan hanya dengan ID milik tes dalam transaksi maintenance
berkunci; seluruh 24 tabel test/development kosong. Tidak ada seed klaim restoran.

Public preview/noindex, UI, SEO dan source data belum diubah (integrasi nomor 5).
Media masuk nomor 4; scheduler/login/session Phase 3. Tidak ada dependency/install,
grant/kredensial/ACL, merchant API, produksi, commit/push/deploy yang diubah paket ini.
Audit dependency tidak diulang karena package versions/lockfile tidak berubah pada
paket ini; hasil pemeriksaan sebelumnya (runtime nol, dev 5 high + 4 moderate)
tetap tercatat, beserta gate release/Lighthouse/staging yang belum selesai.

Rollback sesudah commit memerlukan inspeksi dan reverse migration/restore yang
disetujui. Pertahankan SQL 0000-0004, snapshot/journal dan history. Jangan menghapus
riwayat atau menulis ulang migrasi terapan. Approval paket ini hanya lokal test/dev.

## Phase 2 kelompok 4: referensi media dan batasnya (ADR-023)

Backend referensi media selesai pada feat/catalog-data-plan. Empat tabel baru:
media_assets, media_events, catalog_media_refs dan page_media_refs. Referensi
memiliki alt/caption ID+EN, urutan, scope produk/halaman dan token versi draft.
Aset serta audit pendaftaran immutable. Clone membawa referensi; edit draft tidak
mengubah media live. Persetujuan mengikat media/poster serta checksum metadata.

Batas yang disetujui memakai MB desimal: JPEG/PNG/WebP <=10.000.000 byte dan
4096 piksel per sisi; MP4/WebM <=100.000.000 byte, <=120.000 ms, sisi panjang
<=1920 dan sisi pendek <=1080 (landscape/portrait); video wajib poster gambar.
Maksimal 12 lampiran per produk/halaman. SVG, GIF animasi dan HTML iframe bebas
tidak diterima. YouTube disimpan sebagai ID berkontrak 11 karakter aman + poster,
bukan HTML/URL bebas. Tidak ada permintaan video, API atau thumbnail eksternal.

Pendaftaran file memerlukan resolveActor dan inspectFile server tepercaya.
Browser tidak bisa mengklaim verified/MIME/ukuran/checksum. Inspector mendapat
key opak dan konteks identitas server; hasil wajib verified=true untuk key yang
sama dan metadata yang memenuhi policy. Tanpa inspector pendaftaran ditolak.
Belum ada penyimpanan fisik, decoder, endpoint/UI upload, scanning file nyata,
optimisasi gambar atau player publik. Tes inspector memakai metadata sintetis,
bukan bukti file fisik aman/valid. Adapter nyata tetap pekerjaan Phase 3.

File paket: src/server/db/schema.mjs; src/server/media/{policy,validation,assets,
references}.mjs; modul draft/load/readiness/hash/workflow/reader katalog dan halaman;
drizzle/0005_media_references.sql beserta meta; scripts/lib/media-protection.mjs,
manifest test/dev, kedua runner dan verify-dev-db.mjs; tests/fixtures/media.mjs,
unit/integration media dan penyesuaian tes schema/history; package.json
(test:media-db); README dan docs kontrak/keputusan/progres/QA.

Command aktual, semuanya exit 0:
- npm.cmd exec -- drizzle-kit generate --config=drizzle.config.mjs --name=media_references:
  generate offline; custom trigger ditinjau sebelum SQL/hash diterapkan.
- node --conditions=react-server --test tests/unit/*.test.mjs: 102/102 lulus;
  tes unit media 13/13 diulang sesudah pengetatan konteks inspector/graph.
- npm.cmd run test:media-db: 16/16; test:pages-db: 18/18;
  test:catalog-regression: 90/90; test:publication-db: 14/14;
  test:db-connection: 4/4. Total 142 tes integrasi DB lulus.
- npm.cmd run lint dan npm.cmd run build: lulus.
- npm.cmd run test:e2e -- --workers=1: 222/222 lulus (2.4 menit).
- npm.cmd run db:migrate:test: 0005 berhasil; ulang tidak mengubah apa pun.
- npm.cmd run db:migrate:dev: 0005 berhasil setelah acceptance; ulang tanpa perubahan.
- node --env-file=.env.local --env-file=.env.dev-migrator.local
  scripts/verify-dev-db.mjs: 28 tabel kosong, enam history tepat, 30 FK RESTRICT,
  19 function guard/60 trigger terverifikasi, privilege aplikasi tetap ditolak.

Tes mencakup limit/exact boundary, inspector palsu/absen, poster, scope, alt wajib
ID/EN saat submit, clone, persetujuan, DTO publik tanpa storageKey/checksum/actor,
rollback aktual register/create/update/remove, konflik editor/submit serta dua
INSERT SQL bersamaan pada 11 lampiran (satu lulus, satu ditolak; total tetap 12).
Hash lama tanpa media dibuktikan dengan dua konstanta sebelum perubahan; media
memakai format 2 tanpa menulis ulang approval/history lama. Semua fixture bersih.

Public preview/noindex dan source halaman tetap; integrasi visual nomor 5. Login
dan UI upload/adapter fisik masuk Phase 3. Audit dependency tidak diulang karena
versi/lockfile tidak berubah dalam paket ini; temuan dev sebelumnya tetap terbuka.
Tidak ada install, grant/kredensial/ACL, seed klaim, merchant call, produksi,
commit/push/deploy. Lighthouse/staging/release tidak dijalankan paket ini.

Rollback sesudah migrasi berhasil membutuhkan inspeksi dan reverse migration/
restore yang disetujui. Pertahankan SQL 0000-0005, snapshot/journal dan history.
Kebijakan/kontrak media dan sumber YouTube resmi tercatat pada DATA_CONTRACTS.md.

## Phase 2 public content modes (ADR-024)

Default public rendering uses published local database content, including ID/EN
page fields, catalog variants and modifier prices. No published data means a
localized empty state. A missing/unpublished product or guide returns 404. No
fixture is substituted. CMS login/editor and real media serving are Phase 3.

PowerShell, from the repository root, after the reviewed dev migration:

```powershell
$env:PUBLIC_CONTENT_SOURCE = "published"
npm.cmd run dev
```

Open http://localhost:3000/id and http://localhost:3000/en. Both local databases
are intentionally empty after QA; empty-state text is expected. To inspect the
existing example design, stop the server, choose explicit preview and restart:

```powershell
$env:PUBLIC_CONTENT_SOURCE = "fixture"
npm.cmd run dev
```

Return to published mode by setting the value to published and restarting. Keep
PUBLIC_DATABASE_TARGET=dev for manual development; test is reserved for QA. These
are server-only settings. Never replace runtime credentials with migrator login.

Repeatable local QA:

```powershell
npm.cmd run test:public-db
npm.cmd run test:published-e2e
npm.cmd run test:e2e
node --conditions=react-server --env-file=.env.test-migrator.local --env-file=.env.test.local scripts/run-published-qa.mjs --lighthouse
```

The published QA runner requires an empty, isolated test DB, creates tracked
synthetic data, uses only app credentials in browser/server child processes, then
cleans exactly its own fixture IDs and checks guards. Run DB suites sequentially.
It never seeds development or business content. Lighthouse is fetched temporarily
with npm exec at approved version 12.8.2, not added to package.json/lockfile. HTML
and JSON reports live in ignored test-results/lighthouse. The mobile runs use
synthetic text/media placeholders; real content and hosting require later QA.

Rollback: application files may be reverted or local fixture mode selected.
Successful SQL changes require an inspected, approved reverse migration/restore;
preserve applied migrations and history. No production operation is authorized.

## Phase 3.1 login and local Owner setup

Auth implementation, manual account provisioning and email limitations are
documented in [docs/PHASE3_PLAN.md](docs/PHASE3_PLAN.md). After development
migration0007, create your local account in the repository terminal:

```powershell
powershell.exe -NoProfile -File .\scripts\provision-account.ps1 -Role owner
npm.cmd run dev
```

Open http://localhost:3000/admin/login. Use the configured origin exactly. The
password is entered through a hidden terminal prompt, never chat or command-line
arguments. No real account is pre-seeded. Optional Owner MFA is at/admin/security.
This subphase provides protected entry; content editors come next. Real reset
email is intentionally unavailable until an email provider/adapter is approved.

Auth verification: npm.cmd run test:auth-db and npm.cmd run test:auth-e2e. The
browser runner uses only synthetic test accounts and application credentials in
child processes, removes its fixture IDs afterwards and checks auth guards.
All database suites must run sequentially. Auth trace reports may contain
synthetic credentials/recovery material; they are ignored private QA artifacts,
not files to publish. Existing advisory/release gates remain open.
