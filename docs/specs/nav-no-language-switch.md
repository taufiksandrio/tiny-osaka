# Spec: Situs satu bahasa tanpa pemilih bahasa dan tanpa segmen bahasa di URL

Status: SELESAI (2026-10-18), digantikan oleh ADR-038 dan `docs/specs/remove-all-locale-code.md`. Diterapkan di commit a6dd3c2 (PR #22): situs satu bahasa Indonesia, tanpa pemilih bahasa, URL tanpa prefix; `/id` dan `/en` sama-sama 404 tanpa alihan. Status ditutup atas persetujuan user. Pertanyaan terbuka di bagian 12 (redirect `/id`) tidak berlaku lagi karena alihan tidak dipakai. Teks di bawah adalah rev.2 asli, dipertahankan sebagai riwayat.
Permintaan user (verbatim): "pm untuk navigasinya juga dibuat tidak ada lang id/eng"; keputusan: "tombol pilihan dihapus dan satu bahasa jadi default, alamat eng dihapus selamanya gausah ada lagi"; "gausah ada langg, hanya url/menu".

## 1. Masalah dan tujuan
- Navigasi dan URL publik masih membawa konsep bahasa (`/id/...`, kode `locale`, kamus `en`). Produk hanya berbahasa Indonesia (ADR-034). Tujuan: tidak ada pemilih bahasa, tidak ada segmen bahasa di URL publik (`/`, `/menu`, `/about`, ...), `/en/*` hilang permanen (404), dan kode/konten publik tidak lagi membawa cabang bahasa Inggris.

## 2. Keputusan user (final)
1. Tombol pilihan bahasa dihapus; satu bahasa (Indonesia) adalah default dan satu-satunya.
2. Alamat `/en` dihapus selamanya: `/en` dan `/en/*` menghasilkan 404, tanpa redirect, tanpa konten/terjemahan Inggris di situs publik, tanpa hreflang/alternates `en`.
3. URL publik TANPA segmen bahasa sama sekali: beranda `/`, menu `/menu`, detail `/menu/<slug>`, dan seterusnya. Semua rute publik dipindah dari `src/app/[locale]` ke akar.
4. (Rekomendasi pm, belum diputuskan user) `/id` dan `/id/*` diarahkan permanen ke padanan tanpa prefix; lihat Q-1.

## 3. Temuan kondisi saat ini (read-only)
- Pemilih bahasa SUDAH tidak ada: `src/features/public-site/components/SiteHeader.jsx` hanya memuat tautan Menu, Tentang, Promo, Pesan; `tests/e2e/navigation.spec.js` baris 47 sudah menegaskan navigasi "Pilih bahasa" berjumlah 0. Sisa mati: `languageLabel: "Pilih bahasa"` di `src/features/public-site/content.js` baris 7 dan kamus label bahasa di `tests/e2e/navigation.spec.js` baris 5-6.
- Rute: `src/app/[locale]/{layout,error,page}.jsx`, `about`, `guides`, `guides/[slug]`, `location`, `menu`, `menu/[slug]`, `promos`. `layout.jsx`: `generateStaticParams` hanya `id`, `notFound()` untuk locale selain `id`, `<html lang={locale}>`, `robots: noindex`. Tidak ada root layout: `src/app/admin/layout.jsx` memuat `<html lang="id">` sendiri. Tidak ada `proxy`/`middleware` locale.
- `next.config.mjs`: redirect permanen `/en/:path*` ke `/id/:path*` dan redirect sementara `/` ke `/id`.
- URL dibangun sebagai `/${locale}/...` di `SiteHeader`, `SiteFooter`, `HomeContent`, `PageIntro`, `MenuCard`, `PublishedContent`, `PublicRichText`, halaman guides/menu/promos/about, dan metadata. Tautan admin ke `/id`: `AdminHeader.jsx` baris 31, `AdminNav.jsx` baris 25, `AdminShell.jsx` baris 23.
- Kamus/fallback Inggris di kode: `PublishedContent.jsx` (kamus `labels.en`, kamus `en` di bagian lokasi, dan fungsi `publicCatalog` baris 22-29 yang menampilkan katalog Indonesia pada halaman Inggris dengan `fallbackLang`), `HomeContent.jsx` baris 10 (`en`), `src/features/public-site/fixtures/menu.js` (`details.en`).
- Akses data publik: `src/server/public/data.mjs` memanggil fungsi SQL `public_read_catalog($1::text)` dan `public_read_page($1::text,$2::text)` dengan locale; `isPageLocale` (`src/server/pages/templates.mjs` baris 23) hanya menerima `id`.
- Tautan teks kaya: `isInternalPageLink` (templates.mjs baris 26) menerima `/id<path>` dan `/en<path>`; `PublicRichText.jsx` baris 7 mengubah `/en` menjadi `/id`. Snapshot konten di DB (immutable, ber-hash) dapat memuat tautan berawalan `/id` atau `/en` dan tidak boleh diubah.
- SEO: semua halaman publik `robots: { index: false, follow: false }`; tidak ada `hreflang`, `canonical`, `sitemap`, atau `robots.txt` di `src`. Jadi URL `/id/*` kemungkinan besar belum terindeks (noindex), tetapi dapat sudah dibagikan/di-bookmark.
- Test yang menyebut `/id`, `/en`, atau `locales` (hitungan kasar): `tests/e2e/{accessibility,fixtures,public-routes,navigation}.spec.js`, `tests/published-e2e/public.spec.mjs`, `tests/cms-{media,catalog,pages}-e2e/*.spec.mjs`, `tests/unit/page-content.test.mjs`, `tests/integration/{media,pages}.test.mjs`, `playwright.config.mjs` (`url: http://127.0.0.1:3030/id`), `scripts/run-published-qa.mjs`.
- CMS admin: sudah Indonesia saja (ADR-034). Editor terjemahan Inggris tidak ada; `PageEditor.jsx`/`PagePreview.jsx` hanya memiliki properti locale untuk pratinjau.
- Data: tabel terjemahan dan baris `en` lama (check constraint `locale IN ('id','en')`) tetap ada untuk integritas snapshot (ADR-034).

## 4. Scope
1. Hapus sisa pemilih bahasa dan teks "Pilih bahasa" (kode dan test).
2. Pindahkan rute publik dari `src/app/[locale]` ke route group tanpa segmen URL, mis. `src/app/(site)/` dengan `layout.jsx` yang memuat `<html lang="id">` (admin tetap punya layout sendiri). URL publik tanpa prefix.
3. `/en` dan `/en/*` = 404 (redirect `/en` dihapus dari `next.config.mjs`).
4. Redirect `/` ke `/id` dihapus (beranda dilayani langsung di `/`). Perlakuan `/id/*` mengikuti Q-1 (rekomendasi: 308 permanen ke padanan tanpa prefix).
5. Hapus parameter/kamus bahasa di kode publik dan UI: `locale` pada komponen, `content[locale]`, kamus `en`, fungsi fallback Inggris, `details.en`; semua teks Indonesia tetap.
6. Perbarui tautan internal, tautan admin "Lihat website" / "Website publik", dan `revalidatePath` di route API katalog/halaman (`/id` dan `/en` menjadi jalur tanpa prefix).
7. Normalisasi tautan teks kaya: tautan baru disimpan tanpa prefix; tautan lama berawalan `/id` atau `/en` pada snapshot tetap valid dan dirender sebagai padanan tanpa prefix.
8. Perbarui test, `playwright.config.mjs`, dan skrip QA yang memakai `/id`.

## 5. Konflik dengan keputusan/invariant yang ada
- AGENTS.md: "SEO ID/EN with verified public content" dan baris Mission "bilingual" bertentangan. Disetujui user secara sadar (pelonggaran); AGENTS.md hanya boleh diubah user.
- REQUIREMENTS.md: bagian Business sudah "Indonesian-only content and metadata", tetapi bagian SEO/Authority masih memuat bahasa Inggris/hreflang dalam ADR lama.
- DECISIONS.md: ADR-002 (jalur locale `/id`, `/en`), ADR-022 (konten bilingual), ADR-034 klausa "existing /id URLs remain, former /en URLs redirect permanently" digantikan ADR-038; ADR bilingual lain yang disebut konten ID/EN dianggap historis.
- ROADMAP Phase 3 menyebut "proper canonical/hreflang": hreflang dihapus, canonical tanpa prefix tetap.
- Tidak melanggar: noindex pra-peluncuran tetap (keputusan peluncuran terpisah), tanpa `Restaurant`/`LocalBusiness`, GA4 hanya niat order, tidak ada penghapusan data.

## 6. Acceptance criteria
- AC-1: Tidak ada elemen/landmark pemilih bahasa di halaman publik manapun (tidak ada navigasi bernama "Pilih bahasa", tidak ada tautan `/en`); string "Pilih bahasa" tidak ada lagi di `src` dan test.
- AC-2: Rute publik dilayani tanpa prefix: `/`, `/menu`, `/menu/<slug>`, `/about`, `/guides`, `/guides/<slug>`, `/promos`, `/location` menghasilkan 200 (konten terbit) atau 404 yang sesuai (slug tak dikenal), dan tidak ada redirect `/` ke `/id`.
- AC-3: `/en`, `/en/menu`, `/en/menu/<slug>` dan semua `/en/*` menghasilkan 404 tanpa header `Location`; `/fr` dan locale lain tetap 404.
- AC-4 (bergantung Q-1): `/id` dan `/id/*` mengembalikan redirect permanen (308) ke padanan tanpa prefix dengan query dipertahankan, tanpa rantai redirect dan tanpa loop; bila Q-1 dijawab 404, keduanya 404.
- AC-5: Setiap halaman publik memiliki `<html lang="id">`; tidak ada atribut `hreflang`/`alternate` dan tidak ada `languages` pada metadata.
- AC-6: Semua tautan internal publik (header, footer, beranda, kartu, breadcrumb, tombol, tautan teks kaya) tidak memuat `/id` atau `/en`; skip link dan anchor `#ordering` tetap bekerja (`/#ordering`).
- AC-7: Tautan teks kaya lama berawalan `/id<path>` atau `/en<path>` yang ada di snapshot dirender sebagai `<path>` (beranda menjadi `/`); validasi tulis menerima tautan tanpa prefix dan tetap menerima tautan lama agar klon snapshot tidak gagal; hash snapshot lama tidak berubah.
- AC-8: Tautan admin "Lihat website" dan "Website publik" menuju `/`.
- AC-9: Metadata: title/description tetap; `robots` noindex tidak berubah oleh spec ini; bila canonical ditambahkan (Q-3) harus berupa URL tanpa prefix tanpa duplikasi; tidak ada `sitemap`/`robots.txt` baru (belum ada, Phase 3).
- AC-10: Tidak ada kode publik yang membaca kamus Inggris atau cabang `locale === "en"`; fallback katalog Inggris dihapus; `lang` pada teks produk tidak lagi bergantung `fallbackLang`.
- AC-11: Revalidasi: simpan/hapus produk dan simpan halaman memperbarui halaman publik tanpa prefix (diuji: perubahan tampil tanpa restart).
- AC-12: `error.jsx` publik dan 404 tetap berbahasa Indonesia dan lolos axe; axe tidak melaporkan pelanggaran di halaman publik pada 3 project; tidak ada overflow horizontal.
- AC-13: Test E2E dan unit tidak lagi memakai `/id` atau `/en` (kecuali test redirect `/id` dan test 404 `/en`); `playwright.config.mjs` `url` memakai `/`; test published-e2e dan CMS e2e memakai URL tanpa prefix.
- AC-14: Tidak ada penghapusan tabel/baris/kolom DB, snapshot, atau aset; migrasi tidak diperlukan (bagian 8); `locale` yang tersisa hanya di lapisan server/DB legacy.
- AC-15: `npm run lint`, `build`, unit, integration, E2E lulus (dilaporkan hanya yang dijalankan); pemeriksaan: tidak ada route yang bertabrakan dengan `/admin`, `/api`, `/media`, `/icon.png`.

## 7. Dampak keamanan/RBAC, SEO
- Keamanan/RBAC: tidak ada perubahan hak; rute admin dan API tidak berubah. Redirect `/id/*` harus pasti hanya untuk rute publik dan tidak mengalihkan `/admin` atau `/api` (pola eksak, bukan wildcard luas). Open-redirect: tujuan redirect statis dari path internal, bukan dari input pengguna.
- SEO: situs saat ini noindex dan belum punya sitemap, sehingga risiko kehilangan peringkat rendah. Risiko tersisa: tautan lama yang dibagikan (diselesaikan redirect 308 bila Q-1 disetujui), canonical belum ada, dan saat situs dibuka untuk indeks nanti struktur final sudah tanpa prefix (menguntungkan karena tidak ada perpindahan URL kedua). `/en` 404 permanen (tidak ada padanan; konten Inggris tidak pernah ada). `<html lang="id">` dan metadata Indonesia dipertahankan.
- Merchant sync: tidak terpengaruh.

## 8. Migrasi/skema
- Tidak diperlukan. Fungsi SQL `public_read_catalog(text)` / `public_read_page(text,text)` tetap dipanggil dengan nilai tetap `"id"` dari satu konstanta di lapisan server (agar tanpa migrasi); membersihkan tanda tangan fungsi/constraint `locale` adalah tahap 2 bersama penghapusan skema, dengan persetujuan terpisah. Penulis server legacy (`src/server/pages/*`, `src/server/catalog/drafts.mjs`) yang menerima `locale` tidak diubah di spec ini karena banyak test integrasi lama bergantung padanya.

## 9. Tugas per peran
frontend
- Pindahkan `src/app/[locale]/*` ke `src/app/(site)/*`; layout baru dengan `<html lang="id">`, `skip-link`, header/footer tanpa prop locale; hapus `generateStaticParams`/cek locale; `error.jsx` ikut pindah.
- Hapus prop `locale` dan kamus `en` di `SiteHeader`, `SiteFooter`, `HomeContent`, `PageIntro`, `MenuCard`, `PublishedContent`, `PublishedMedia`, `PublicRichText`, `fixtures/menu.js`, `page-content.js`, `content.js` (hapus `languageLabel`); semua `href` tanpa `/${locale}`; hapus fallback katalog Inggris dan `fallbackLang`.
- `PublicRichText.jsx`: normalisasi tautan lama (`/id`, `/en` ke tanpa prefix; `/id` murni menjadi `/`).
- Admin: `AdminHeader.jsx`, `AdminNav.jsx`, `AdminShell.jsx` tautan ke `/`; `PageEditor.jsx`/`PagePreview.jsx` buang prop locale pratinjau bila tidak dipakai.
backend
- `next.config.mjs`: hapus redirect `/en/:path*` dan `/`; tambah redirect permanen `/id` dan `/id/:path*` ke tanpa prefix (bila Q-1 disetujui); uji bahwa pola mencakup `/id` dan `/id/` dan tidak menyentuh rute lain.
- `src/server/public/data.mjs`, `view-models.mjs`: hilangkan parameter locale publik, panggil SQL dengan konstanta `"id"`; `src/server/pages/templates.mjs`: `isInternalPageLink` menerima tautan tanpa prefix dan tetap menerima `/id`/`/en` lama (kompatibilitas); `path` halaman `home` menjadi `/`.
- `revalidatePath`: `src/app/api/cms/catalog/route.js`, `products/[slug]/route.js`, `src/app/api/cms/pages/by-key/[pageKey]/route.js` memakai jalur tanpa prefix yang tepat (verifikasi dengan test revalidasi; jangan membuat revalidasi luas yang menyentuh admin).
- Jangan mengubah migrasi atau data; tidak menambah dependency.
qa
- Perbarui `playwright.config.mjs`, `scripts/run-published-qa.mjs`, `tests/e2e/*`, `tests/published-e2e/public.spec.mjs`, `tests/cms-*-e2e/*`, `tests/unit/page-content.test.mjs`, `tests/integration/{media,pages}.test.mjs` ke URL tanpa prefix; hapus loop `locales`; tambah test: `/en*` 404 tanpa `Location`, `/id*` redirect (atau 404 sesuai Q-1) tanpa rantai, `html lang="id"`, tanpa hreflang, tanpa navigasi "Pilih bahasa", tautan teks kaya lama dirender tanpa prefix, revalidasi, axe 3 project.
- Jalankan Playwright penuh dan laporkan hanya yang benar-benar dijalankan.

## 10. Urutan eksekusi terhadap pekerjaan lain (rekomendasi)
1. Perbaikan pasca-QA temuan 2 dan 6a (harness e2e; tidak bersinggungan dengan URL) dan temuan 1, 3, 4 (kecil) agar ada jaring regresi hijau.
2. SPEC INI (refactor URL/locale). Alasan: ini perubahan struktural rute yang menyentuh `PublishedContent.jsx`, `HomeContent.jsx`, test published-e2e, dan semua e2e; dilakukan di atas baseline hijau agar regresi routing terdeteksi.
3. Upload gambar + alt + CWV (`docs/specs/catalog-card-crud.md` bagian 16) SESUDAH ini. Alasan: upload menambah komponen kartu produk publik baru, kontrak katalog, dan test E2E yang sebaiknya ditulis sekali terhadap URL final tanpa prop `locale`; menunda upload menghindari menulis ulang test/komponen yang sama dua kali.
4. Dokumen keputusan dan verifikasi penuh.
Setiap langkah di commit/branch terpisah agar rollback terisolasi.

## 11. Draf ADR-038 (untuk developer; AGENTS.md hanya oleh user)
ADR-038 - Situs satu bahasa tanpa segmen bahasa di URL (2026-10-17)
- Konteks: ADR-034 menjadikan situs hanya berbahasa Indonesia tetapi mempertahankan `/id` dan redirect `/en`; user meminta navigasi tanpa pilihan bahasa dan URL tanpa segmen bahasa.
- Keputusan (user): tidak ada pemilih bahasa; URL publik tanpa segmen bahasa (`/`, `/menu`); `/en` dihapus permanen (404, tanpa redirect, tanpa hreflang); bahasa Indonesia adalah satu-satunya bahasa dan `<html lang="id">`. Perlakuan `/id/*`: [isi sesuai jawaban Q-1; rekomendasi redirect permanen 308].
- Menggantikan/mengamandemen: klausa URL pada ADR-034; ADR-002 (jalur locale); persyaratan "SEO ID/EN" dan hreflang di AGENTS.md, REQUIREMENTS.md, ROADMAP Phase 3 (menjadi SEO Indonesia saja, canonical tanpa prefix).
- Tidak berubah: konten Inggris lama di DB dipertahankan (integritas snapshot; tidak ada penghapusan data), noindex pra-peluncuran, `Restaurant`/`LocalBusiness` tetap di luar scope, tanpa dependency baru, tanpa migrasi.
- Risiko diterima: tautan lama `/en/*` mati; tautan lama `/id/*` bergantung keputusan redirect; kesalahan pola redirect dapat memengaruhi rute lain bila tidak diuji.
- Rollback: kembalikan app/config/test/docs bersama; tidak ada perubahan data.
- Verifikasi: dicatat di SECURITY_AND_QA.md setelah test dijalankan.

Dokumen yang perlu diperbarui: `AGENTS.md` (user; hapus "bilingual"/"SEO ID/EN"), `docs/REQUIREMENTS.md` (SEO dan Authority; tidak ada hreflang), `docs/DECISIONS.md` (ADR-038; tandai ADR-002 dan klausa URL ADR-034), `docs/DATA_CONTRACTS.md` (via Grep: kontrak baca publik dengan locale tetap `id`, format tautan internal, jalur halaman), `docs/ROADMAP.md` (Phase 3 canonical/hreflang), `docs/SECURITY_AND_QA.md`, README (via Grep, rute), `.agents/skills/*` yang menyebut bilingual/locale, serta catatan operasi bila ada rute/redirect.

## 12. Pertanyaan terbuka
- Q-1: Perlakuan `/id` dan `/id/*`. Rekomendasi: redirect permanen (308, setara 301 untuk mesin pencari) ke padanan tanpa prefix, karena tautan mungkin sudah dibagikan/di-bookmark dan biayanya kecil; risiko SEO rendah karena situs masih noindex. Alternatif: 404 (lebih bersih, tetapi tautan lama mati; dipilih bila `/id` tidak pernah dipakai di luar tim). Perlu keputusan user.
- Q-2: Berapa lama redirect `/id/*` dipertahankan? Rekomendasi: tanpa batas waktu (nol biaya), ditinjau saat peluncuran.
- Q-3: Tambah `canonical` tanpa prefix sekarang, atau menunggu fase SEO Phase 3 (situs masih noindex)? Rekomendasi: tunggu Phase 3 agar tidak menambah fitur di luar scope; hanya pastikan tidak ada hreflang.
- Q-4: Tautan teks kaya lama pada snapshot: render-time normalisasi (rekomendasi, tanpa mengubah hash) atau biarkan memicu redirect `/id` (dua hop)? Rekomendasi normalisasi.
- Q-5: Penulis server legacy yang menerima `locale` dan check `locale IN ('id','en')` dibersihkan di tahap 2 bersama skema (rekomendasi) atau sekarang? Sekarang berarti migrasi dan perubahan banyak test lama.
- Q-6: Konfirmasi: konten/terjemahan Inggris yang masih ada di database tidak dihapus (hanya tidak ditampilkan), sesuai AC-14.
