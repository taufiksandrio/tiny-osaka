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
