# Spec Phase 4: Marketing, SEO, analytics

Status: DRAFT awal 2026-10-20 oleh PM. PR-A: diimplementasikan di branch feat/phase4-ga4-consent (belum commit); review PM 2026-10-20 di bagian 17. PR-B/C/D/E: belum dikerjakan.

## 1. Masalah dan tujuan

Situs sudah punya link order publik (ADR-040), sitemap, canonical, robots dan gerbang indexing (hardening PR-2), CSP ditegakkan (PR-4), dan embed YouTube berbasis consent per-klik. Yang belum ada: pengukuran niat order keluar (GA4), notice privasi/consent, UTM kampanye, Search Console, dan penilaian embed Instagram/TikTok. Tujuan: mengukur klik order keluar secara privat dan jujur (tidak pernah menyatakan order selesai), tanpa melanggar CSP, consent, dan invariant AGENTS.md.

## 2. Baseline yang sudah ada (JANGAN diulang)

- Sitemap, canonical, robots, `isIndexingOpen`, `X-Robots-Tag` (hardening PR-2): `src/server/public/indexing.mjs`, `src/server/security/headers.mjs`.
- Tanpa hreflang dan tanpa `Restaurant`/`LocalBusiness` (ADR-038).
- Link order publik: `src/features/public-site/components/ProductOrderCard.jsx`, `order-platforms.mjs` (rel `noopener noreferrer nofollow`), data dari `src/server/catalog/published.mjs` dan `src/server/public/data.mjs`. Host terverifikasi hanya `gofood.link` dan `app.grab.com`; ShopeeFood kosong (fail closed) (ADR-040).
- Embed YouTube dengan consent per-klik: `PublishedMedia.jsx`; CSP `frame-src https://www.youtube-nocookie.com`. CSP saat ini tanpa origin Google (`headers.mjs` baris 2).
- Template halaman di kode (`src/server/pages/templates.mjs`): home, about, menu, guides, guide, promos, location. Field SEO (`seoTitle`, `seoDescription`) sudah ada.

## 3. Konflik/gerbang keputusan (bukan konflik, tapi butuh ADR baru)

- ADR-037/ADR-040 (4): "Tidak ada event GA4 baru dan tidak ada panggilan jaringan ke platform tanpa keputusan terpisah". Spec ini adalah usulan keputusan terpisah itu. Implementasi GA4 TIDAK boleh mulai sebelum user menyetujui spec ini dan ADR-041 (usulan) dicatat. Perubahan CSP (menambah origin Google) dan REQUIREMENTS/DATA_CONTRACTS juga butuh persetujuan; perubahan AGENTS.md hanya oleh user.
- AGENTS.md: GA4 hanya niat order keluar, tanpa PII; tanpa dashboard analytics internal; tanpa auto social feed. Semuanya dipatuhi di bawah.

## 4. Scope

PR-A GA4 + consent (inti), PR-B UTM kampanye, PR-C embed manual Instagram/TikTok (bersyarat), PR-D template konten CMS (bersyarat), PR-E runbook Search Console + QA rilis. Urutan: A -> B -> E; C dan D opsional setelah keputusan user.

### Out of scope
Dashboard analytics di CMS; sinkronisasi/panggilan API merchant; klaim order selesai/konversi/pendapatan; checkout/pembayaran; auto social feed (hanya embed manual satu per satu); `Restaurant` schema; hreflang; konten bahasa Inggris; ulang pekerjaan sitemap/canonical/robots; penambahan host ShopeeFood/host baru (butuh konfirmasi user + update ADR-040); iklan/pixel pihak ketiga (Meta, TikTok, Ads); Google Tag Manager (lihat pertanyaan); pengukuran CWV nyata (item terpisah Tahap 2).

## 5. Strategi event GA4 (PR-A)

Nama dan parameter (usulan, perlu persetujuan):

| Event | Pemicu | Parameter |
|---|---|---|
| `click_order` | klik link platform di dialog `ProductOrderCard` | `platform` (`gofood`/`grabfood`/`shopeefood`), `product_slug`, `placement` (`menu_card`/`menu_detail`/`promo_cta`), `page_path` |
| `view_menu_item` (opsional, tanya user) | halaman detail menu dibuka | `product_slug` |

Aturan: nama berarti "niat order keluar", bukan `purchase`/`order_complete`. Tidak ada PII, tidak ada nilai uang (`value`/`currency`/`price` dilarang), tidak ada URL order mentah, tidak ada IP/email/ID pengguna. Slug hanya dari katalog tayang. `anonymize`: matikan Google signals dan ad personalization; `allow_google_signals=false`, `allow_ad_personalization_signals=false`. Pengiriman memakai `transport_type: beacon` agar tidak memblokir navigasi `target=_blank`.

## 6. Consent dan privasi (PR-A)

- Default: nol request ke Google sebelum opt-in. Consent Mode v2 default `denied` untuk `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`; hanya `analytics_storage` yang dapat diberikan, melalui banner yang eksplisit (Terima/Tolak setara, tanpa dark pattern). Pilihan disimpan di cookie/localStorage pihak pertama bernama tetap, dapat dicabut lewat tautan "Pengaturan privasi" di footer (`SiteFooter.jsx`).
- GA4 hanya dimuat bila: `GA4_MEASUREMENT_ID` (server-only env, dibaca di server lalu diberikan ke komponen sebagai prop; pola mengikuti aturan "secrets server-only", ID pengukuran sendiri bukan rahasia tetapi tidak memakai `NEXT_PUBLIC_`) terisi, lingkungan produksi dengan indexing terbuka (staging/dev tidak pernah mengirim data), dan consent diberikan.
- Halaman `/privasi` (kebijakan privasi) tayang lewat CMS atau halaman statis; isi final WAJIB disediakan/disetujui user (kontak, entitas, retensi). Tidak boleh mengarang nama entitas, alamat, atau klaim kepatuhan hukum. Tinjauan kewajiban privasi Indonesia (UU PDP) dicatat sebagai item tinjauan hukum oleh user, bukan klaim kepatuhan oleh agen.
- CSP: tambah hanya origin yang terbukti diperlukan (perkiraan: `script-src https://www.googletagmanager.com`, `connect-src https://*.google-analytics.com https://*.analytics.google.com`, `img-src https://*.google-analytics.com`) dan hanya setelah diverifikasi di browser; pembaruan komentar di `headers.mjs` baris 2 dan tes headers. CSP tidak boleh dilonggarkan lebih dari itu.
- Retensi data GA4: 2 bulan (minimum) kecuali user memilih lain.

## 7. UTM untuk CTA kampanye (PR-B)

- Hanya untuk CTA kampanye yang tujuannya link order terverifikasi (allowlist `gofood.link`, `app.grab.com`), dikelola di CMS (field URL tujuan + kampanye) atau dibangun di server dari parameter kampanye tetap.
- UTM ditambahkan di server saat render (`utm_source=tinyosaka`, `utm_medium=website`, `utm_campaign=<slug kampanye>`, `utm_content=<placement>`), nilai dibatasi `[a-z0-9_-]`, panjang terbatas, tanpa PII. Pertanyaan terbuka: apakah platform (GoFood/Grab) mempertahankan atau menolak parameter UTM; tidak diasumsikan. Bila ditolak, UTM dipasang di URL internal landing (mis. `/promos?utm_...`) dan dibaca GA4, bukan di link platform.
- Host tujuan divalidasi ulang terhadap allowlist; link non-allowlist tidak dirender (fail closed). UTM tidak mengubah URL tersimpan di katalog.
- Halaman dengan UTM tetap memakai canonical tanpa query (periksa terhadap implementasi PR-2; tidak mengulang pekerjaan, hanya tes regresi).

## 8. Search Console (PR-E, manual/runbook)

Tidak ada kode. Runbook di `docs/` (usulan: bagian baru di dokumen runbook yang ada, oleh agen setelah persetujuan): verifikasi properti domain via DNS TXT (dilakukan user), submit `sitemap.xml` hanya setelah `INDEXING_*` flag produksi dibuka dan sitemap divalidasi, pemeriksaan URL, pemantauan cakupan, prosedur penarikan konten (alat penghapusan URL). Pra-syarat: domain final dan HTTPS (belum diputuskan). Staging tidak pernah didaftarkan.

## 9. Embed manual Instagram/TikTok (PR-C, bersyarat)

Penilaian privasi: embed resmi Instagram/TikTok memuat script dan cookie pihak ketiga, melacak pengunjung, dan memerlukan origin tambahan di CSP. Saat ini hanya YouTube-nocookie yang diizinkan. Rekomendasi default: TIDAK memuat script mereka. Opsi:
1. (Direkomendasikan) Kartu "Lihat di Instagram/TikTok": tautan keluar saja (`rel noopener noreferrer`), tanpa iframe/script, tanpa perubahan CSP.
2. Embed iframe/script dengan consent per-klik seperti pola YouTube di `PublishedMedia.jsx`: butuh kind media baru, validasi ID/URL allowlist di `src/server/media/validation.mjs` dan `src/server/pages/validation.mjs`, migrasi enum/kolom, dan CSP `frame-src` tambahan. Hanya dikerjakan bila user memilih dan mengonfirmasi akun/URL resmi.
Embed selalu dimasukkan manual per konten oleh Owner/Staff; tidak ada feed otomatis; tidak ada klaim konten dari akun yang tidak diverifikasi.

## 10. Template konten CMS (PR-D, bersyarat)

Template yang ada dikunci di kode (`templates.mjs`). Hanya tambah bila ada kebutuhan nyata: template halaman kampanye/promo (field: judul, ringkasan, badan, label CTA, platform target dari allowlist) dan blok "pengumuman". Field/rute tetap dimiliki kode; tidak ada fakta restoran (alamat/harga/jam) di template. Kerjakan hanya bila user mengonfirmasi kebutuhannya.

## 11. Acceptance criteria

- AC-1: Tanpa consent, halaman publik tidak membuat request ke domain Google dan tidak memuat skrip GA4 (diuji Playwright dengan blokir jaringan eksternal).
- AC-2: Setelah klik Terima, skrip GA4 dimuat; setelah Tolak atau pencabutan, tidak ada event terkirim dan pilihan bertahan antar halaman.
- AC-3: Banner consent dapat diakses keyboard/screen reader, tombol Terima dan Tolak setara, tautan "Pengaturan privasi" di footer membuka kembali pilihan.
- AC-4: Klik link platform di dialog menghasilkan tepat satu event `click_order` dengan `platform`, `product_slug`, `placement`, `page_path`, dan tanpa parameter lain; payload diuji dengan mock `gtag`/`dataLayer` (tanpa jaringan nyata).
- AC-5: Tidak ada event/parameter bernama `purchase`, `order_complete`, `value`, `currency`, `price`, URL order mentah, email, nama, atau ID pengguna (tes unit pada pembangun payload dengan daftar larangan).
- AC-6: Tidak ada pengiriman bila `GA4_MEASUREMENT_ID` kosong, lingkungan bukan produksi-terindeks, atau consent belum diberikan; kegagalan GA4 tidak merusak navigasi atau link order.
- AC-7: Link order tetap `target=_blank`, `rel="noopener noreferrer nofollow"`, host lolos allowlist; ShopeeFood tetap tidak tampil.
- AC-8: CSP produksi hanya menambah origin Google yang terdaftar di spec ini; tes unit `buildCsp` memastikan tanpa wildcard luas dan tanpa `unsafe-eval` produksi; E2E tidak menemukan pelanggaran CSP di konsol.
- AC-9: ID pengukuran tidak muncul di bundle klien sebagai variabel `NEXT_PUBLIC_`; tidak ada secret platform di klien/log.
- AC-10: CTA kampanye menghasilkan URL dengan UTM valid (karakter dan panjang terbatas); URL non-allowlist tidak dirender; URL tersimpan di katalog tidak berubah.
- AC-11: Canonical dan sitemap tidak berubah akibat parameter UTM (tes regresi); tidak ada `Restaurant`/`LocalBusiness` JSON-LD; tidak ada hreflang.
- AC-12: Halaman `/privasi` tersedia, tertaut dari banner dan footer, berisi teks yang disetujui user (bukan karangan agen).
- AC-13: Runbook Search Console ada, memuat langkah manual, urutan aman (flag indexing, sitemap), dan rollback; tidak ada langkah yang menyentuh produksi tanpa persetujuan.
- AC-14: (PR-C) Opsi 1: tautan keluar Instagram/TikTok tidak memuat skrip/iframe pihak ketiga. Opsi 2: nol request ke Instagram/TikTok sebelum klik consent; ID/URL divalidasi allowlist server-side; CSP minimal.
- AC-15: (PR-D) Template baru tidak memuat fakta restoran tidak terverifikasi; field divalidasi server-side; RBAC tidak berubah.
- AC-16: Tidak ada perubahan pada sync merchant (default OFF, tidak ada panggilan jaringan ke platform); tidak ada dashboard analytics di CMS.
- AC-17: Lint, build, unit, integration, Playwright E2E, dan pemeriksaan keamanan lulus; hasil nyata dilaporkan.

## 12. Dampak keamanan/RBAC, SEO, merchant sync

- Keamanan: perluasan CSP terkecil; ID dari env server; tidak ada input pengguna ke payload analytics; UTM disanitasi; embed (bila ada) memakai allowlist. RBAC tidak berubah: pengaturan tracking dan allowlist host adalah kode/env (Owner/dev), bukan CMS. Bila URL/kampanye CTA dikelola di CMS: Staff dan Owner boleh edit sesuai ADR-036/037, validasi server-side, audit aktor.
- SEO: tidak ada perubahan canonical/sitemap/robots; banner consent tidak boleh menghalangi konten (tidak mengubah LCP/CLS secara berarti; skrip dimuat setelah consent dan `afterInteractive`). Konten Indonesia saja. Search Console hanya langkah manual.
- Merchant sync: tidak terdampak. `click_order` hanya sinyal klik keluar; tidak menyiratkan order selesai atau hak API.

## 13. Tugas per peran

### backend
- PR-A: `src/server/public/config.mjs` (baca `GA4_MEASUREMENT_ID` + gerbang produksi/indexing, ekspor konfigurasi analytics aman); `src/server/public/data.mjs` dan `src/server/catalog/published.mjs` (sertakan `slug` produk pada order link bila belum ada); `src/server/security/headers.mjs` (+ tes) untuk CSP; `.env.example` (dokumentasi variabel).
- PR-B: pembangun URL UTM server-side + validasi allowlist (reuse `src/server/catalog/order-links.mjs`); bila kampanye di CMS: skema/migrasi (hanya ke DB test/dev setelah pra-cek), `src/server/pages/validation.mjs`, `templates.mjs`.
- PR-C (bila dipilih opsi 2): `src/server/media/validation.mjs`, `assets.mjs`, `src/server/db/schema.mjs` + migrasi, `src/app/api/cms/media/route.js`.
- PR-D: `src/server/pages/templates.mjs`, `validation.mjs`, `drafts.mjs`.
- Catatan ADR: usulkan teks ADR-041 (analytics+consent) ke user; PM/backend tidak mengubah AGENTS.md.

### frontend
- PR-A: komponen consent banner + loader GA4 + helper `trackEvent` di `src/features/public-site/` (client component kecil), dipasang di `src/app/(site)/layout.jsx`; tautan "Pengaturan privasi" di `SiteFooter.jsx`; panggilan `click_order` di `ProductOrderCard.jsx`; halaman `/privasi` di `src/app/(site)/privasi/page.jsx` (sitemap otomatis mengikuti aturan PR-2; periksa).
- PR-B: render CTA kampanye di `promos/page.jsx` dan komponen terkait dengan URL UTM dari server.
- PR-C: kartu tautan keluar (opsi 1) atau varian consent di `PublishedMedia.jsx` (opsi 2).
- PR-D: form CMS template baru di `src/features/cms` bila relevan.

### qa
- Unit: pembangun payload (AC-4, 5), gerbang config (AC-6, 9), UTM (AC-10), `buildCsp` (AC-8).
- Integration: konfigurasi publik tidak membocorkan env; RBAC edit CTA/template via API (bypass Staff -> aksi Owner-only tetap 403).
- E2E (Playwright, jaringan eksternal diblokir, GA4 dimock): AC-1, 2, 3, 4, 7, 11, 12, 14; axe pada banner; viewport mobile.
- Security: secret scan, audit dependensi, cek CSP di browser, regresi header.
- Manual (dicatat jujur bila tidak dijalankan): verifikasi di GA4 DebugView hanya dengan persetujuan terpisah dan properti uji.

## 14. Risiko

- Consent banner menurunkan data (diterima) dan dapat menambah CLS (mitigasi: ruang tetap, overlay bawah).
- Platform mungkin menghapus UTM atau menolak parameter tak dikenal (diuji manual, tanpa mengakses endpoint merchant otomatis; hanya navigasi publik).
- Pelonggaran CSP memperluas permukaan serangan (diminimalkan, diuji).
- Salah paham "click_order = order" oleh pemilik (mitigasi: dokumentasi dan nama event).
- Kepatuhan UU PDP butuh tinjauan hukum di luar agen.
- Embed Instagram/TikTok menambah pelacak pihak ketiga dan beban performa.
- Rollback: kosongkan `GA4_MEASUREMENT_ID` (tidak ada pemuatan), revert PR terkait, kembalikan CSP; tidak ada migrasi untuk PR-A/B/E.

## 15. Asumsi

- A-1: Properti GA4 dan Measurement ID dibuat oleh user; agen tidak mengaksesnya.
- A-2: Domain produksi dan DNS belum final; Search Console dan sitemap submission menunggu itu.
- A-3: Skrip `gtag.js` langsung (tanpa GTM) cukup untuk satu event.
- A-4: Opsi 1 (tautan keluar) untuk Instagram/TikTok bila user tidak memilih lain.
- A-5: Akun Instagram/TikTok resmi belum diverifikasi; tidak ada URL yang dikarang.
- A-6: Tidak ada pemicu `click_order` di luar dialog `ProductOrderCard` (jalur lain mengikuti pola komponen yang sama).

## 16. Pertanyaan terbuka

1. Setujui nama event `click_order` dan parameter (tabel bagian 5)? Perlu `view_menu_item`?
2. Setujui ADR-041 baru (menggantikan klausa "tanpa event GA4 baru" di ADR-040 dan memperluas CSP)?
3. Apakah Measurement ID GA4 sudah ada, dan GTM atau gtag langsung?
4. Pendekatan consent: banner opt-in (direkomendasikan, Consent Mode v2 denied-by-default) atau cukup notice tanpa banner? Wilayah target hanya Indonesia?
5. Siapa menyediakan teks `/privasi` (entitas, kontak, retensi)? Apakah ada tinjauan hukum UU PDP?
6. Retensi data GA4: 2 bulan atau 14 bulan?
7. UTM: apakah ada kampanye nyata dan siapa mengelola (CMS atau kode)? Boleh diuji manual bahwa GoFood/Grab mempertahankan UTM?
8. Instagram/TikTok: pilih opsi 1 (tautan keluar) atau opsi 2 (embed consent)? Apakah akun/URL resminya dan boleh ditampilkan?
9. Template CMS baru (PR-D) benar diperlukan atau cukup template yang ada?
10. Domain final dan jadwal pembukaan indexing produksi (pra-syarat Search Console)?
11. Host ShopeeFood resmi sudah dikonfirmasi (jika tidak, tetap tersembunyi)?

## 17. Status review PR-A (PM, 2026-10-20)

Dasar: pembacaan kode (analytics.mjs, AnalyticsConsent.jsx, config.mjs, headers.mjs, privasi/page.jsx, layout, footer, ProductOrderCard) + laporan agen (lint bersih, unit 217, build ok, Playwright 198 lulus). Tes tidak dijalankan ulang oleh PM.

Legenda: OK = terpenuhi (kode + tes otomatis); PARSIAL = kode sesuai tetapi belum dibuktikan di browser; BELUM; N/A = bukan cakupan PR-A.

| AC | Status | Catatan |
|---|---|---|
| AC-1 | PARSIAL | Komponen hanya dirender bila `analytics.enabled`; skrip hanya disisipkan di `activate()`. Jalur nol-request tanpa consent belum diuji di browser dengan GA aktif. |
| AC-2 | PARSIAL | Logika Terima/Tolak/persist (localStorage) benar di kode; tidak ada E2E consent aktif. Setelah pencabutan, skrip yang sudah dimuat tetap ada sampai reload (dimitigasi `ga-disable`, consent denied, dan `trackEvent` memeriksa consent). |
| AC-3 | PARSIAL | Tombol Terima/Tolak setara (keduanya outline), `role=region` berlabel, footer membuka kembali. Keyboard/axe pada banner aktif belum diuji. |
| AC-4 | OK (unit) | `buildClickOrderEvent` hanya 4 parameter + `transport_type: beacon`; diuji unit. Klik nyata di browser belum diuji. |
| AC-5 | OK | Daftar larangan event/parameter di `analytics.mjs`, builder fail closed. |
| AC-6 | OK | `getAnalyticsConfig` memerlukan format ID valid + `isIndexingOpen`; `trackEvent` tidak melempar dan memeriksa consent. |
| AC-7 | OK | Link order tetap `ORDER_LINK_REL`, `target=_blank`; ShopeeFood tidak diubah. |
| AC-8 | PARSIAL | `buildCsp({analytics})` menambah hanya 3 origin spec, tanpa unsafe-eval produksi; origin belum diverifikasi di browser sungguhan (spec mewajibkan). CSP dihitung di `next.config` saat start/build, jadi env GA4 harus ada saat build/start. |
| AC-9 | OK | `GA4_MEASUREMENT_ID` server-only; diberikan sebagai prop hanya bila aktif. Pemeriksaan bundle klien tidak dijalankan. |
| AC-10 | N/A | PR-B. |
| AC-11 | PARSIAL | Tidak ada perubahan canonical/sitemap/JSON-LD terlihat; tes UTM menunggu PR-B. Apakah `/privasi` masuk sitemap belum dipastikan (tidak ditemukan referensi). |
| AC-12 | BELUM | Halaman dan tautan banner+footer ada, tetapi isi masih placeholder `[ISI OLEH PEMILIK: ...]` (entitas, kontak, retensi, hak, tanggal). Tidak boleh tayang produksi sebelum diisi dan ditinjau user. |
| AC-13 | N/A | PR-E. |
| AC-14, AC-15 | N/A | PR-C/PR-D. |
| AC-16 | OK | Tidak ada perubahan merchant sync/dashboard CMS. |
| AC-17 | PARSIAL | Lint/unit/build/E2E dilaporkan lulus; integration dan security check (audit dependensi, secret scan) tidak dilaporkan. |

Cakupan placement: hanya `menu_card` terhubung (`ProductCard`). `menu_detail` dan `promo_cta` ada di allowlist tetapi belum dipasang; A-6 dan tabel bagian 5 belum penuh. `view_menu_item` belum diputuskan.

Gerbang sebelum PR-A boleh dirilis ke produksi: (1) user mengisi dan menyetujui teks `/privasi`; (2) uji manual/E2E consent aktif di staging dengan Measurement ID uji (banner, Terima/Tolak, persist, click_order via mock, tanpa pelanggaran CSP, axe); (3) putuskan retensi GA4 dan tinjauan UU PDP; (4) persetujuan eksplisit user atas ADR-041 (sudah dicatat di DECISIONS.md); (5) integration + security check dijalankan.
