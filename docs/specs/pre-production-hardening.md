# Spec: Pre-production hardening (pekerjaan A)

Status: APPROVED oleh user, 2026-10-19 (keputusan Q1-Q7 tercatat di bagian 12). Belum ada kode yang diubah.
Tanggal: 2026-10-19. Satu branch per PR, diturunkan dari `main` (lihat bagian 10).

## 1. Masalah dan tujuan

Staging Railway berjalan, tetapi sebelum production ada empat celah:

1. Pengguna CMS tidak bisa mengganti kata sandi sendiri lewat UI (runbook `docs/runbooks/railway-staging.md` Langkah 19 butir 2). Endpoint server `/change-password` sudah ada; UI-nya belum.
2. Tidak ada `robots.txt`, `sitemap.xml`, dan `canonical`; semua halaman publik di-hardcode `noindex` sehingga production tidak bisa diindeks kapan pun.
3. Header keamanan baseline sudah ada, tetapi tidak ada CSP dan frame-ancestors modern.
4. Belum ada satu QA rilis penuh yang tercatat (AGENTS.md: lint, build, unit, integrasi, E2E, security).

Tujuan: menutup keempatnya dengan PR kecil, tanpa melanggar invariant AGENTS.md.

## 2. Temuan kode yang sudah ada (jangan diduplikasi)

- MFA Owner SUDAH ada: `src/app/admin/security/page.jsx` (owner-only via `requireAdmin("owner")`), `src/features/cms/auth/SecurityForm.jsx` (siapkan, verifikasi TOTP, kode pemulihan, nonaktifkan dengan konfirmasi sandi), tautan di `src/app/admin/page.jsx`. Server: plugin `twoFactor` di `src/server/auth/service.mjs`, jalur `ownerMfaPaths` di `src/server/auth/policy.mjs` (non-Owner dapat 403/401), audit `mfa_enabled/mfa_disabled/mfa_verified`. Login MFA: `LoginForm.jsx`.
- `/change-password` SUDAH diizinkan di `authPaths`, wajib sesi, memaksa `revokeOtherSessions: true`, diaudit `password_changed` (`service.mjs` baris sekitar 118, 136, 158). Tidak ada UI yang memanggilnya.
- Sesi: absolut 24 jam dan idle 1 jam di `policy.mjs` (`ABSOLUTE_SESSION_MS`, `IDLE_SESSION_MS`), `freshAge: 300`, tanpa refresh sesi. Reset sandi lewat email: `ResetForm.jsx`, `/admin/reset-password`.
- `minPasswordLength: 6` (service.mjs) dan `password.length < 6` (provision.mjs): KEBIJAKAN TETAP, tidak diubah (Q2).
- Header di `next.config.mjs`: nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy, COOP, HSTS (hanya bila `PUBLIC_DATABASE_TARGET=production`, `max-age=15552000`). Komentar di file: CSP "add it report-only first".
- `noindex,nofollow` di-hardcode di: `src/app/(site)/layout.jsx`, `src/app/global-not-found.jsx`, `src/app/admin/layout.jsx`, `src/features/public-site/components/PublishedContent.jsx` (halaman dan produk).
- Tidak ada `src/app/robots.*` / `sitemap.*`, tidak ada env URL situs, dan GA4 BELUM diimplementasikan di `src/` (hanya direncanakan, ROADMAP Phase 3).
- Konten pihak ketiga: iframe `youtube-nocookie.com` hanya setelah klik persetujuan (`PublishedMedia.jsx`); gambar/video dari `/media/*` same-origin dan lewat optimizer Next.
- Skrip QA: `npm run lint`, `build`, `test:e2e`, `security:check` (npm audit + auth-db + cms-catalog-security-db + `scripts/security-check.mjs`), plus banyak skrip `test:*-db` / `test:*-e2e` di `package.json`.

### Verifikasi HTML pengguna di halaman publik (dijalankan 2026-10-19)

- Grep di `src/` untuk `dangerouslySetInnerHTML`, `innerHTML`, `__html`, `insertAdjacentHTML`, `outerHTML`, `document.write`, `<script`, serta pustaka `rehype-raw`, `marked`, `markdown-it`, `DOMPurify`, `sanitize`: NOL hasil.
- Kesimpulan (asumsi terverifikasi): tidak ada jalur yang merender HTML mentah dari pengguna/CMS di halaman publik; konten dirender sebagai node React yang di-escape. Risiko XSS tersimpan lewat konten CMS rendah pada kode saat ini.
- Risiko sisa yang diterima: `script-src 'unsafe-inline'` (Q5) melemahkan lapisan CSP terhadap XSS jika kelak ada jalur HTML mentah. Mitigasi: tes statis (lihat AC-29) yang gagal bila `dangerouslySetInnerHTML`/`__html` muncul di `src/` tanpa persetujuan, dan tinjau nonce di kemudian hari.
- Catatan: tidak ada JSON-LD `<script>` di `src/` saat ini; sejalan dengan larangan `Restaurant`/`LocalBusiness`.

## 3. Scope

### A1. Halaman akun CMS (semua peran) - ganti sandi sendiri
- Halaman `/admin/account` (Owner dan Staff; Staff boleh ganti sandi sendiri, Q7) berisi form ganti sandi: sandi saat ini, sandi baru, konfirmasi. Memanggil `/change-password` yang sudah ada (via `authRequest`).
- Tautan "Akun" di `AdminShell.jsx`.
- Setelah sukses: sesi lain dicabut (sudah dipaksa server); sesi saat ini tetap; pesan sukses berbahasa Indonesia.
- TIDAK ADA perubahan kebijakan sandi (Q2): minimum tetap 6 karakter, maksimum 128 tetap; tanpa cek sandi bocor, tanpa dependency baru.

### A2. MFA Owner (penyempurnaan, bukan fitur baru)
- `/admin/security` DIGABUNG ke `/admin/account` (Q3): `SecurityForm` tampil di halaman akun hanya untuk Owner. Rute lama `/admin/security` dialihkan (redirect permanen/server-side) ke `/admin/account`. Staff tidak melihat bagian MFA (server tetap menolak).
- Perbaikan kecil yang dibutuhkan agar MFA layak diuji: tampilkan status, kode pemulihan, serta pesan galat jelas. Tidak mengubah alur server MFA.
- Tidak ada MFA wajib; tetap opsional (AGENTS.md).

### B. robots.txt, sitemap.xml, dan canonical
- Amandemen ADR-038 (Q1): sitemap dan canonical dimajukan dari Phase 3 ke pekerjaan ini. Draft amandemen ada di bagian 5b. Penulisan ke `docs/DECISIONS.md` (dan penyesuaian `docs/ROADMAP.md`) adalah TUGAS PR-2, dikerjakan backend hanya setelah user menyetujui teks final; spec ini tidak mengubah dokumen tersebut.
- `src/app/robots.js`: bila target = `production` DAN indexing diaktifkan eksplisit lewat flag (Q4; nama env mis. `ALLOW_INDEXING=true`, default tertutup): `Allow: /`, `Disallow: /admin`, `/api`, tautkan `Sitemap`. Selain itu (dev, test, staging, env tidak jelas, flag tidak persis `true`): `Disallow: /` tanpa baris sitemap.
- `src/app/sitemap.js`: hanya halaman publik yang tayang dan produk tayang bila ada URL detail produk; URL absolut dari env `SITE_URL` (baru, server-side). Tanpa `hreflang`, tanpa prefix bahasa (ADR-038). Tanpa `lastmod` karangan; pakai waktu simpan nyata dari DB bila tersedia.
- `canonical`: URL absolut dari `SITE_URL` + path halaman, hanya dipancarkan saat indexing production aktif (valid `SITE_URL`); tanpa `hreflang`. Pada staging/dev tidak ada canonical.
- Metadata `robots` publik dibuat bergantung target: staging/dev tetap `noindex,nofollow` (perilaku sekarang); production dengan flag aktif `index,follow` untuk halaman publik tayang. `/admin/*`, `global-not-found`, dan halaman tak ditemukan SELALU noindex. Satu helper tunggal (mis. `src/server/public/indexing.mjs`) dipakai semua titik, menggantikan literal hardcode.
- Header `X-Robots-Tag: noindex, nofollow` bila indexing tidak aktif (lapisan kedua, di `next.config.mjs`) agar tidak bergantung pada metadata saja.

### C. Header keamanan HTTP
- Tambah `Content-Security-Policy-Report-Only` lebih dulu (PR-1; staging diamati), lalu enforce `Content-Security-Policy` (PR-4) setelah staging tanpa pelanggaran (Q5).
- Direktif (diverifikasi terhadap build nyata): `default-src 'self'`; `base-uri 'self'`; `object-src 'none'`; `form-action 'self'`; `frame-ancestors 'none'`; `script-src 'self' 'unsafe-inline'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `media-src 'self'`; `connect-src 'self'`; `frame-src https://www.youtube-nocookie.com`. TANPA nonce; pendekatan nonce ditinjau kembali di kemudian hari (bukan bagian pekerjaan ini). Tidak ada `'unsafe-eval'` kecuali terbukti dibutuhkan oleh dev server (hanya di dev, tidak di build produksi).
- GA4: tidak ada origin Google pada CSP sekarang; PR GA4 (Phase 3) wajib menambahkannya dan mengujinya.
- Pertahankan header yang ada; `X-Frame-Options: DENY` tetap sebagai cadangan `frame-ancestors`. HSTS: tetap hanya production, `max-age` tetap seperti sekarang atau naik ke 1 tahun; `includeSubDomains`/`preload` DITUNDA sampai domain final diputuskan (Q6).
- `/media/*` dan `/api/cms/media/*` tetap menggunakan header cache sendiri (`src/server/media/cache-headers.mjs`); header global tidak boleh menimpa `Content-Disposition`/`nosniff` milik route media. Gambar optimizer `/_next/image` harus tetap lolos `img-src`.

### D. QA rilis penuh
- Jalankan dan catat hasil nyata: `npm run lint`, `npm run build`, unit (`node --test tests/unit` dan skrip `test:*-unit`), integrasi DB (`test:auth-db`, `test:cms-*-db`, `test:public-db`, `test:pages-db`, `test:media-db`, dst.), E2E Playwright (`test:e2e`, `test:auth-e2e`, `test:cms-*-e2e`, `test:published-e2e`), dan `security:check`.
- Tambah tes baru dari spec ini (AC di bawah), lalu satu putaran QA akhir. Hasil ditulis di `docs/runbooks/` atau laporan PR, bukan diklaim tanpa dijalankan.
- Lighthouse mobile >=90 hanya target, bukan syarat blokir.

## 4. Out of scope
- Perubahan kebijakan sandi (panjang minimum, cek sandi bocor, kompleksitas).
- Pemulihan sandi tanpa email / reset admin-ke-pengguna dari UI; manajemen akun/pengguna lain (Owner-only, fitur terpisah).
- MFA wajib, passkey/WebAuthn, SMS OTP, "trust device".
- Pemasangan GA4 itu sendiri, consent banner baru, Search Console (Phase 3).
- Nonce CSP, HSTS `includeSubDomains`/`preload`.
- Data terstruktur apa pun (`Restaurant`/`LocalBusiness` DILARANG), hreflang, halaman bahasa Inggris.
- Perubahan skema DB/migrasi (tidak dibutuhkan; jika ternyata perlu, berhenti dan minta persetujuan baru).
- Deploy ke production, migrasi production, mengakses merchant live.
- Konten/alamat/harga/URL menu baru.

## 5. Alternatif yang dipertimbangkan
- Ganti sandi: (a) halaman `/admin/account` terpadu (dipilih: satu tempat, berlaku Owner dan Staff); (b) tambah form di `/admin/security` saja (tidak melayani Staff).
- robots/sitemap: (a) route file Next `robots.js`/`sitemap.js` (dipilih: tanpa dependency); (b) file statis di `public/` (tidak bisa membedakan staging/production); (c) paket `next-sitemap` (dependency baru tanpa bukti kebutuhan).
- CSP: (a) statis di `next.config.mjs` dengan `'unsafe-inline'` (DIPILIH, Q5; lemah untuk script tetapi sederhana dan tidak memaksa halaman dinamis; dimitigasi oleh verifikasi tanpa HTML pengguna mentah); (b) nonce per-request (ditunda, tinjau nanti); (c) hash.

## 5b. Draft amandemen ADR-038 (untuk disetujui user; ditulis ke DECISIONS.md di PR-2)

> ADR-038 (amandemen, 2026-10-19). Konteks: ADR-038 menetapkan SEO hanya bahasa Indonesia, tanpa hreflang/prefix bahasa, serta menunda sitemap dan canonical ke Phase 3. Keputusan: sitemap.xml, robots.txt, dan canonical dimajukan ke pekerjaan pre-production hardening. Syarat: hanya Indonesia, tanpa hreflang dan tanpa prefix bahasa; hanya URL tayang; URL absolut dari `SITE_URL`; aktif hanya bila target production dan flag indexing eksplisit aktif (default tertutup); staging/dev tetap noindex. Tidak berubah: `Restaurant`/`LocalBusiness` structured data tetap di luar scope; tidak ada klaim konten baru. Search Console dan GA4 tetap Phase 3. Disetujui oleh: user (Q1, 2026-10-19). Dampak ROADMAP: butir sitemap/canonical Phase 3 ditandai "dimajukan ke hardening PR-2".

## 6. Dampak keamanan/RBAC, SEO, merchant sync
- Keamanan/RBAC: `/change-password` tetap membutuhkan sesi; rate limit rute (100/menit) dan audit `password_changed` dipertahankan; sandi tidak boleh masuk log/audit/analitik. Endpoint MFA tetap Owner-only di server (tes 403 Staff, 401 anonim). Perlu tes bahwa kata sandi lama salah ditolak, dan sesi lain tidak lagi valid setelah ganti. Idle 1 jam dan absolut 24 jam diuji server-side (waktu dimanipulasi di fixture, bukan hanya UI). Redirect `/admin/security` tidak boleh melemahkan `requireAdmin`.
- SEO: bahasa Indonesia saja; sitemap hanya URL tayang; canonical hanya saat indexing production aktif; tidak ada structured data Restaurant/LocalBusiness; tidak ada klaim konten baru. Risiko utama: staging ikut terindeks; mitigasi berlapis (metadata, `robots.txt`, `X-Robots-Tag`, default tertutup, flag eksplisit).
- Merchant sync: tidak terpengaruh. Tidak ada panggilan endpoint merchant; simpan tidak memicu sync.

## 7. Risiko
- CSP terlalu ketat merusak hidrasi Next, YouTube embed (setelah consent), atau gambar optimizer. Mitigasi: Report-Only dulu, E2E publik + CMS memeriksa console tanpa pelanggaran CSP.
- `'unsafe-inline'` pada script-src: perlindungan XSS CSP lemah; diterima dengan alasan tidak ada HTML pengguna mentah (bagian 2) dan tes statis AC-29.
- Salah konfigurasi `SITE_URL`/target/flag menyebabkan production tertutup atau staging terbuka. Mitigasi: default tertutup, tes unit untuk matriks target x env x flag, checklist runbook.
- Domain belum dipilih: `SITE_URL` production belum diketahui; sitemap/canonical tidak bisa diverifikasi end-to-end sampai domain ada.
- Sandi minimum 6 karakter tetap lemah; diterima atas keputusan user (Q2), dimitigasi oleh rate limit dan MFA Owner opsional.

## 8. Acceptance criteria

Ganti sandi dan akun
- AC-1: `/admin/account` dapat dibuka Owner dan Staff aktif; anonim dialihkan ke login; akun nonaktif ditolak server.
- AC-2: Form ganti sandi dengan sandi saat ini benar dan sandi baru valid berhasil, pesan sukses Indonesia, audit `password_changed` tercatat dengan aktor benar (berlaku untuk Owner dan Staff).
- AC-3: Sandi saat ini salah ditolak dengan pesan umum, tanpa membocorkan detail, dan tidak mengubah sandi.
- AC-4: Setelah ganti sandi, sesi lain milik akun yang sama tidak valid (server), sesi saat ini tetap valid; login dengan sandi lama gagal, sandi baru berhasil.
- AC-5: Aturan sandi TIDAK berubah: minimum 6 dan maksimum 128 karakter tetap ditegakkan server meski validasi klien dilewati, sama untuk change-password, reset, dan provisioning (tes regresi, tanpa perubahan nilai).
- AC-6: Permintaan ganti sandi tanpa sesi = 401; origin salah = 403; non-JSON = 415 (perilaku handler yang ada tetap lulus tes).
- AC-7: Sandi tidak muncul di URL, log, tabel audit, atau respons JSON.

MFA Owner
- AC-8: Owner dapat menyiapkan MFA di `/admin/account` (konfirmasi sandi, TOTP, kode pemulihan tampil sekali) dan login berikutnya meminta kode; Owner dapat menonaktifkan dengan konfirmasi sandi. Audit `mfa_enabled/mfa_disabled/mfa_verified` tercatat.
- AC-9: Staff tidak melihat bagian MFA di `/admin/account`, dan memanggil `/api/auth/two-factor/*` langsung menghasilkan 403; anonim 401 (server enforcement).
- AC-10: Sesi: 24 jam absolut dan idle 1 jam ditolak server pada waktu yang dimanipulasi (tes integrasi yang menyatakan nilai konstanta tersebut, tidak hanya membacanya).
- AC-11: MFA tetap opsional; Owner tanpa MFA dapat login normal.
- AC-27: Mengakses `/admin/security` mengarahkan (redirect) ke `/admin/account`; anonim tetap berakhir di login; tautan di `src/app/admin/page.jsx` dan AdminShell tidak lagi menunjuk rute lama.

robots, sitemap, canonical
- AC-12: Target `staging`/`dev`/`test`/env hilang, ATAU production tanpa flag indexing persis aktif: `/robots.txt` = `Disallow: /` tanpa baris `Sitemap`; semua halaman publik membawa `noindex,nofollow` (meta dan `X-Robots-Tag`); tanpa canonical.
- AC-13: Target `production` dengan flag indexing aktif dan `SITE_URL` valid: `/robots.txt` mengizinkan `/`, melarang `/admin` dan `/api`, dan menyebut `Sitemap: <SITE_URL>/sitemap.xml`.
- AC-14: `/sitemap.xml` (production + flag aktif) hanya berisi URL absolut halaman publik tayang (dan produk bila punya URL detail), tanpa `/admin`, tanpa `/id` `/en`, tanpa hreflang, tanpa `lastmod` palsu; selain itu mengembalikan kosong atau 404 (ditetapkan di PR).
- AC-15: `/admin/*`, 404 global, dan `/api/*` selalu noindex di semua target.
- AC-16: Tidak ada JSON-LD `Restaurant`/`LocalBusiness` pada HTML mana pun (tes grep pada HTML hasil render).
- AC-17: Matriks target x `SITE_URL` (ada/tidak/tidak valid) x flag indexing diuji unit; `SITE_URL` tidak valid pada production membuat sitemap dan canonical gagal tertutup (bukan URL localhost).
- AC-26: Saat indexing production aktif, tiap halaman publik tayang memuat `<link rel="canonical">` absolut sesuai `SITE_URL` + path, tanpa hreflang; halaman tidak tayang/404 tidak memuat canonical.

Header keamanan
- AC-18: Setiap respons HTML publik dan admin memuat `Content-Security-Policy-Report-Only` (PR-1) lalu `Content-Security-Policy` enforce (PR-4) dengan direktif bagian 3C, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` (+ `X-Frame-Options: DENY`).
- AC-19: `Strict-Transport-Security` hanya ada saat target production; tidak ada di dev/staging/test; tanpa `includeSubDomains`/`preload`.
- AC-20: `/media/<uuid>` tetap melayani gambar dengan header cache/`nosniff` sendiri; gambar lewat `/_next/image` tampil; video setelah klik consent memuat iframe `youtube-nocookie.com`.
- AC-21: E2E publik dan CMS berjalan tanpa pelanggaran CSP di console (staging Report-Only tanpa laporan = syarat beralih ke enforce).
- AC-22: Tidak ada origin Google/GA4 pada CSP sampai GA4 benar-benar dipasang; PR GA4 wajib menambahkannya dan mengujinya.
- AC-28: Pembangun kebijakan CSP diuji unit: `script-src` dan `style-src` memuat `'unsafe-inline'`; `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` ada; tidak ada nonce, tidak ada wildcard `*`, tidak ada `'unsafe-eval'` pada konfigurasi produksi.
- AC-29: Tes statis (di `scripts/security-check.mjs` atau unit) gagal bila `dangerouslySetInnerHTML`/`__html`/`innerHTML` muncul di `src/`; hasil saat ini nol.

QA rilis
- AC-23: Hasil nyata (perintah, jumlah lulus/gagal, yang tidak dijalankan beserta alasan) tercatat untuk: lint (0 warning), build, unit, integrasi, Playwright E2E, `security:check`.
- AC-24: Semua tes baru dari AC-1..AC-29 masuk ke suite yang ada dan dijalankan di putaran QA akhir; temuan bug ditandai dan diperbaiki maksimal 2 putaran sebelum dilaporkan.
- AC-25: Tidak ada dependency baru, tidak ada migrasi DB, tidak ada commit/push/deploy tanpa izin terpisah.

## 9. Tugas per peran dan daftar file

### backend
- `src/server/auth/*`: TIDAK ada perubahan kebijakan sandi; hanya tambahkan/pastikan tes regresi. Jangan ubah alur MFA.
- Baru `src/server/public/indexing.mjs` (atau lokasi setara): fungsi murni dari `PUBLIC_DATABASE_TARGET`, `SITE_URL`, flag indexing; menghasilkan keputusan robots, canonical, dan sitemap; dipakai robots, sitemap, metadata.
- Baru `src/app/robots.js`, `src/app/sitemap.js`; pembacaan halaman/produk tayang lewat modul `src/server/public/*` yang ada (tanpa query baru ke luar kontrak publik).
- `next.config.mjs` + modul pembangun CSP terpisah (mis. `src/server/security/csp.mjs`): CSP Report-Only lalu enforce, `X-Robots-Tag`, HSTS sesuai Q6.
- `.env.example` dan runbook (`docs/runbooks/railway-staging.md`, bagian env) memuat `SITE_URL` dan flag indexing. `docs/DECISIONS.md`/`docs/ROADMAP.md` hanya diubah di PR-2 sesuai bagian 5b setelah user menyetujui teks final.

### frontend
- Baru `src/app/admin/account/page.jsx` dan `src/features/cms/auth/PasswordForm.jsx` (memakai `authRequest` di `client.js`); tampilkan `SecurityForm` hanya untuk Owner di halaman akun; `src/app/admin/security/page.jsx` menjadi redirect ke `/admin/account` (server-side `redirect`).
- `src/features/cms/layout/AdminShell.jsx`: tautan "Akun"; `src/app/admin/page.jsx`: sesuaikan kartu keamanan ke rute baru.
- Ganti literal `robots` di `src/app/(site)/layout.jsx` dan `src/features/public-site/components/PublishedContent.jsx` dengan helper indexing, tambah `alternates.canonical` dari helper; `src/app/admin/layout.jsx` dan `src/app/global-not-found.jsx` tetap noindex.
- Aksesibilitas: label, `autoComplete="current-password"/"new-password"`, `role="status"` untuk pesan; teks Indonesia saja.

### qa (hanya atas permintaan; pipeline default pm -> be/fe -> pm)
- Unit: matriks indexing, pembangun CSP/header, aturan sandi (`tests/unit/`).
- Integrasi: ganti sandi + pencabutan sesi lain (Owner dan Staff), MFA RBAC (Staff 403), kedaluwarsa idle/absolut (`tests/integration/auth.test.mjs`).
- E2E: `tests/auth-e2e/auth.spec.mjs` (alur akun, redirect `/admin/security`, MFA Owner, Staff tanpa MFA), `tests/published-e2e/public.spec.mjs` (robots/sitemap/canonical/header/CSP console), `tests/e2e/navigation.spec.js`, `tests/cms-media-e2e`, `tests/cms-catalog-e2e` (regresi CSP).
- Putaran QA rilis penuh (butir D) dan laporan hasil nyata.

## 10. Urutan PR dan branch (semua diturunkan dari `main`, berurutan; PR berikutnya dibuat setelah PR sebelumnya di-merge)

1. PR-1 `feat/hardening-pr1-headers` - CSP Report-Only (`script-src`/`style-src` dengan `'unsafe-inline'`), `X-Robots-Tag` untuk non-indexing, modul pembangun CSP, tes AC-18, 19, 21 (bagian Report-Only), 28, 29.
   - BE: modul CSP, `next.config.mjs`, tes unit, tes statis AC-29. FE: tidak ada (cukup verifikasi console tidak ada pelanggaran).
2. PR-2 `feat/hardening-pr2-indexing` - helper indexing, robots, sitemap, canonical, flag + `SITE_URL`, amandemen ADR-038 di `docs/DECISIONS.md`/`docs/ROADMAP.md`, tes AC-12..17, 26.
   - BE: `indexing.mjs`, `robots.js`, `sitemap.js`, `.env.example`, runbook env, dokumen amandemen. FE: ganti literal `robots` + canonical di layout dan `PublishedContent.jsx`.
3. PR-3 `feat/hardening-pr3-account` - `/admin/account` (ganti sandi Owner+Staff), MFA digabung, redirect `/admin/security`, tes AC-1..11, 27.
   - BE: tes regresi auth/sandi (tanpa perubahan kebijakan), pastikan `/change-password` dan jalur MFA tidak berubah. FE: `account/page.jsx`, `PasswordForm.jsx`, `SecurityForm` dipindah ke akun Owner, redirect, `AdminShell.jsx`, `admin/page.jsx`.
4. PR-4 `feat/hardening-pr4-csp-enforce` - beralih ke `Content-Security-Policy` enforce setelah staging tanpa pelanggaran, penyesuaian HSTS (Q6), tes AC-18, 20, 21.
   - BE: ubah header Report-Only ke enforce di `next.config.mjs`/modul CSP. FE: perbaiki inline/sumber yang melanggar bila ada temuan staging.
5. PR-5 `feat/hardening-pr5-release-qa` - QA rilis penuh, perbaikan temuan (maks 2 putaran), pembaruan runbook (Langkah 19 butir 2) dan laporan hasil nyata (AC-23..25).
   - BE/FE: perbaikan bug dari QA saja. QA: jalankan seluruh suite dan catat hasil.
Setiap PR menunggu persetujuan merge/deploy terpisah; staging QA dulu, production hanya atas izin eksplisit.

## 11. Asumsi
- Production dan staging dibedakan oleh `PUBLIC_DATABASE_TARGET` (sudah dipakai di `next.config.mjs`).
- Tidak butuh migrasi DB; tabel audit sudah punya `password_changed`, `mfa_*`.
- Better Auth versi terpasang mendukung semua yang dipakai (tidak ada upgrade).
- URL detail produk publik mungkin belum ada; sitemap hanya memuat rute yang benar-benar ada.
- TERVERIFIKASI (Grep 2026-10-19): tidak ada `dangerouslySetInnerHTML`/`__html`/`innerHTML`/pustaka markdown atau sanitizer di `src/`; konten publik dirender sebagai node React ter-escape.
- Nama env flag indexing (`ALLOW_INDEXING`) adalah usulan; BE boleh menamai ulang asal didokumentasikan di `.env.example`.

## 12. Keputusan user (2026-10-19) dan sisa pertanyaan
- Q1 DISETUJUI: sitemap dan canonical dimajukan; amandemen ADR-038 (draft di 5b) ditulis di PR-2 setelah user menyetujui teks final.
- Q2 DISETUJUI: minimum sandi TETAP 6 karakter; tidak ada perubahan kebijakan; tanpa cek sandi bocor.
- Q3 DISETUJUI: `/admin/security` digabung ke `/admin/account`; rute lama redirect ke baru.
- Q4 DISETUJUI: indexing production lewat flag eksplisit, default tertutup.
- Q5 DISETUJUI: CSP Report-Only dulu; saat enforce `script-src` dan `style-src` memakai `'unsafe-inline'`, direktif lain ketat; tanpa nonce (tinjau nanti).
- Q6 DISETUJUI: HSTS `includeSubDomains`/`preload` ditunda.
- Q7 DISETUJUI: Staff boleh ganti sandi sendiri.
- Sisa pertanyaan: (a) teks final amandemen ADR-038 di 5b perlu konfirmasi user sebelum PR-2 menulisnya ke DECISIONS.md; (b) nama final env flag indexing; (c) perilaku `/sitemap.xml` non-production: kosong atau 404 (diputuskan BE di PR-2, dicatat di PR).
