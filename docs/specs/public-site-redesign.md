# Spec: Redesain visual menyeluruh tampilan publik Tiny Osaka

Status: Tahap 1 (header/footer/breadcrumb/404/error + token) SELESAI dikerjakan. Tahap 2-3 DISETUJUI user (2026-10-18), lihat bagian 16 (brief konkret konten + card menu). Tahap 4 (QA) ditunda ke satu putaran di akhir.
Tanggal: 2026-10-18. Penulis: PM. Branch implementasi yang disarankan: `feat/public-site-redesign` dari main terbaru (setelah `feat/catalog-csv-import` dan `feat/menu-card-order-popup` ter-merge; lihat R-1).
Permintaan user: "saya minta revisi semua tampilan yang tidak ada di folder admin" (kesal karena revisi sebelumnya hanya popup). Artinya redesain VISUAL seluruh tampilan publik, bukan hanya komponen tunggal.

Hubungan dengan spec lain:
- Melanjutkan dan memperluas `docs/specs/public-pages-shadcn-redesign.md` (DRAF, belum dikerjakan; fokus struktur shadcn, tanpa arah gaya). Spec ini MENGGANTIKAN spec itu sebagai rujukan implementasi setelah disetujui. Bagian struktur per halaman, daftar selector e2e, dan risiko di spec lama tetap berlaku kecuali yang diubah di bawah (terutama: tampilan link order kini ADA lewat popup, lihat bawah).
- `docs/specs/menu-card-order-popup.md` (popup order, ProductOrderCard/PlatformIcon/order-platforms): perilakunya WAJIB dipertahankan; redesain hanya mengubah tampilan.

## 1. Masalah dan tujuan

Masalah (hasil baca-saja):
- Hanya beranda yang bergaya baru (`HomeContent.jsx` + `.home-theme` di `src/styles/home.css`, 38 baris). Sisa situs memakai CSS legacy `src/styles/globals.css` (236 baris: `.hero`, `.prose-panel`, `.menu-card`, `.page-intro`, `.ordering-section`, dst.), font Arial, header tanpa menu mobile, footer polos, halaman terbit digenerikkan oleh satu `PublishedPage` di `PublishedContent.jsx`.
- Katalog (39 produk, foto dari Grab) tampil sebagai `article.prose-panel` bergaya dokumen, bukan kartu makanan yang menggugah; tombol "Pesan" di `ProductOrderCard.jsx` memakai kelas `.button.button-red` legacy dan `PlatformIcon` hanya lingkaran huruf placeholder.
- Hasil: situs terasa seperti draf teks, belum "conversion-first street food" (REQUIREMENTS/CONTENT_AND_UX: ekspresif Osaka, CTA pesan jelas).

Tujuan: satu bahasa visual yang konsisten di SEMUA halaman publik, mobile-first, menonjolkan foto makanan dan CTA "Pesan", tanpa mengubah konten, data, RBAC, skema, atau perilaku bisnis.

## 2. Tujuan visual terukur

- V-1: Satu sumber token (warna, radius, bayangan, skala tipografi, spasi) di satu scope CSS situs; 0 nilai warna hex di komponen publik di luar token (dicek grep). Admin tidak terpengaruh.
- V-2: Semua halaman publik memakai komponen bersama yang sama untuk header, footer, judul halaman, kartu, tombol; 0 pemakaian kelas legacy `.prose-panel`, `.menu-card`, `.page-intro`, `.hero*`, `.button-red` di `src/features/public-site` dan `src/app/(site)` setelah tahap akhir (grep).
- V-3: Di setiap halaman, CTA utama ("Lihat menu" / "Pesan") terlihat tanpa scroll pada 390x844 (di atas lipatan) dan memenuhi kontras AA.
- V-4: Kartu produk menampilkan foto rasio tetap 4:3, nama, harga, dan tombol "Pesan" dengan target sentuh >= 44 px; grid 1/2/3-4 kolom pada 390/768/1280.
- V-5: Skala tipografi: maksimum 5 ukuran teks (kecil, isi, lead, h2, h1) yang dipakai lewat token; line-height isi >= 1,5; lebar baris prosa <= 70 karakter.
- V-6: Tidak ada regresi CWV: LCP <= 2,5 s dan CLS <= 0,1 sebagai target pada `/` dan `/menu`; Lighthouse mobile >= 90 (target QA, bukan janji), dibandingkan dengan baseline yang DIAMBIL SEBELUM tahap 1.

## 3. Keputusan terkait (dipatuhi)

- ADR-028/029/031: shadcn/Radix standar UI; beranda memakai Card/Button/Badge + token ter-scope; logo lentera/ikon dan brand asset: lihat `docs/BRAND_ASSETS.md` (logo asli `01b - Logo Transparan.png` disetujui; turunan `public/brand/tiny-osaka-logo.png`).
- ADR-036/037: halaman dan katalog langsung tayang saat simpan; katalog kartu sederhana; link order ditampilkan hanya lewat popup (spec popup, fail-closed sampai `OFFICIAL_ORDER_HOSTS` disetujui).
- ADR-038/039: situs Indonesia saja, URL tanpa prefix bahasa, tanpa kolom locale.
- AGENTS.md: token desain tetap di kode (bukan owner-editable), tanpa `Restaurant`/`LocalBusiness`, tanpa dependency baru tanpa bukti, tanpa alamat/harga/klaim/URL menu tak terverifikasi, tanpa checkout/inventori/dashboard analytics, SEO Indonesia, GA4 hanya niat order (belum dipasang), situs tetap `noindex`.
- CONTENT_AND_UX: logo dan foto asli user adalah acuan; merek Jepang lain hanya moodboard, jangan disalin.
- Tidak ditemukan konflik. Tidak ada keputusan palet/font baru yang disetujui; token sekarang: cream `#faf5eb`, merah `#b52f24`, tinta `#25251f`, Arial.

## 4. Inventaris tampilan publik yang berubah

Rute (`src/app/(site)`, semua `force-dynamic`): `/` , `/menu`, `/menu/[slug]`, `/about`, `/promos`, `/location`, `/guides`, `/guides/[slug]`, `not-found.jsx`, `error.jsx`, plus `src/app/global-not-found.jsx` (bila ikut `globals.css`).

Komponen `src/features/public-site/components/`: `SiteHeader`, `SiteFooter`, `HomeContent` (juga dipakai pratinjau editor CMS `src/features/cms/pages/PagePreview.jsx`), `PublishedContent` (`PublishedPage`, `CatalogCards`, `PublishedProduct`, `publishedMetadata`), `ProductOrderCard`, `PlatformIcon`, `order-platforms.mjs` (logika, tidak diubah), `ProductCardImage`, `PublishedMedia`, `PublicRichText`, `OrderingNotice`, `MenuCard`, `PageIntro`; data fixture `content.js`, `page-content.js`, `fixtures/*`.
Styling: `src/styles/globals.css`, `src/styles/home.css` (dilebur), kemungkinan `src/styles/site.css` baru. Komponen UI bersama: `src/components/ui/*` (hanya penambahan varian publik; jangan ubah varian yang dipakai admin, lihat R-4).
Aset: `public/brand/*`, `public/images/*` (tidak ditambah tanpa jawaban Q-5).

## 5. Arah desain (pilih satu)

Semua opsi: memakai shadcn/Tailwind yang terpasang, tanpa dependency baru, tanpa klaim bisnis baru, foto makanan sebagai bintang.

- Opsi A, "Izakaya Lentera" (editorial hangat): cream hangat, merah lentera sebagai aksen tunggal, tinta gelap untuk teks; kartu bersudut sedang (radius 12-16 px), bayangan lembut, heading serif/slab atau display tebal, motif tipis garis ala noren/lentera sebagai pemisah section. Mood: ramah, kuliner, "kedai kecil Osaka". Paling dekat dengan beranda sekarang dan logo lentera; risiko gaya sedikit klasik.
- Opsi B, "Street Poster" (berani, kontras tinggi): blok warna penuh (merah/krem/arang), tipografi sangat tebal dan besar, kartu bersudut kecil dengan garis tebal 2 px dan bayangan offset ala stiker, label harga seperti stempel. Mood: jalanan Dotonbori, energik. Paling "konversi", tetapi butuh disiplin kontras dan lebih berat dirawat; mudah terlihat ramai.
- Opsi C, "Clean Modern Menu" (minimal): banyak ruang putih, foto besar, tipografi sans bersih, aksen merah hanya untuk CTA dan harga. Mood: modern, cepat dibaca, aman performa. Paling mudah dirawat dan paling ringan, tetapi paling kurang khas/Osaka.

Rekomendasi PM: Opsi A dengan sentuhan B terbatas pada CTA dan label harga (tombol merah tegas, harga tebal). Alasan: konsisten dengan logo lentera dan beranda yang sudah disetujui (ADR-031), foto makanan tetap dominan, tidak butuh aset baru, risiko kontras dan performa terendah. Palet tetap memakai token sekarang kecuali user menetapkan lain (Q-2).

## 6. Pembagian per halaman (struktur sama di mode fixture dan terbit)

- Shell (semua halaman): header lengket tipis dengan logo, 4 tautan (Menu, Tentang, Promo & event, Pesan -> `/#ordering`; label dan `aria-label` "Navigasi utama" dipertahankan), menu mobile `Sheet` (<768 px), CTA header "Pesan" yang menuju `/menu`; footer berisi merek, tautan Panduan/Promo/Lokasi, "Kembali ke atas", tanpa alamat/jam/klaim; skip link tab pertama; banner "PRATINJAU" di mode fixture; breadcrumb di halaman non-home.
- Beranda `/`: hero (kicker, h1, ringkasan, 2 CTA, foto Takoyaki 4:3 dipertahankan atau diganti bila Q-5), strip "cara pesan" HANYA bila teksnya sudah ada di konten (tidak mengarang langkah), cerita (rich text), menu unggulan (4 kartu produk + "Lihat seluruh menu"), kartu tentang, `OrderingNotice`.
- Menu `/menu`: judul halaman, grid kartu produk (foto, nama, harga, tombol Pesan, deskripsi diringkas 2 baris), keadaan kosong jujur. Tidak ada filter/kategori/pencarian (ADR-037 menghapus kategori).
- Detail `/menu/[slug]`: breadcrumb, foto besar, h1, harga, deskripsi, tombol "Pesan" (membuka popup yang sama bila ada link; bila tidak ada link, tombol tidak ada, sesuai spec popup), tombol kembali ke menu. Catatan: apakah detail menampilkan tombol Pesan = Q-6. (DIPUTUSKAN user: TANPA tombol Pesan di detail; lihat bagian 16.)
- Tentang `/about`: header halaman, dua kartu (cerita, layanan), media; bagian kosong tidak dirender.
- Promo `/promos`: header halaman, satu kartu konten + media; keadaan kosong jujur. Tidak ada kartu diskon/kode/tanggal.
- Lokasi `/location`: header halaman, kartu dengan `dl` (city/service/hours/coverage hanya yang terisi; fixture "Menunggu verifikasi"). Tanpa peta/alamat.
- Panduan `/guides`: grid kartu artikel (judul tertaut, ringkasan, cover dari media pertama bila ada).
- Artikel `/guides/[slug]`: breadcrumb, kicker, h1, ringkasan, media, prosa lebar baca, tautan bawah ("Semua panduan", "Lihat menu").
- 404/error: halaman ramah bergaya sama dengan tautan ke beranda dan menu.
- Popup order (dari spec popup): `ProductOrderCard` dan dialog digayai ulang (tombol "Pesan" memakai `Button` shadcn, baris platform sebagai tombol besar). Perilaku dipertahankan persis: tanpa link tidak ada pemicu; satu link tetap dialog; `rel="noopener noreferrer nofollow"`, `target="_blank"`, judul/deskripsi dialog, urutan platform, fokus kembali ke pemicu, copy "Pilih aplikasi untuk memesan.". `PlatformIcon` tetap placeholder bertanda bukan logo resmi sampai Q-4 dijawab.

## 7. Scope dan out of scope

Dalam scope: semua di bagian 4 dan 6; token dan font bila disetujui; penambahan komponen shadcn yang dibutuhkan dengan menyalin manual ke `src/components/ui/` (tanpa CLI dan tanpa dependency baru; `radix-ui` umbrella sudah memuat kebutuhan); pembaruan selector test.

Out of scope:
- `src/app/admin`, `src/features/cms` (kecuali efek samping pratinjau Beranda di `PagePreview.jsx`), `src/app/api`, `src/server/*` (kecuali pertanyaan Q-5), `drizzle/`.
- Fitur baru: checkout, keranjang, stok, pencarian, filter, kategori, ulasan/testimoni, peta, formulir, FAQ, paginasi blog, tanggal/penulis, mode gelap, multi-bahasa.
- Perubahan konten bisnis: alamat, jam, harga, promo, klaim bahan, URL menu, testimoni, angka/bukti sosial.
- Canonical, sitemap, JSON-LD (`Restaurant`/`LocalBusiness` dilarang), hreflang, ubah `noindex`; GA4 dan consent; tampilan merchant sync; pengisian `OFFICIAL_ORDER_HOSTS`.
- Pembuatan foto/ilustrasi baru oleh agen, pengunduhan logo merek platform, pengoptimalan hosting gambar (kecuali disetujui di Q-5).

## 8. Dampak keamanan/RBAC, SEO, merchant sync

- Keamanan/RBAC: tidak ada perubahan. Tidak ada endpoint, tidak ada izin baru. Tautan order tetap hanya berasal dari server yang sudah memfilter (`publicOrderLinks`); FE tidak menyusun URL. Konten rich text tetap dirender tanpa HTML mentah (tes `<script>` literal tetap lulus).
- SEO: `lang="id"`, tepat satu `h1`, urutan heading tanpa lompat, `metadata` dari `publishedMetadata`/`getPageMetadata` tidak diubah, `noindex, nofollow` tetap, tanpa JSON-LD, tanpa hreflang, konten teks tetap server-render (Client Component hanya menu mobile, dialog order, media yang sudah client). Tautan internal tanpa prefix bahasa.
- Merchant sync: tidak ada perubahan; tidak ada panggilan ke platform; menyimpan tidak sync.
- Foto produk dari Grab: hak pakai foto belum terverifikasi di repo; redesain memakai foto yang sudah ada di data dan tidak menambah/menyalin foto platform baru. Lihat Q-5.

## 9. Acceptance criteria

Fondasi dan shell
- AC-1: Satu scope token situs (mis. `.site-root` pada `<body>` layout `(site)`) berisi semua token warna/radius/bayangan/tipografi; `.home-theme` dilebur; admin tidak berubah (diff tidak menyentuh `src/app/admin`, `src/features/cms` kecuali tidak ada, `src/app/api`, `src/server`, `drizzle/`, `package.json`, lockfile; dengan pengecualian Q-5 bila disetujui).
- AC-2: Semua rute publik (12 rute fixture di `tests/e2e/fixtures.js`, rute terbit di `tests/published-e2e`) memiliki `<html lang="id">`, tepat satu `<h1>`, `main#main-content` yang menerima fokus dari skip link, dan `robots: noindex, nofollow`.
- AC-3: Pada 320, 390, 768, 1280 px tidak ada scroll horizontal (`scrollWidth <= clientWidth`) di semua rute publik, termasuk dengan dialog order terbuka.
- AC-4: Header: <768 px ada tombol menu (`Sheet`) berlabel "Buka menu"; Sheet memuat 4 tautan yang sama; Esc menutup, fokus kembali ke pemicu, latar inert; >=768 px nav inline 4 tautan dan tombol menu tersembunyi. `nav[aria-label="Navigasi utama"]` berisi tepat 4 tautan; `nav[aria-label="Halaman lainnya"]` berisi Panduan, Promo, Lokasi; `nav[aria-label="Jejak halaman"]` ada di semua halaman non-home dengan item terakhir `aria-current="page"`.

Halaman
- AC-5 (home): hero memuat h1 dan 2 CTA (href `/menu` dan `/about`), gambar 4:3 ber-`alt`, preload hanya satu gambar LCP; bagian menu menampilkan s.d. 4 kartu atau "Menu belum diterbitkan." bila kosong.
- AC-6 (menu/detail): setiap kartu produk menampilkan foto 4:3, nama (satu tautan ke `/menu/<slug>`), harga `Rp` via `formatPrice`, dan tombol "Pesan" hanya bila ada link valid; tidak ada checkbox/combobox/modifier. Detail menampilkan h1, harga tunggal, foto ber-alt, tautan kembali.
- AC-7 (about/promos/location/guides): field CMS tampil sesuai template; field kosong tidak merender heading kosong; keadaan tanpa data memakai teks yang sudah ada; `/guides` menampilkan 3 kartu; artikel menampilkan breadcrumb, h1, ringkasan, rich text, media, dua tautan bawah; slug tak dikenal tetap 404.
- AC-8 (popup order, perilaku dipertahankan): semua AC perilaku di `menu-card-order-popup.md` (AC-1 s.d. AC-8, AC-15, AC-17 di spec itu) tetap lulus setelah redesain: klik card/tombol membuka dialog, fokus trap, Esc, fokus kembali, `rel`, urutan platform, tanpa link tanpa pemicu, tanpa JS konten tetap tampil.

Aksesibilitas dan kualitas
- AC-9: axe (wcag2a, wcag2aa, wcag21a/aa, wcag22aa) = 0 pelanggaran dan 0 `incomplete` pada semua rute publik di 375 dan 1280 px, termasuk dengan Sheet menu dan dialog order terbuka.
- AC-10: Kontras teks normal >= 4,5:1, teks besar dan komponen UI >= 3:1; fokus terlihat (indikator >= 2 px) pada semua kontrol; target sentuh >= 44x44 px untuk tautan nav, tombol, dan tombol platform; `prefers-reduced-motion` mematikan animasi bergerak.
- AC-11: Tidak ada `application/ld+json`, `link[hreflang]`, `rel=alternate`, tautan berawalan `/id` atau `/en`; `/en/*` dan `/id/*` tetap 404 biasa.
- AC-12: Tidak ada permintaan jaringan ke origin selain server uji dan tidak ada runtime error/hydration error di konsol (guard `fixtures.js` lulus); tidak ada font/CSS pihak ketiga (font, bila diubah, self-host lewat `next/font` saat build).
- AC-13: Tes yang ada tetap hijau setelah selector diperbarui tanpa melemahkan assertion keamanan/aksesibilitas: `npm run lint`, `npm run build`, `tests/e2e`, `npm run test:published-e2e`, `npm run test:cms-pages-e2e`, `node --test tests/unit/page-content.test.mjs tests/unit/home-draft.test.mjs tests/unit/order-platforms.test.mjs tests/unit/catalog-cards-ui.test.mjs`, `npm run test:public-db`, `npm run security:check` (yang tidak bisa dijalankan dilaporkan "tidak dijalankan").
- AC-14: Pratinjau Beranda di editor CMS (`PagePreview`) tetap tampil dan lulus `test:cms-pages-e2e`.
- AC-15: Lighthouse mobile (build produksi lokal) pada `/`, `/menu`, `/guides/takoyaki` dicatat dengan angka aktual dibanding baseline sebelum redesain; target >= 90 empat kategori; di bawah 90 dicatat sebagai risiko residual. CLS <= 0,1 dan LCP <= 2,5 s sebagai target.
- AC-16: Hasil per tahap didokumentasikan dengan tangkapan layar 320/390/768/1280 yang dilampirkan di PR (untuk persetujuan visual user).

## 10. Urutan kerja bertahap (setiap tahap dihentikan untuk dilihat dan disetujui user)

Tahap 0 (PM/user): jawab pertanyaan terbuka bagian 12; pilih arah A/B/C. QA mengambil baseline Lighthouse dan tangkapan layar kondisi sekarang SEBELUM kode diubah.
Tahap 1, fondasi + shell: token situs, font (bila ada), `SiteHeader` (+Sheet), `SiteFooter`, breadcrumb, banner, 404/error, `OrderingNotice`. Hasil: semua halaman sudah berganti bingkai. Persetujuan visual user.
Tahap 2, beranda + katalog: `HomeContent`, kartu produk (`CatalogCards`, `ProductOrderCard`, dialog order, `PlatformIcon`), `/menu`, `/menu/[slug]`. Persetujuan visual user.
Tahap 3, marketing + blog: about, promos, location, guides, artikel, rich text/prosa. Persetujuan visual user.
Tahap 4, QA penuh dan pembersihan: pembaruan selector, suite penuh, axe, Lighthouse, CSS legacy dihapus setelah `grep` membuktikan tidak dipakai admin/auth/not-found (jangan hapus `.auth-*`, `.cms-*`, `.published-*` yang masih dipakai). Maks 2 putaran perbaikan.
Disarankan satu PR per tahap (rollback mudah). Tidak ada commit/push/deploy tanpa izin terpisah.

## 11. Tugas per peran

backend: kemungkinan tidak ada. Konfirmasi `src/server/public/data.mjs` dan `src/server/public/view-models.mjs` sudah mengirim data yang dibutuhkan (guide `fields.summary`, `media[]`; produk judul, deskripsi, harga, media, `orderLinks`). Bila butuh field/query baru (cover guide, gambar optimasi) STOP dan ajukan spec terpisah. Tidak ada migrasi. Tidak ada perubahan `OFFICIAL_ORDER_HOSTS`.

frontend (file terdampak): `src/styles/globals.css`, `src/styles/home.css` (lebur), `src/styles/site.css` (baru, opsional); `src/app/(site)/layout.jsx` dan semua `src/app/(site)/**/page.jsx`, `not-found.jsx`, `error.jsx`, `src/app/global-not-found.jsx`; `src/features/public-site/components/*` (daftar bagian 4; `order-platforms.mjs` tidak diubah logikanya); `src/features/public-site/{content.js,page-content.js,fixtures/*}` (salinan dirapikan tanpa klaim baru); `src/components/ui/*` (tambah varian publik atau komponen baru yang disalin manual, tanpa mengubah perilaku admin). Larangan: dependency baru, perubahan copy bisnis, gambar/alamat/harga/promo karangan, logo merek platform yang digambar ulang atau diunduh.

qa (file terdampak, selector berbasis class yang patah harus diperbarui bersama FE, bukan dilonggarkan): `tests/e2e/{navigation,accessibility,public-routes}.spec.js`, `tests/e2e/fixtures.js`, `tests/published-e2e/public.spec.mjs`, `tests/cms-pages-e2e/pages.spec.mjs` dan `scripts/run-cms-pages-qa.mjs` (pratinjau Beranda), `tests/unit/catalog-cards-ui.test.mjs`, `tests/integration/public-order-links.test.mjs` (harus tetap hijau tanpa perubahan). Tambahan: matriks viewport 320/390/768/1280, uji Sheet menu, axe pada Sheet/dialog terbuka, uji kontras otomatis, tiga mode (fixture, terbit-kosong `QA_PUBLIC_EMPTY=1`, terbit-berisi), Lighthouse sebelum/sesudah, tangkapan layar per tahap.

## 12. Pertanyaan terbuka (HARUS dijawab sebelum implementasi)

(Sebagian besar sudah dijawab user; lihat bagian 16.1. Sisa yang masih terbuka ada di 16.9.)

- Q-1 Arah gaya: Opsi A (rekomendasi), B, atau C (bagian 5)? Sebutkan 1-3 situs referensi yang disukai (tautan) sebagai moodboard (bukan untuk disalin) dan 1-3 kata mood (mis. hangat, berani, bersih). -> DIJAWAB: Opsi A.
- Q-2 Warna merek: tetap cream `#faf5eb` / merah `#b52f24` / tinta `#25251f` (rekomendasi), atau ada palet/hex merek resmi lain? Aksen kedua (mis. kuning hangat) diizinkan? -> DIJAWAB: bebas; tahap 1 memakai token + aksen kuning `#e9a93b`.
- Q-3 Font: tetap Arial/sistem (tercepat, rekomendasi bila tidak ada preferensi), atau font tertentu? Bila ada, sebutkan nama dan lisensi (mis. Google Fonts open license), dimuat self-host lewat `next/font` saat build (bukan dependency baru; perlu persetujuan eksplisit). -> DIJAWAB: bebas; tahap 1 memakai Plus Jakarta Sans via `next/font`.
- Q-4 Logo dan aset: pakai logo yang ada (`01b - Logo Transparan.png` dan turunan lentera) apa adanya? Logo GoFood/GrabFood/ShopeeFood: tetap placeholder bertanda sampai Anda menyediakan file resmi dan konfirmasi hak pakai, atau pilih tombol teks saja? -> Belum dijawab; default: placeholder bertanda tetap.
- Q-5 Foto hero dan foto produk: hero beranda tetap foto Takoyaki Shio Negi (`public/images`) atau foto lain yang Anda sediakan? Foto produk 39 item berasal dari Grab; apakah Anda mengonfirmasi boleh dipakai di situs sendiri, dan apakah kualitas/ukurannya cukup (jika perlu pemrosesan gambar atau cover guide, itu spec terpisah)? -> DIJAWAB sebagian: foto dari CMS.
- Q-6 Detail produk `/menu/[slug]`: tampilkan tombol "Pesan" (popup yang sama)? Rekomendasi: ya, hanya bila ada link valid. -> DIJAWAB user: TIDAK, detail tanpa tombol Pesan (menggantikan rekomendasi).
- Q-7 Urutan terhadap pekerjaan lain: setuju redesain dimulai setelah `feat/catalog-csv-import` dan `feat/menu-card-order-popup` ter-merge (menghindari konflik di `PublishedContent.jsx`)? Dan setuju 4 tahap dengan persetujuan visual di tiap tahap? -> Pengerjaan berjalan di `feat/public-site-redesign`; tahap 1 sudah selesai.

## 13. Risiko

- R-1 Konflik file: working tree sekarang memuat perubahan popup (`PublishedContent.jsx`, `globals.css`, `ProductOrderCard.jsx`, dst.). Mitigasi: redesain dimulai dari main setelah merge; jangan menumpuk di branch `feat/catalog-csv-import`.
- R-2 Regresi test berbasis class CSS (banyak): selector diperbarui di PR yang sama.
- R-3 Redesain "hanya kosmetik" tidak memuaskan lagi (keluhan user sebelumnya): mitigasi tahap + tangkapan layar + persetujuan visual per tahap dan jawaban Q-1 sebelum mulai.
- R-4 `button.jsx`/`card.jsx` dipakai admin: jangan ubah varian bersama; tambah varian atau kelas di sisi publik; cek `test:cms-pages-e2e`.
- R-5 Kebocoran CSS: `globals.css` diimpor juga oleh admin/not-found global; reset global memengaruhi shadcn. Scope token dan reset di `.site-root`; periksa `grep` sebelum hapus CSS.
- R-6 Performa: 39 foto produk dan kartu banyak memperburuk LCP/INP; mitigasi: rasio tetap, `sizes` benar, `loading=lazy` selain kartu pertama, JS client minimal, Lighthouse vs baseline. Gambar hero `unoptimized` JPEG 1600x1200 tetap sampai keputusan terpisah.
- R-7 Kontras pada merah `#b52f24` di atas cream/tinta atau teks muted `#625c52`; Opsi B paling berisiko. Mitigasi: cek axe dan perhitungan kontras di tahap 1.
- R-8 Tergoda menambah bukti sosial, angka, atau klaim agar tampak "lebih meyakinkan": dilarang; PM meninjau teks.
- R-9 Placeholder logo platform dapat terlihat seperti logo resmi: tetap bertanda placeholder di kode sampai Q-4.
- R-10 Hak pakai foto Grab (Q-5) belum terverifikasi.

Rollback: revert PR/commit UI; tidak ada skema/data CMS yang berubah. Tidak ada aksi cloud.

## 14. Asumsi

- A-1: "Semua tampilan yang tidak ada di folder admin" = semua rute di `src/app/(site)`, komponen `src/features/public-site`, styling publik, dan not-found/error; termasuk popup order dan katalog.
- A-2: Redesain visual dan struktur komponen; bukan konten, skema, atau fitur baru.
- A-3: Tanpa dependency baru; shadcn disalin manual bila perlu.
- A-4: Situs tetap `noindex` sampai spec canonical/sitemap Phase 3.
- A-5: Mode fixture dan terbit sama-sama dipertahankan memakai komponen yang sama (keputusan menghapus mode fixture terpisah).

## 15. Ringkasan untuk user

Spec ini merombak tampilan SEMUA halaman publik (beranda, menu, detail produk, tentang, promo, lokasi, panduan, 404/error, header/footer, kartu dan popup order), bukan hanya popup; admin tidak disentuh. Saya usulkan 3 arah gaya: A "Izakaya Lentera" (hangat, rekomendasi), B "Street Poster" (berani), C "Clean Modern". Pengerjaan 4 tahap (fondasi+header/footer, beranda+menu, halaman lain+blog, QA), dan Anda melihat serta menyetujui hasilnya per tahap. Perilaku popup order dipertahankan. Sebelum mulai saya butuh jawaban: arah gaya + referensi situs (Q-1), warna merek (Q-2), font (Q-3), logo/aset dan logo platform (Q-4), foto hero/produk termasuk izin foto Grab (Q-5), tombol Pesan di halaman detail (Q-6), dan waktu mulai setelah dua branch fitur ter-merge (Q-7). Spec lama `public-pages-shadcn-redesign.md` digantikan oleh spec ini setelah disetujui.

---

## 16. Brief tahap 2-3: konten semua halaman + card menu

Status: DISETUJUI user untuk tahap 2-3 (2026-10-18). Hanya perubahan tampilan/struktur komponen publik; tanpa kode backend, skema, atau dependency.

### 16.1 Konteks dan keputusan final user

Tahap 1 hanya mengubah bingkai (header, footer, breadcrumb, banner, 404/error, token `src/styles/site.css`). User benar: ISI tiap halaman belum dirapikan dan katalog menu belum berupa card. Tahap 2-3 mengubah ISI SEMUA halaman publik.

Keputusan final (tidak ditanyakan ulang, tidak ditafsirkan ulang):
- Gaya tetap arah A "Izakaya Lentera" seperti sekarang. Warna/font bebas dalam arah itu; tahap 1 sudah memakai Plus Jakarta Sans (`--font-site`, `next/font`), token di `.site-root` (`src/styles/site.css`): cream `#faf5eb`, merah `#b52f24` (deep `#93241c`), tinta `#25251f`, kertas `#fffdf8`, aksen kuning lentera `#e9a93b` (`--site-lantern`). Pakai token, jangan hex baru di komponen.
- Foto dari CMS (produk: `catalog.media`; halaman: `page.media`). Tidak menambah foto, tidak mengambil foto dari luar.
- Detail produk `/menu/[slug]` TANPA tombol Pesan (tombol Pesan hanya di card). Menggantikan rekomendasi Q-6.
- Tidak ada klaim, alamat, jam, harga, bahan, URL, testimoni, angka, atau fitur baru yang tak terverifikasi. Teks bisnis hanya dari CMS atau teks fallback yang sudah ada di repo.
- Tes ditunda: tahap 2 dan 3 TIDAK menjalankan suite penuh per tahap; satu putaran qa di akhir (setelah tahap 3). Frontend cukup memastikan `npm run lint` dan `npm run build` lulus dan melaporkan hasil aktual; selector test yang patah dicatat untuk qa, bukan dilonggarkan. Berlaku sampai user menyatakan lain.

### 16.2 Temuan kondisi sekarang (baca-saja)

- Beranda (`HomeContent.jsx`, `.home-theme` di `home.css`) sudah bergaya baru tetapi: token duplikat dengan `.site-root`; menu unggulan hanya memanggil `CatalogCards` lama; `home-about-card` dan `home-story` masih minimal; tidak ada pemisah visual antar section.
- `/menu` terbit: `PublishedPage` generik, `section.page-section.container.published-content` berisi h1 polos, ringkasan, rich text, media halaman, lalu `CatalogCards` -> `.menu-grid` (legacy, 3 kolom/1 kolom) -> `ProductOrderCard` -> `article.prose-panel`. Urutan isi card salah untuk makanan: judul, deskripsi, harga, BARU foto (`ProductCardImage`, `.product-card-image` 4:3 dengan `margin-block: 1rem`), lalu tombol `.button.button-red`. Harga hanya `<p>` polos. Tidak memakai `PageIntro`/breadcrumb.
- `/menu/[slug]` terbit (`PublishedProduct`): tautan kembali, h1, deskripsi, harga `<p>`, media memakai `PublishedMedia` (max 640 px, `object-contain`), tanpa card, tanpa breadcrumb. Mode fixture memakai `MenuCard` + `.menu-placeholder` + `.detail-grid` + `.prose-panel` (legacy).
- `/about`, `/promos`, `/location`, `/guides`, `/guides/[slug]` terbit: semuanya lewat `PublishedPage` yang sama (h1 polos + `<p>` + `PublicRichText` tanpa wrapper tipografi + `Media` + h2 polos + `dl.info-list` untuk lokasi + `<ul>` tautan untuk daftar panduan). Daftar panduan hanya `<ul>` berisi tautan (tanpa ringkasan/cover). Rich text tidak punya kelas prosa (`.home-prose` hanya ada di `.home-theme`).
- Mode fixture (`usesPublishedContent()` false): setiap `page.jsx` punya markup sendiri (`PageIntro`, `MenuCard`, `.editorial-grid`, `.guide-article`, `.about-mark`, `.service-strip`, `.related-section`). Tampilan harus ikut seragam, tetapi placeholder foto tetap berlabel contoh/pratinjau (tidak dipalsukan jadi foto asli).
- `OrderingNotice` (dipakai di fixture dan terbit) menampilkan kartu "GoFood/GrabFood" + "belum tersedia" di panel merah; restyle saja, teks dan perilaku tidak diubah.
- `PagePreview` (CMS): beranda memakai `HomeContent preview` dengan `.home-theme` sebagai pembungkus token karena admin berada di luar `.site-root`; halaman selain beranda hanya Card admin (bukan tampilan publik). Konsekuensi: pembungkus preview HARUS tetap membawa token sendiri.
- Komponen `src/components/ui/` yang tersedia: `card` (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction), `badge`, `button`, `separator`, `breadcrumb`, `sheet`, `dialog`, `alert`, `alert-dialog`, `table`, dst. Semua yang dibutuhkan sudah ada.

### 16.3 Aturan bersama semua halaman (tahap 2-3)

- Satu komponen judul halaman untuk SEMUA rute non-beranda (fixture dan terbit): memakai `Breadcrumb` (`nav[aria-label="Jejak halaman"]`, item terakhir `aria-current="page"`), kicker (`eyebrow`), tepat satu `h1`, ringkasan sebagai lead (<= 70 karakter per baris), dan garis pemisah `Separator`. Boleh memperbarui `PageIntro.jsx` dan memakainya juga di `PublishedPage`/`PublishedProduct` (sekarang tidak). Hapus tag "pratinjau" hanya di mode terbit; di fixture tetap ada.
- Pola section: `container` + ritme vertikal konsisten (token spasi, mis. 3-5 rem desktop, 2-3 rem mobile), pemisah antar section dengan `Separator` atau garis noren tipis (kuning lentera) yang sudah ada di footer; maksimal satu panel berwarna penuh per halaman (blok pemesanan merah di bawah).
- Prosa (rich text) dibungkus satu kelas prosa bersama (mis. `.site-prose`) pada `PublicRichText`: lebar <= 65-70ch, line-height 1,75, h2/h3 berskala token, daftar ber-bullet/angka terlihat, tautan bergaris bawah ber-kontras AA, `overflow-wrap: anywhere`. Dipakai sama di beranda, about, promos, location, artikel.
- Media halaman (`PublishedMedia`): bingkai radius token, bayangan `--site-shadow`, keterangan (`figcaption`) kecil di bawah, lebar mengikuti kolom; jangan mengubah logika consent YouTube/onError.
- Kartu = `Card` shadcn dengan kelas publik (radius 12-16 px, `bg-card`, `border`, `shadow` ringan, hover mengangkat <= 2 px dengan transisi yang dimatikan `prefers-reduced-motion`). Tidak ada gradien/ornamen baru selain token yang ada.
- Warna lewat token CSS (`--primary`, `--site-lantern`, dll). Hapus kelas legacy (`.prose-panel`, `.menu-card`, `.menu-grid`, `.button-red`, `.page-section`, `.published-content`) dari komponen publik yang disentuh; definisinya baru dihapus pada tahap QA akhir setelah grep.
- Empty state: jika field/CMS kosong, bagian itu TIDAK dirender (tanpa heading kosong, tanpa kalimat karangan). Teks kosong yang diizinkan hanya yang sudah ada di repo: "Menu belum diterbitkan." dan "Konten belum diterbitkan.". Halaman terbit tanpa data tetap menampilkan judul bawaan (`labels`) + teks "Konten belum diterbitkan." di dalam satu `Card` bergaris putus-putus (mirip kartu kosong beranda), bukan teks mengambang.
- Pratinjau CMS: `.home-theme` (atau kelas pengganti yang diekspor dari satu file CSS yang juga dipakai admin) tetap menyediakan token agar `HomeContent preview` terlihat sama dengan publik; judul pratinjau tetap `h2` dan wrapper `div` (bukan `main`). Setiap perubahan struktur `HomeContent` harus diperiksa di dua mode (`preview` true/false). Halaman selain beranda di `PagePreview` tidak diubah (di luar scope).
- Aksesibilitas: urutan heading tanpa lompat (kartu produk di beranda `h3` di bawah `h2`; di `/menu` `h2` di bawah `h1`), target sentuh >= 44 px, fokus terlihat, tidak ada gambar dekoratif tanpa `alt=""`.

### 16.4 Tahap 2 - Beranda `/`

Urutan section (file: `HomeContent.jsx`, `home.css` -> dilebur ke `site.css`, `PublishedContent.jsx`):
1. Hero: kicker `fields.eyebrow`, `h1` `fields.title`, ringkasan `fields.summary`, 2 CTA (`Button` default "Lihat menu" -> `/menu`; `Button` outline -> `/about`), foto 4:3 di kolom kanan (desktop) / di bawah teks (mobile), `figcaption` tetap. Foto hero tetap berkas statis yang ada sekarang (`/images/02a - Takoyaki Shio Negi.jpeg`) sampai ada media CMS yang dipetakan (lihat 16.9 Q-8). Satu-satunya gambar `preload`. Teks `h1` maksimal 3 baris di 390 px.
2. Cerita singkat: `fields.body` lewat kelas prosa, dengan garis merah kiri yang sudah ada; dirender hanya bila ada blok.
3. Menu unggulan (3-6 card; konfigurasi sekarang 4 = `FEATURED_LIMIT`, boleh dinaikkan ke 6 hanya lewat argumen `limit` di FE, bukan mengubah server): kicker "KATALOG", `h2` `fields.menuTitle`, intro `fields.menuIntro`, grid card produk yang SAMA dengan `/menu` (komponen sama, lihat 16.5), tombol "Lihat seluruh menu" -> `/menu`. Kosong: `Card` putus-putus "Menu belum diterbitkan." (sudah ada).
4. Tentang singkat: `Card` dengan kicker, `h2` `fields.aboutTitle`, prosa `fields.aboutBody`, `Button` outline -> `/about`; `mediaContent` (media halaman) ditata sebagai kolom di samping kartu pada >= 1024 px, di bawah kartu pada mobile.
5. CTA/pemesanan: `OrderingNotice` (panel merah) sebagai penutup. Tidak menambah kalimat baru.
Kriteria visual: (a) tidak ada dua section berurutan dengan latar sama tanpa pemisah; (b) hero + CTA terlihat tanpa scroll di 390x844; (c) kartu menu unggulan identik tampilannya dengan `/menu`; (d) di 1280 px grid unggulan 4 kolom atau 3 kolom, tidak ada baris yatim satu card; (e) tidak ada teks yang terpotong atau meluap di 320 px.

### 16.5 Tahap 2 - Card menu (komponen inti, dipakai beranda dan `/menu`)

Perubahan komponen: `CatalogCards` (di `PublishedContent.jsx`) dan `ProductOrderCard.jsx`. Boleh menambah `ProductCard.jsx` server-side (isi card) yang dibungkus `ProductOrderCard` (client, hanya pemicu + dialog). Logika `order-platforms.mjs`, `normalizeOrderLinks`, `ORDER_LINK_REL`, dialog (judul = nama produk, deskripsi "Pilih aplikasi untuk memesan.", urutan platform, fokus kembali ke pemicu, `target="_blank"`) TIDAK diubah.

Grid: `ul`/`div` grid, 1 kolom < 640 px, 2 kolom 640-1023 px, 3 kolom 1024-1279 px, 4 kolom >= 1280 px (di beranda boleh 3 kolom bila 3 atau 6 card). Jarak antar card 16 px mobile, 24 px desktop. Boleh `ul role="list"` dengan `li` agar daftar 39 item terbaca pembaca layar.

Struktur isi satu card (urutan visual atas ke bawah) memakai `Card` shadcn (tanpa `py-6` bawaan; foto menempel ke tepi atas, `overflow-hidden`):
1. Foto: rasio tetap 4:3 (`aspect-[4/3]`, `object-cover`), radius atas mengikuti card, latar `--muted` saat memuat. Tanpa `margin-block` (hapus aturan `.product-card-image` lama). `alt` dari `media.alt`. Hanya card pertama di `/menu` `priority`; sisanya `loading="lazy"`; `sizes` diperbarui ke breakpoint di atas (mis. `(max-width:639px) 100vw, (max-width:1023px) 50vw, (max-width:1279px) 33vw, 25vw`). Bila produk tidak punya foto atau gambar gagal: tampilkan kotak 4:3 berlatar `--muted` dengan ikon netral (mis. lucide) tanpa teks karangan, tinggi card tetap seragam (tidak runtuh).
2. Nama produk: `h2`/`h3` (prop `headingLevel`), satu tautan ke `/menu/<slug>`, tebal, maksimal 2 baris (`line-clamp-2`), tautan meliputi area klik nama saja (bukan seluruh card, agar tidak berbenturan dengan klik-card-membuka-popup).
3. Deskripsi: `product.description` bila ada, `line-clamp-2`, warna `--muted-foreground`, ukuran skala "kecil". Tidak ada deskripsi: baris tidak dirender (jangan mengarang).
4. Footer card (sejajar di dasar semua card, `mt-auto`, `flex` justify-between, card bertinggi sama dalam satu baris grid): harga di kiri (`formatPrice`, tebal, ukuran lebih besar dari deskripsi, warna tinta, bukan `Badge`), tombol "Pesan" di kanan (`Button` shadcn default merah, min tinggi 44 px; ikon opsional lucide `ShoppingBag` `aria-hidden`; `aria-haspopup="dialog"` dipertahankan). Di lebar card sempit (< 280 px) susun vertikal, tombol penuh lebar.
5. Tombol "Pesan" hanya ada bila `normalizeOrderLinks` menghasilkan >= 1 link (perilaku fail-closed spec popup). Tanpa link: card tampil lengkap (foto, nama, deskripsi, harga) tanpa tombol dan tanpa `cursor-pointer`. Perlu ditegaskan ke user bahwa selama `OFFICIAL_ORDER_HOSTS` belum disetujui, tombol Pesan tidak muncul di produksi (lihat 16.9 Q-9).
6. Klik di mana saja pada card (selain tautan/tombol) tetap membuka popup bila ada link (perilaku yang sudah ada dipertahankan). Hover/fokus-dalam: bayangan naik sedikit, `focus-visible` pada tautan nama dan tombol (outline 3 px token).
7. Dialog: `DialogContent` memakai `Dialog` shadcn; baris platform = tombol lebar penuh `min-h-14` dengan `PlatformIcon` (tetap placeholder bertanda, bukan logo resmi) + nama platform + ikon panah kecil; hover dengan `--accent`. Tidak ada teks baru.
Kriteria visual: (a) semua card dalam satu baris sama tinggi, harga + tombol rata di dasar; (b) nama panjang tidak merusak tinggi (terpotong 2 baris); (c) foto tidak melompat saat dimuat (tanpa CLS); (d) 39 card di 390 px terlihat sebagai satu kolom rapi tanpa overflow horizontal; (e) harga tampak sebagai elemen paling menonjol kedua setelah nama; (f) tombol Pesan terlihat jelas sebagai CTA pada setiap card.

### 16.6 Tahap 2 - `/menu` dan `/menu/[slug]`

`/menu` (terbit lewat `PublishedPage`/komponen baru; fixture lewat `menu/page.jsx`):
1. Header halaman: komponen judul bersama (16.3) dengan breadcrumb, kicker `fields.eyebrow`, `h1` `fields.title` (fallback "Menu"), ringkasan `fields.summary`. Rich text `fields.body` dan media halaman (bila ada) ditampilkan SESUDAH header, sebelum grid, dalam kolom baca sempit; tidak dirender bila kosong.
2. Grid card (16.5) dengan semua produk `listedProducts` (newest first, tanpa filter/kategori/pencarian). Bagian grid diberi `aria-label`/`h2` tersembunyi "Daftar menu" agar urutan heading `h1 -> h2 (sr-only) -> h3 (nama)` ATAU nama sebagai `h2` langsung di bawah `h1` (pilih satu; tidak boleh loncat). Disarankan nama = `h2`.
3. Kondisi kosong: `Card` putus-putus dengan teks "Menu belum diterbitkan." dan tautan "Kembali ke beranda"; tanpa card contoh palsu.
4. `OrderingNotice` di akhir seperti sekarang.
5. Mode fixture: `MenuCard` dihapus/diganti dengan card yang sama (16.5) berfoto kotak placeholder 4:3 berlabel "Contoh"; teks `content.sample/photo/itemLabel` yang sudah ada dipakai ulang; tanpa harga/tombol Pesan karena data fixture memang tidak punya (jangan membuat harga contoh).

`/menu/[slug]` (`PublishedProduct`; fixture `menu/[slug]/page.jsx`):
1. Komponen judul bersama dengan breadcrumb Beranda > Menu > nama produk.
2. Dua kolom >= 1024 px (foto kiri, info kanan), satu kolom di mobile (foto dulu): foto utama besar rasio 4:3 dalam bingkai radius token (media produk pertama bila gambar; sisa media tampil sebagai thumbnail/baris gambar di bawahnya atau galeri sederhana, tanpa lightbox baru; video/YouTube tetap lewat `PublishedMedia` dengan consent).
3. Kolom info: `h1` nama, harga besar (`formatPrice`, satu harga, tanpa varian/modifier), deskripsi lengkap (tanpa clamp) dengan lebar baca <= 65ch, `Separator`, tautan "Kembali ke menu" (`Button` outline dengan ikon panah kiri).
4. TANPA tombol Pesan di halaman ini (keputusan user). Tidak ada `ProductOrderCard` di detail.
5. Bagian "Menu lainnya" boleh ditambahkan HANYA bila memakai produk nyata dari katalog (3-4 card yang sama, tanpa yang sedang dilihat); bila katalog hanya 1 produk, bagian tidak dirender. Opsional; jika menambah beban, dilewati dan dicatat.
6. Produk tanpa foto: kotak placeholder 4:3 netral sama seperti card; tanpa deskripsi: baris tidak dirender.
Kriteria visual: (a) di 1280 px foto dan info sejajar atas, harga terlihat tanpa scroll; (b) di 390 px urutan foto -> nama -> harga -> deskripsi -> kembali; (c) tidak ada tombol "Pesan" di mana pun di halaman ini; (d) harga tampil persis sekali.

### 16.7 Tahap 3 - about, promos, location, guides

Semua memakai komponen judul bersama (16.3) + kelas prosa + `OrderingNotice` penutup; field kosong tidak dirender.

- `/about`: header (eyebrow/title/summary); `Card` besar "ceritanya" dengan `fields.body`; kemudian dua `Card` berdampingan >= 768 px (satu kolom di mobile): kiri `fields.storyHeading` (`h2`) + `fields.storyBody`, kanan `fields.serviceHeading` (`h2`) + `fields.serviceBody` + tautan "Lokasi dan layanan" -> `/location` (tautan yang sudah ada di fixture); media halaman di bawah/di samping. Tautan ke `/menu` sebagai `Button` di akhir. Mode fixture: pertahankan teks `copy.about.*`; motif `.about-mark` (大阪 / TINY OSAKA) boleh dipertahankan sebagai ornamen `aria-hidden` bila kontras dan konsisten, bila tidak dibuang.
- `/promos`: header; satu `Card` berisi `fields.body` (prosa) + media. Tidak ada kartu diskon, kode, tanggal, countdown. Kosong: `Card` putus-putus "Konten belum diterbitkan.". Boleh `Badge` "Promo" hanya sebagai label tipografis statis pada header (bukan klaim).
- `/location`: header; `Card` berisi daftar definisi `dl` (Kota, Layanan, Jam, Cakupan) hanya baris yang terisi, tiap baris dua kolom `dt`/`dd` dengan `Separator` antar baris; `fields.body` prosa di atas daftar. Tanpa peta, tanpa alamat karangan, tanpa tombol rute. Fixture: nilai "Menunggu verifikasi" yang sudah ada dipertahankan.
- `/guides`: header; grid 1/2/3 kolom card artikel. Tiap card: cover (media pertama halaman panduan bila gambar, rasio 16:9 atau 4:3 tetap; tanpa media -> kotak netral), judul (`h2`, tautan ke `publicPagePath`), ringkasan `fields.summary` (`line-clamp-3`), teks tautan "Baca" dengan ikon panah. Untuk cover, `PublishedContent` harus mengambil `page.media` panduan (data sudah ada di `publicPage`); bila perlu query baru -> STOP ajukan spec (tidak diperkirakan). Mode fixture: 3 card dari `sampleGuides` dengan kotak placeholder bertanda contoh.
- `/guides/[slug]`: header (breadcrumb Beranda > Panduan > judul, eyebrow, h1, ringkasan); media panduan di bawah header (lebar penuh kolom, rasio asli, maks 16:9 untuk gambar sampul); `fields.body` dalam prosa lebar baca <= 65ch ditengah; `Separator`; dua tautan bawah sebagai `Button` ("Semua panduan" outline, "Lihat menu" default). Fixture: section bernomor yang ada boleh dipertahankan sebagai prosa tipografis (nomor `aria-hidden`).
- `not-found`/`error` (sudah tahap 1) hanya diperiksa agar kelas/token baru konsisten.
Kriteria visual: (a) semua halaman ini memiliki judul bergaya sama persis (jarak, ukuran, breadcrumb); (b) prosa nyaman dibaca (tidak lebih lebar dari ~70 karakter); (c) tidak ada halaman yang tampak sebagai teks polos tanpa kartu/pemisah; (d) tidak ada heading kosong ketika field kosong; (e) kartu panduan seragam tinggi.

### 16.8 Tugas per peran (tahap 2-3)

backend: tidak ada pekerjaan. Verifikasi saja bahwa `publicPage(key).media` dan `publicCatalog().media` sudah cukup untuk cover panduan dan galeri produk (baca `src/server/public/data.mjs`, `view-models.mjs`); jika tidak, STOP dan ajukan spec terpisah. Tanpa migrasi, tanpa ubah `OFFICIAL_ORDER_HOSTS`.

frontend (urutan kerja):
- Tahap 2: `src/features/public-site/components/{HomeContent,PublishedContent,ProductOrderCard,ProductCardImage,PageIntro,PublicRichText,PublishedMedia,OrderingNotice,MenuCard}.jsx` (tambah `ProductCard.jsx` bila perlu), `src/app/(site)/menu/page.jsx`, `src/app/(site)/menu/[slug]/page.jsx`, `src/styles/site.css` (card, grid, prosa, judul halaman, hero/story/about dilebur dari `home.css`), `src/styles/home.css` (sisakan hanya token preview CMS bila masih perlu, lihat 16.3), `src/styles/globals.css` (jangan hapus kelas yang masih dipakai admin/auth; penghapusan di tahap QA). Komponen shadcn: `Card`, `Badge`, `Button`, `Separator`, `Breadcrumb`, `Dialog` (semua sudah ada; tanpa generator CLI dan tanpa dependency baru; bila `AspectRatio` dibutuhkan pakai `aspect-[4/3]` Tailwind). Berhenti dan tunjukkan hasil (tangkapan layar 390/1280 untuk `/`, `/menu`, `/menu/<slug>`) untuk persetujuan visual user sebelum tahap 3.
- Tahap 3: `src/app/(site)/{about,promos,location,guides,guides/[slug]}/page.jsx`, `PublishedPage` (pecah menjadi template per halaman yang kecil bila perlu), `PageIntro`, `src/features/public-site/{content.js,page-content.js}` hanya untuk merapikan struktur/label tanpa menambah klaim. Berhenti dan tunjukkan tangkapan layar.
- Larangan: dependency baru, perubahan copy bisnis, foto/alamat/harga/promo karangan, logo platform asli, perubahan di `src/app/admin`, `src/features/cms` (kecuali tidak ada yang perlu), `src/server`, `drizzle/`, `package.json`.
- Pertahankan hook uji yang ada bila bisa (`main#main-content`, `nav[aria-label=...]`, teks "Pesan", "Menu belum diterbitkan."); daftar selector yang berubah dicatat di laporan frontend untuk qa.

qa: TIDAK ada pengujian di tahap 2 dan 3 (ditunda, keputusan user). Satu putaran qa penuh di akhir mencakup: perbarui selector (`tests/e2e/*`, `tests/published-e2e/public.spec.mjs`, `tests/cms-pages-e2e/pages.spec.mjs`, `tests/unit/catalog-cards-ui.test.mjs`), lint, build, unit, integration (`tests/integration/public-order-links.test.mjs` tanpa perubahan), Playwright 3 mode (fixture, terbit-kosong, terbit-berisi), `tests/menu-order-e2e/`, axe, kontras, matriks 320/390/768/1280, Lighthouse vs baseline, cek grep V-1/V-2 dan penghapusan CSS legacy. Maks 2 putaran perbaikan.

### 16.9 Acceptance criteria tahap 2-3 (dinilai di QA akhir; sebagian visual dinilai user dari tangkapan layar)

- AC-17: `/menu` terbit menampilkan seluruh produk sebagai grid card: 1 kolom di 390 px, 2 di 768 px, 3 atau 4 di 1280 px; tiap card berisi foto 4:3 (atau placeholder netral), nama tertaut ke `/menu/<slug>`, deskripsi maks 2 baris (bila ada), harga `Rp` via `formatPrice`, dan tombol "Pesan" bila ada link valid. Tidak ada scroll horizontal di 320 px.
- AC-18: Dalam satu baris grid semua card sama tinggi; harga dan tombol berada di dasar card; foto tanpa CLS (rasio terpesan sebelum gambar dimuat).
- AC-19: Klik tombol "Pesan" atau area card (bukan tautan) membuka dialog order yang sama dengan sebelumnya; AC perilaku di `menu-card-order-popup.md` (AC-1..AC-8, AC-15, AC-17) tetap lulus; card tanpa link tidak punya tombol/pemicu.
- AC-20: `/menu/[slug]` menampilkan breadcrumb, `h1` nama, satu harga, deskripsi, foto dari CMS (bila ada), tautan "Kembali ke menu", dan TIDAK ada tombol/dialog Pesan.
- AC-21: Beranda: hero (h1 + 2 CTA + foto 4:3) -> cerita -> menu unggulan (3-6 card yang sama dengan `/menu`) -> tentang singkat -> blok pemesanan; section yang kontennya kosong tidak dirender; kondisi menu kosong menampilkan "Menu belum diterbitkan." di Card putus-putus.
- AC-22: `/about`, `/promos`, `/location`, `/guides`, `/guides/[slug]` (fixture dan terbit) memakai komponen judul bersama (breadcrumb, kicker, h1, ringkasan), prosa berkelas bersama (lebar <= 70ch), kartu shadcn, dan `OrderingNotice`; `/guides` menampilkan card artikel (judul, ringkasan, cover bila ada); `/location` hanya menampilkan baris `dl` yang terisi.
- AC-23: Tanpa konten CMS (terbit-kosong) setiap halaman menampilkan judul bawaan + teks yang sudah ada di repo; tidak ada kalimat, harga, alamat, jam, foto, atau klaim baru yang dikarang; grep pada teks baru di diff = 0 klaim bisnis.
- AC-24: Pratinjau Beranda CMS (`PagePreview` -> `HomeContent preview`) tetap menampilkan tema yang sama (token tersedia di luar `.site-root`), tetap `div` + `h2`, dan `test:cms-pages-e2e` lulus.
- AC-25: Grep pada `src/features/public-site` dan `src/app/(site)`: 0 pemakaian `.prose-panel`, `.menu-card`, `.menu-grid`, `.button-red`, `.page-section`, `.published-content` pada file yang disentuh tahap 2-3; 0 hex baru di komponen (token saja).
- AC-26 (visual, dinilai user): pada tangkapan layar 390 dan 1280 px untuk `/`, `/menu`, `/menu/<slug>`, `/about`, `/promos`, `/location`, `/guides`, `/guides/<slug>` tidak ada halaman yang tampak sebagai teks polos tanpa struktur kartu/section, jarak vertikal konsisten, dan katalog jelas berupa card makanan.
- AC-27: Kontras AA, fokus terlihat, target sentuh >= 44 px, `prefers-reduced-motion` dihormati (diverifikasi axe + manual di QA akhir).
- AC-28: `npm run lint` dan `npm run build` dijalankan frontend di akhir tiap tahap dan hasil aktualnya dilaporkan; suite tes lain "tidak dijalankan" sampai QA akhir.

### 16.10 Dampak keamanan/RBAC, SEO, merchant sync (tahap 2-3)

- Keamanan/RBAC: tidak ada perubahan. FE tidak menyusun URL order; `rel="noopener noreferrer nofollow"` dan `target="_blank"` dipertahankan; rich text tanpa HTML mentah; `PublishedMedia` consent YouTube tidak diubah.
- SEO: `lang="id"`, satu `h1` per halaman, tanpa loncat heading, `generateMetadata`/`publishedMetadata` tidak diubah, `noindex` tetap, tanpa JSON-LD/`Restaurant`/`LocalBusiness`, konten teks card tetap server-render (nama, deskripsi, harga ada di HTML tanpa JS; hanya pemicu/dialog yang client).
- Merchant sync: tidak ada.

### 16.11 Asumsi dan pertanyaan terbuka (tahap 2-3)

Asumsi:
- A-6: Foto dari CMS = `catalog.media`/`page.media` yang sudah dikirim server; hak pakai foto Grab tetap risiko R-10 yang ditanggung user.
- A-7: Mode fixture tetap ada dan harus seragam secara visual, tetapi placeholder tetap berlabel contoh.
- A-8: Perubahan CSS legacy dihapus hanya di QA akhir setelah grep.

Pertanyaan terbuka (tidak menghalangi mulai; default dipakai bila tidak dijawab):
- Q-8: Foto hero beranda: tetap berkas statis Takoyaki Shio Negi (default) atau diambil dari media CMS halaman beranda (butuh keputusan mapping: media pertama `page.media` jadi hero)? Default: tetap statis.
- Q-9: Selama `OFFICIAL_ORDER_HOSTS` belum disetujui, `publicOrderLinks` fail-closed sehingga TIDAK ada tombol "Pesan" di card produksi. Apakah user menyetujui itu (default; tombol hanya muncul di lingkungan uji/setelah host disetujui), atau ingin tombol nonaktif bertulisan "Segera hadir" (menambah copy baru dan menyimpang dari spec popup, butuh persetujuan eksplisit)?
- Q-10: Jumlah card menu unggulan di beranda: 4 (default, sudah dipakai) atau 6?
- Q-11: Bagian "Menu lainnya" di detail produk: dibuat (default tidak, dilewati) atau tidak?

### 16.12 Ringkasan singkat

Tahap 2 mengubah beranda, `/menu` menjadi grid card makanan (foto 4:3, nama, deskripsi 2 baris, harga, tombol Pesan yang membuka popup yang sudah ada), dan `/menu/[slug]` tanpa tombol Pesan. Tahap 3 merapikan isi about, promos, location, guides, dan artikel dengan judul bersama, prosa, kartu shadcn, dan kondisi kosong yang jujur. Gaya arah A, token tahap 1, tanpa dependency baru, tanpa konten karangan, pratinjau CMS tetap bertema. Tes ditunda ke satu putaran qa di akhir; frontend hanya menjalankan lint dan build per tahap dan berhenti untuk persetujuan visual user di tiap tahap.
