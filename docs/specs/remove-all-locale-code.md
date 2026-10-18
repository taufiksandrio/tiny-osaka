# Spec: Hapus semua kode dan sebutan bahasa/locale (en/id)

Status: SELESAI (2026-10-18), digantikan oleh `docs/specs/drop-locale-column.md` dan ADR-039. Tahap A (kode) diterapkan di commit a6dd3c2 (PR #22). Tahap B ditempuh sebagai B2 lewat migrasi 0016 (PR #23, b49a5db), bukan B1 yang direkomendasikan di bawah. Grep `src` menyisakan hanya `localeCompare` untuk sorting. Status ditutup atas persetujuan user. Teks di bawah adalah draf asli, dipertahankan sebagai riwayat.
Tanggal: 2026-10-18. Penulis: PM. Branch dokumen: chore/agents-md-adr-037-038.
Permintaan user: "hapus semua yg berhubungan dengan lang /eng dan /id". Konteks: situs hanya Indonesia, URL tanpa prefix (ADR-038); alihan `/id/*` juga sudah dihapus (`/id/*` dan `/en/*` sama-sama 404; `next.config.mjs` tanpa `redirects`).

## 1. Masalah dan tujuan

Sisa konsep bahasa masih tersebar di kode, skema, test, dan dokumen padahal situs satu bahasa: parameter `locale`, konstanta `PUBLIC_LOCALE`, daftar `["id","en"]`, kolom `altEn`/`captionEn`, toleransi tautan lama `/id` `/en`, serta teks "bilingual/ID-EN" di dokumen dan sub-agen. Tujuan: kode aplikasi, test, konfigurasi, dan dokumen tidak lagi memodelkan bahasa; satu-satunya jejak yang sah adalah lapisan data yang terkunci skema DB dan snapshot immutable.

Batas keras yang ditemukan: hash snapshot immutable (katalog dan halaman) menyertakan baris terjemahan beserta kolom `locale`, dan hash media menyertakan `altEn`/`captionEn`. Menghapus/mengubah kolom atau baris `en` mengubah hash dan merusak verifikasi snapshot, approval, dan receipt lama. Karena itu pekerjaan dibagi dua tahap (lihat 4).

## 2. Keputusan terkait

- ADR-034 (Indonesia saja): "Legacy English rows, immutable hashes/receipts, published pointers and old field values are retained. No content ... is deleted ... Existing hash algorithms stay unchanged." Tahap A sejalan. Tahap B2 BERTENTANGAN dengan ADR-034 dan butuh ADR baru yang menggantikannya sebelum dikerjakan (STOP sampai user setuju).
- ADR-038: URL tanpa prefix bahasa, tanpa hreflang. Teks ADR-034/038 di DECISIONS.md yang masih menyebut "`/id` 308" sudah basi (alihan dihapus); koreksi lewat ADR/penanda baru (Tahap A, dokumen).
- ADR-037: varian/modifier/kategori/terjemahan katalog tidak dipakai; kode dan tabel dijanjikan dihapus pada "tahap 2" ADR-037. Itu pekerjaan terpisah. Spec ini tidak menghapus fitur variant/modifier; hanya membuang konsep locale di dalamnya. Bila fungsi varian/modifier ternyata tanpa pemanggil, penghapusannya lebih baik digabung ke tahap 2 ADR-037 (lihat pertanyaan terbuka Q5).
- AGENTS.md: hanya user yang mengedit. Spec ini hanya mengusulkan perubahan teks (bagian 3C).
- Invarian yang tidak berubah: RBAC server-side, Owner-only publish, hash/receipt immutable, tanpa `Restaurant` schema, tanpa sync merchant.

## 3. Inventaris (hasil Grep, baca-saja)

Jumlah = kemunculan baris yang cocok; pola regex longgar sehingga bisa memuat positif palsu (`localeCompare`, `lang="ja"`).

### 3A. Kode aplikasi (`src/`, `scripts/`)

`locale|Locale|LOCALE` di `src/`: 105 kemunculan di 18 file. Dikelompokkan:

| Kelompok | Lokasi | Catatan |
|---|---|---|
| A1 Positif palsu (BIARKAN) | `localeCompare` di `server/catalog/review-readiness.mjs:17`, `server/catalog/products.mjs:52,63`, `server/cms/media.mjs:69`, `server/media/validation.mjs:91`, `server/public/view-models.mjs:13`; `lang="ja"` di `app/(site)/page.jsx`, `app/(site)/about/page.jsx` (teks Jepang, bukan locale situs) | Bukan konsep bahasa situs |
| A2 `lang="id"` pada `<html>` | `app/(site)/layout.jsx:19`, `app/admin/layout.jsx:11`, `app/global-not-found.jsx:8`, `features/cms/pages/PagePreview.jsx:6` | Atribut a11y/SEO yang benar untuk situs Indonesia; BIARKAN (pengecualian sah). Komentar `global-not-found.jsx:4` dan `next.config.mjs:6,20` menyebut `/en` dan boleh dirapikan |
| A3 Konstanta/predikat | `server/public/data.mjs:5,24-36` (`PUBLIC_LOCALE`, `isPageLocale`, argumen `locale` di `readPublicCatalog`/`readPublicPage`); `server/pages/templates.mjs:23` (`isPageLocale`), `:26-29` (toleransi tautan lama `/id` `/en` di `isInternalPageLink`); `server/pages/published.mjs:4,10-28` (`input.locale`, `isPageLocale`) | Hapus argumen/predikat; pembaca JS memanggil SQL dengan konstanta data `'id'` (lihat 3A-wajib) |
| A4 Penulis server menerima `en` | `server/pages/validation.mjs:54-56,79-90` (`validatePageFields(pageKey, locale, ...)`, set `locales`); `server/pages/drafts.mjs:44-66` (`input.locale`, clone SQL menyalin `locale`); `server/cms/batch.mjs:29-30` (`exactInput ... "locale"`, `data.locale !== "id"`); `server/cms/current-pages.mjs:47` (kirim `locale:"id"`); `server/catalog/drafts.mjs:18,75-90,139-152,231-249,324-332`; `server/catalog/products.mjs:50,91,105,147,187,221`; `server/catalog/review-readiness.mjs:14,36-38,75-85` (`INVALID_LOCALE`, `MISSING_TRANSLATION` per locale); `features/public-site/home-draft.mjs:22-23`; `features/cms/pages/PageEditor.jsx:20` | Total 8+ file. Request API: field `locale` dihapus dari bentuk request/response (kontrak berubah, lihat AC-6) |
| A5 Alt/caption Inggris | Tulis/baca: `server/media/validation.mjs:35-36,93-94`, `server/media/policy.mjs:13`, `server/media/references.mjs:49-50`, `server/cms/media.mjs:74`, `server/cms/batch.mjs:33`, `server/pages/drafts.mjs` (2), `server/catalog/products.mjs:147`, `server/catalog/drafts.mjs` (1), `features/cms/media/MediaAttachments.jsx:18,30`, schema `server/db/schema.mjs:428,430,434` | 18 kemunculan di `src/`. Jalur TULIS dan keluaran publik dihapus; jalur HASH tetap membaca (lihat wajib) |
| A6 Teks UI sisa | `app/admin/login/page.jsx:12` ("Dua bahasa, satu workspace ... Indonesia dan Inggris berdampingan") — salah secara produk setelah ADR-034 | Ganti ke teks Indonesia-saja |
| A7 Daftar `["id","en"]` | `server/media/validation.mjs:87`, `server/pages/validation.mjs:56`, `server/catalog/drafts.mjs:18`, `server/catalog/review-readiness.mjs:78,80`, `server/pages/templates.mjs:29`; `features/public-site/components/PublicRichText.jsx:3-4` (regex normalisasi `^/(id|en)`) | Hapus; tautan lama bentuk `/id/...`/`/en/...` pada konten tersimpan: lihat Q3 |
| Scripts | `scripts/lib/catalog-variants-report.mjs:27` (`t.locale = 'id'`, SQL data); 3 hasil `localeCompare` positif palsu di `scripts/lib/*-protection.mjs`; `scripts/lib/auth-protection.mjs` & `cms-protection.mjs` & `verify-dev-db.mjs` mengandung kata `TRIGGER`/`locale` (periksa BE: kemungkinan hanya trigger, bukan locale) | Hanya `catalog-variants-report.mjs` perlu pertimbangan |

Rute/folder: tidak ada `src/app/[locale]` (Grep `\[locale\]` di `src/` kosong) dan tidak ada nama file/folder yang memuat `locale`/`-en`/`-id` (Glob kosong). Sub-agen `.claude/agents/frontend.md` masih menyebut `src/app/[locale]`.

#### Yang MASIH WAJIB di lapisan data (alasan: skema DB + hash immutable)

1. Kolom `locale text NOT NULL` ada di 6 tabel terjemahan (`category_`, `product_`, `variant_`, `modifier_group_`, `modifier_option_`, `page_translations`), masuk PRIMARY KEY (migrasi 0000, 0001, 0004) dan CHECK `IN ('id','en')`. Setiap INSERT harus memberi nilai; nilainya tetap `'id'`. Satu konstanta internal tunggal (mis. satu modul server khusus, nama ditentukan BE) menyimpan `'id'` untuk semua penulis; tidak boleh tersebar di banyak file.
2. Fungsi SQL `public.public_read_catalog(p_locale text)` dan `public.public_read_page(p_key, p_locale)` (0006, memfilter `t.locale=p_locale` dan `p_locale IN ('id','en')`) menerima argumen locale. Tanpa migrasi, JS tetap memanggil dengan konstanta `'id'` di satu tempat; tidak ada parameter `locale` di API JS.
3. Hash katalog `server/catalog/content-hash.mjs:8-16` memasukkan kolom `locale` pada 5 daftar terjemahan; hash halaman `server/pages/content-hash.mjs:19-20` memasukkan `row.locale` dan mengurutkan berdasarkan locale. Daftar field ini tidak boleh berubah. Loader graf harus tetap memuat SEMUA baris terjemahan (termasuk `en` lama) agar hash lama bisa diverifikasi ulang.
4. Hash media (`mediaHashSnapshot` dengan `mediaRefFields` di `server/media/policy.mjs:13`) memasukkan `altEn`/`captionEn`. Daftar field untuk HASH tetap; `altEn`/`captionEn` hanya dibaca untuk hash, tidak ditulis/tampil. Kolom `alt_en`/`caption_en` (NOT NULL DEFAULT '', 0005) ada di `catalog_media_refs` dan `page_media_refs`, sehingga INSERT tanpa nilai otomatis `''`.
5. Validasi graf (`validatePageFields` per baris, review-readiness, `publicRevisionMedia`) saat ini MENOLAK nilai di luar `["id","en"]` dan menuntut `id`. Setelah narrowing ke id saja, baris `en` lama di snapshot/klon TIDAK boleh membuat validasi gagal: perilaku yang benar adalah mengabaikan baris non-`id` (bukan menolak). Ini jebakan utama Tahap A: salah implementasi memblokir publish/clone revisi yang punya baris `en` lama.
6. Klon halaman (`server/pages/drafts.mjs:65-66`, SQL menyalin semua baris terjemahan): disarankan hanya menyalin baris `id` ke draft baru (revisi baru, hash baru, tidak memengaruhi snapshot lama).
7. Trigger/guard (0002 `catalog_*_guard`, 0006, 0008-0014) tidak menyebut locale kecuali yang tercantum di atas; fungsi purge 0014 hanya memakai `locale = 'id'` (baris 63). Tahap A tidak menyentuhnya.

### 3B. Skema/DB (hanya relevan untuk Tahap B)

| Objek | Lokasi | Isi |
|---|---|---|
| 6 kolom `locale` + PK + CHECK | `drizzle/0000` (6 baris), `0001` (9), `0004` (3); `src/server/db/schema.mjs:84-324` | PK memuat `locale`; CHECK `IN ('id','en')` |
| `alt_en`, `caption_en` | `drizzle/0005` (6 baris), `0006` (2); schema `:428-434` (CHECK panjang teks) | 2 tabel media ref |
| Fungsi baca publik | `drizzle/0006_public_read_path.sql` (12 baris `locale`) | `p_locale`, join `t.locale=p_locale` |
| Purge | `drizzle/0014_catalog_card_crud.sql:63` | `t.locale = 'id'` |
| Snapshot Drizzle | `drizzle/meta/0000..0015_snapshot.json` (12-36 baris locale per file, 16 file) | Riwayat; JANGAN diedit |
| Baris `en` lama | tidak diketahui jumlahnya | Perlu hitung baca-saja di DB test/dev sebelum B apapun (Q1) |

### 3C. Dokumen

Pola `bilingual|locale|/id|/en|hreflang|EN|ID/EN`: README.md 58; docs/DECISIONS.md 54; docs/DATA_CONTRACTS.md 56; docs/SECURITY_AND_QA.md 30; docs/PHASE2_PLAN.md 17; docs/PHASE3_PLAN.md 5; docs/ROADMAP.md 4; docs/ARCHITECTURE.md 1; docs/OPERATIONS.md 1; docs/REQUIREMENTS.md 1 (baris 22). Total 227 di 10 file. Banyak adalah catatan historis (ADR lama) — ADR yang disetujui TIDAK ditulis ulang; cukup ditambah penanda "Status update" seperti pola yang sudah dipakai.
- `.claude/agents/pm.md:8` ("website bilingual ID/EN"), `.claude/agents/frontend.md:3` (`src/app/[locale]`), `.agents/skills/public-website/SKILL.md:3,10` ("bilingual", "Localize ID/EN", hreflang), `.agents/skills/quality-security/SKILL.md:11` ("Check bilingual routes").
- AGENTS.md (hanya user): Grep tidak menemukan pola di working tree, tetapi konteks sesi masih memuat "bilingual" dan "SEO ID/EN" pada Mission/Invariants. User/PM verifikasi dan edit sendiri; usulan teks: "Indonesian-language website", "SEO in Indonesian with verified public content". CLAUDE.md: tidak ada kecocokan.
- Spec lama di `docs/specs/`: 115 kemunculan di 6 file (nav-no-language-switch 56, adr-037-038-draft 33, catalog-card-crud-fixes 13, catalog-card-crud 6, public-pages-shadcn-redesign 5, agents-md-proposed-changes 2). Bersejarah: BIARKAN, tambah satu baris catatan "sebagian usang, lihat remove-all-locale-code" hanya bila user minta; spec ini tidak mengubah file lain.

### 3D. Test dan konfigurasi

- `tests/`: `locale` 157 kemunculan di 22 file (terbanyak: `integration/pages.test.mjs` 24, `unit/catalog-drafts.test.mjs` 11, `integration/catalog-translations.test.mjs` 11, `unit/catalog-review-readiness.test.mjs` 10, `unit/page-content.test.mjs` 10, `integration/catalog-modifiers.test.mjs` 10, `integration/media.test.mjs` 10, `integration/catalog-constraints.test.mjs` 12, `integration/public-read.test.mjs` 9, `integration/catalog-variants.test.mjs` 9, `integration/pricing-constraints.test.mjs` 9, `integration/catalog-clone.test.mjs` 7, `fixtures/published-data.mjs` 6). Pola lebih luas (`/id`, `/en`, `"en"`, `en:`) 188 di 26 file.
- `altEn|captionEn|alt_en|caption_en`: tests 17 di 6 file (`unit/media.test.mjs`, `fixtures/media.mjs`, `fixtures/published-data.mjs`, `integration/{media,cms-media,cms-catalog-image}.test.mjs`).
- Test yang SENGAJA mengulang `/id` `/en`: `tests/e2e/navigation.spec.js:45-73` (404 untuk `/id`, `/en`, `/en/*`, `/fr`, trailing slash; tidak ada tautan berprefiks) dan `tests/e2e/public-routes.spec.js`. Ini regresi ADR-038: pertahankan.
- Konfigurasi: `next.config.mjs` hanya komentar (baris 6, 20); `package.json`, config Playwright, `drizzle.config.mjs`: tidak ada kecocokan.

Ringkasan angka: kode `src/` 105 baris locale/18 file + 18 baris altEn/captionEn/13 file; test 157/22 file (+17 media); dokumen 227/10 file + 115/6 spec + 4 file sub-agen/skill; skema 6 tabel + 2 kolom media + 2 fungsi SQL + 16 snapshot Drizzle (riwayat).

## 4. Cakupan bertahap

### Tahap A (disetujui bila user mengiyakan; tanpa migrasi, tanpa mengubah data/hash)

In scope:
1. Hapus semua parameter/prop/field `locale` dari API JS, pembaca publik (`readPublicCatalog`, `readPublicPage`, `publicRevisionMedia`, `getPublishedPage`), penulis draft, request/response API (`/api/...` batch & page save), `PageEditor`, `home-draft`, review-readiness. Hapus `PUBLIC_LOCALE`, `isPageLocale`, daftar `["id","en"]`, `INVALID_LOCALE`.
2. Satu konstanta data internal `'id'` untuk kolom `locale` dan pemanggilan `public_read_*`.
3. Hapus `altEn`/`captionEn` dari input/output API, UI `MediaAttachments`, dan keluaran publik; field tetap hanya di jalur hash (membaca kolom) dan skema. Penulis tidak mengisi kolom itu (default `''`).
4. Baris `en`/nilai legacy diabaikan oleh validasi, bukan ditolak; klon halaman menyalin hanya `id`.
5. Hapus toleransi tautan `/id` `/en` (`isInternalPageLink`, `PublicRichText`) — tunduk pada Q3.
6. Rapikan teks UI login admin, komentar `global-not-found.jsx`/`next.config.mjs`.
7. Test/fixture: buang `locale`/`en` dari fixture normal; pertahankan sejumlah kecil fixture legacy (baris `en`, `altEn` terisi) KHUSUS untuk membuktikan hash lama tidak berubah dan validasi mengabaikan `en`.
8. Dokumen: perbarui README dan docs (tanpa menulis ulang ADR lama; tambah "Status update"/ADR baru bila perlu), `.claude/agents/{pm,frontend}.md`, dua SKILL.md, sebut AGENTS.md sebagai usulan teks untuk user. Perubahan di `.claude/`, `.agents/`, dan docs di luar `docs/specs/` dikerjakan agen implementasi setelah persetujuan, bukan PM.

Out of scope Tahap A: migrasi apapun, menghapus tabel/kolom/baris, mengubah algoritma hash/format, menyentuh fungsi SQL, menghapus fitur variant/modifier/kategori (ADR-037 tahap 2), mengedit spec lama, mengedit AGENTS.md, mengakses merchant live.

### Tahap B (skema; hanya sesuai pilihan user, menunggu persetujuan eksplisit terpisah)

- B1 (REKOMENDASI): biarkan skema; kolom `locale` selalu `'id'`, baris `en` lama tetap. Nol migrasi, nol risiko hash. Opsi B1b (opsional, migrasi 0016 non-destruktif): `ALTER TABLE ... ADD CONSTRAINT ... CHECK (locale='id') NOT VALID` agar baris `en` baru mustahil, plus `CREATE OR REPLACE` fungsi baca publik tanpa argumen locale (butuh DROP+CREATE karena signature berubah; perlu cek `verify-dev-db`/protection scripts). Baris lama tidak dimodifikasi, hash tidak berubah. Tetap butuh persetujuan migrasi.
- B2 (DESTRUKTIF; butuh ADR yang menggantikan ADR-034): migrasi 0016 menghapus baris `en` dan/atau kolom `locale`/`alt_en`/`caption_en`.
  Dampak:
  - Hash berubah: hash katalog/halaman memasukkan seluruh baris terjemahan termasuk `locale`; hash media memasukkan `altEn`/`captionEn`. Menghapus baris `en`, kolom `locale` (juga dari PK), atau kolom `alt_en`/`caption_en` mengubah input hash untuk SETIAP snapshot yang memuat baris/kolom itu. Snapshot lama tidak lagi lolos verifikasi hash, approval dan receipt (terikat ke ID+versi+hash, ADR-035/036) tidak cocok, pointer publikasi aktif gagal diverifikasi.
  - Trigger beku: baris anak revisi beku dilindungi `catalog_child_guard`, `*_identity_guard`, `*_receipt_guard`, `*_no_truncate` (0002, 0008-0014). DELETE/UPDATE pada revisi beku ditolak; migrasi harus menonaktifkan/mengakali guard (melanggar invarian "immutable" dan "no unapproved changes to frozen revisions").
  - Menghapus kolom: mengubah PK (`*_pk` memuat `locale`), merusak 16 snapshot Drizzle yang sudah ada (riwayat jurnal tidak bisa dicocokkan), fungsi 0006 gagal, dan perlu meninjau `scripts/lib/*-protection.mjs`.
  - Agar aman butuh format hash baru (mis. format 3 yang mengabaikan baris non-`id` dan tanpa `altEn`/`captionEn`) DAN regenerasi hash di semua snapshot, approval, receipt, serta pointer, atau penandaan versi format hash per revisi supaya verifikasi lama memakai algoritma lama. Opsi pertama menimpa bukti immutable (tidak boleh tanpa persetujuan eksplisit); opsi kedua menambah kolom `hash_format` pada tabel beku (juga lewat guard) dan membuat kode hash bercabang, bertolak belakang dengan tujuan "hapus semua".
  - Alternatif B2-reset (hanya karena data uji, tanpa produksi/VPS): kosongkan DB test/dev lalu jalankan ulang migrasi yang sudah di-squash tanpa locale. Menghapus riwayat migrasi yang sudah diterapkan melanggar kebijakan "no applied migration is deleted"; butuh persetujuan eksplisit dan tidak bisa dibatalkan.
  - Risiko: kehilangan data tak terbalik, bukti audit hilang/rusak, rollback sulit (butuh backup lengkap sebelum), kode lama tak bisa memverifikasi data baru.
  - Pengecekan wajib sebelum B2 (baca-saja): hitung baris `locale <> 'id'` per tabel; hitung snapshot/approval/receipt/pointer yang memuat baris `en` atau `alt_en/caption_en` non-kosong; jalankan hash ulang read-only dan catat seluruh hash sebagai baseline (lihat AC-9).

Jika user memilih B2: STOP, tulis ADR baru (menggantikan ADR-034 poin retensi), spec desain hash/migrasi terpisah, backup DB test/dev, kemudian persetujuan eksplisit ulang.

## 5. Acceptance criteria (Tahap A; B1)

- AC-1: `grep -rniE "locale" src/` hanya menghasilkan pengecualian yang tertulis di spec: (a) `localeCompare` (positif palsu), (b) satu konstanta data `'id'` untuk kolom DB beserta komentar alasannya, (c) kolom `locale` pada `src/server/db/schema.mjs`, (d) field `locale` pada daftar kolom hash di `catalog/content-hash.mjs` dan `pages/content-hash.mjs`, (e) daftar kolom salinan di `catalog/drafts.mjs` yang mereferensikan nama kolom DB bila masih ada. Daftar pengecualian final dicatat di laporan BE.
- AC-2: `grep -rnE "PUBLIC_LOCALE|isPageLocale|INVALID_LOCALE|\[\"id\", ?\"en\"\]|'id', ?'en'" src/` hanya mengembalikan CHECK di `schema.mjs` (cermin migrasi yang sudah ada).
- AC-3: `grep -rnE "altEn|captionEn" src/` hanya mengembalikan `server/media/policy.mjs` (daftar field hash), `server/db/schema.mjs`, dan jalur baca untuk hash; tidak ada di `features/`, `app/`, request/response API, atau output `publicRevisionMedia`.
- AC-4: `grep -rnE "/(id|en)\b" src/ next.config.mjs` tidak menemukan logika toleransi tautan (komentar sejarah singkat boleh, dicatat). `/id`, `/id/menu`, `/en`, `/en/menu` tetap HTTP 404 (e2e `navigation.spec.js` lulus tanpa diubah semantik).
- AC-5: Pembaca publik: `readPublicCatalog(client)` dan `readPublicPage(client, key)` tanpa argumen locale; keluaran publik tidak lagi memuat `locale`, `altEn`, `captionEn`; test integrasi `public-read` lulus.
- AC-6: Request API simpan halaman/batch tidak lagi menerima `locale`, `altEn`, `captionEn`; field tak dikenal ditolak 400 (aturan `exactInput` tetap, daftar dikurangi). Response tidak mengandung `locale`. Dites untuk peran Owner dan Staff; Staff tetap tidak bisa publish (RBAC tidak berubah).
- AC-7: Snapshot/revisi yang berisi baris terjemahan `en` dan `alt_en`/`caption_en` terisi: loader graf tetap memuatnya, validasi tidak melempar, clone ke draft baru menyalin hanya `id`, publish draft baru berhasil.
- AC-8: Hash tidak berubah. Test golden: untuk graf fixture dengan baris `id`+`en` dan media `altEn/captionEn` terisi, `hashCatalogContent` dan `hashPageContent` menghasilkan hash identik dengan nilai yang dikunci sebelum perubahan (nilai golden dihitung di awal dari kode saat ini, sebelum diedit). Algoritma dan urutan field di `content-hash.mjs` dan `mediaHashSnapshot` tidak berubah (diff kosong pada daftar field).
- AC-9: Baseline DB test/dev: skrip baca-saja menghitung ulang hash setiap revisi beku dan mencatat (revisionId, hash) sebelum dan sesudah Tahap A; selisih = 0. Tidak ada migrasi baru pada Tahap A (`drizzle/` tidak berubah; `git diff --stat drizzle/` kosong).
- AC-10: UI admin tidak lagi mengatakan "Dua bahasa"/"Inggris" (login dan lainnya); `grep -rniE "inggris|english|bilingual|bahasa" src/` hanya mengembalikan pengecualian yang dibenarkan.
- AC-11: Dokumen: `grep -rniE "bilingual|ID/EN|hreflang|/id\b|/en\b" README.md docs/*.md .claude .agents` hanya menghasilkan (a) ADR/catatan historis yang diberi penanda "Status update", (b) penjelasan 404 ADR-038, (c) spec ini. README, ARCHITECTURE, REQUIREMENTS, DATA_CONTRACTS, SECURITY_AND_QA, ROADMAP, OPERATIONS, PHASE2/3 mendeskripsikan situs Indonesia saja dan URL tanpa prefix tanpa menyebut `/id` 308. `.claude/agents/pm.md` & `frontend.md` dan dua SKILL.md diperbarui.
- AC-12: Lint, build, test unit, integrasi, Playwright e2e (e2e, published-e2e, cms-pages-e2e), dan pemeriksaan keamanan lulus; hasil perintah aktual dilaporkan, termasuk yang gagal/tidak dijalankan.
- AC-13 (SEO): metadata halaman tetap `noindex, nofollow` dan `<html lang="id">`; tanpa hreflang; tanpa `Restaurant`/`LocalBusiness`; tidak ada perubahan canonical/sitemap (menunggu Phase 3). Tidak ada URL baru/berubah selain yang sudah ada.
- AC-14 (B1b bila dipilih): migrasi 0016 non-destruktif lolos pada DB test/dev setelah pra-cek; sebelum dan sesudahnya hash semua revisi sama (AC-9); insert `locale='en'` baru ditolak; baris `en` lama tetap terbaca.

## 6. Dampak keamanan, SEO, merchant

- RBAC/keamanan: tidak ada perubahan peran. Pengurangan field request memperkecil permukaan input; pertahankan validasi server dan pengecekan versi/ownership. Risiko regresi: validasi graf yang terlalu longgar (mengabaikan `en`) tidak boleh melonggarkan pemeriksaan `id`; pastikan `id` tetap wajib. Tidak ada rahasia atau kredensial terlibat.
- SEO: tidak berubah (`noindex`, `lang="id"`, 404 untuk `/id`, `/en`). Hindari perubahan `metadata`/sitemap. Tautan internal lama `/id/...` yang masih tersimpan di rich text akan menjadi 404 bila toleransi dihapus (Q3).
- Merchant sync: tidak ada dampak; tidak ada panggilan endpoint merchant live; sync tetap tidak otomatis saat simpan. Data katalog yang di-hash untuk sinkron/preview (harga, tautan order) tidak berubah.

## 7. Tugas per peran

backend:
- Baseline sebelum edit: simpan hash golden dari fixture + skrip baca-saja hitung ulang hash seluruh revisi beku di DB test/dev (AC-8, AC-9).
- `src/server/public/data.mjs`, `src/server/pages/{templates,published,validation,drafts}.mjs`, `src/server/cms/{batch,current-pages,media}.mjs`, `src/server/catalog/{drafts,products,review-readiness}.mjs`, `src/server/media/{validation,policy,references}.mjs`: hapus locale/altEn/captionEn sesuai 3A; satu konstanta data `'id'`; validasi mengabaikan `en`; clone hanya `id`.
- Jangan ubah `catalog/content-hash.mjs`, `pages/content-hash.mjs`, daftar `mediaRefFields` untuk hash, `drizzle/`, atau `schema.mjs` selain komentar.
- Catat daftar pengecualian final AC-1..AC-3. Q5: tentukan apakah fungsi varian/modifier/kategori tanpa pemanggil dan usulkan penghapusan ke tahap 2 ADR-037.

frontend:
- `src/features/cms/pages/PageEditor.jsx`, `src/features/cms/media/MediaAttachments.jsx`, `src/features/public-site/{home-draft.mjs,components/PublicRichText.jsx}`: buang locale, altEn/captionEn dan normalisasi `/id|/en`; sesuaikan panggilan API (Axios/hook CMS) dengan kontrak baru; `src/app/admin/login/page.jsx:12` ganti teks; rapikan komentar `src/app/global-not-found.jsx`, `next.config.mjs`. Pertahankan `lang="id"` dan `lang="ja"`.
- Dokumen/agen: perbarui README, `docs/*.md` (tanpa menulis ulang ADR lama), `.claude/agents/{pm,frontend}.md`, `.agents/skills/{public-website,quality-security}/SKILL.md`. AGENTS.md TIDAK disentuh.

qa:
- Perbarui dan jalankan semua test di `tests/` (daftar 3D); pertahankan `tests/e2e/navigation.spec.js` dan `public-routes.spec.js`; buat fixture legacy khusus untuk AC-7/AC-8; jalankan lint, build, unit, integrasi, e2e (3 suite), cek keamanan; verifikasi AC-9 (selisih hash = 0) dan AC-1..AC-4, AC-10, AC-11 dengan grep; lapor hasil nyata.

## 8. Urutan

1. User menyetujui spec dan memilih B1/B1b/B2 (Q2).
2. BE: baseline hash, perubahan server, unit+integrasi.
3. FE: UI/API client, dokumen, sub-agen.
4. QA: seluruh suite, grep AC, verifikasi hash; maks 2 putaran perbaikan.
5. Tahap B hanya setelah persetujuan eksplisit terpisah (B1: tidak ada pekerjaan; B1b/B2: spec lanjutan + pra-cek + backup).
6. Tidak ada commit/push tanpa izin.

## 9. Risiko

- Menolak (bukan mengabaikan) baris `en` lama → publish/clone gagal untuk revisi legacy. Mitigasi: AC-7.
- Perubahan tidak sengaja pada daftar field hash → semua snapshot lama gagal verifikasi. Mitigasi: AC-8, AC-9, diff daftar field.
- Perubahan kontrak API (field dihapus) memutus klien lama/cache; Mitigasi: BE dan FE satu rilis; `exactInput` menolak field lama dengan 400 yang jelas.
- Tautan rich text lama berprefiks `/id`/`/en` menjadi 404 (Q3).
- Menggabungkan ADR-037 tahap 2 membengkakkan diff; pisahkan.
- Dokumen: menulis ulang ADR lama menghilangkan jejak keputusan; hanya tambah penanda.
- B2: lihat 4 (kehilangan data/bukti, melanggar ADR-034).

## 10. Rollback

- Tahap A: revert commit (kode + dokumen); tidak ada perubahan data atau skema, jadi pembalikan penuh dan aman; periksa hash baseline sama setelah revert. Aplikasi publik dan worker pada versi yang sama.
- B1b: migrasi forward-only; rollback = `ALTER TABLE ... DROP CONSTRAINT` dan `CREATE OR REPLACE` fungsi lama (skrip balik disiapkan dan diuji di DB test sebelum diterapkan).
- B2: tidak dapat dibalik tanpa backup penuh yang diambil sebelumnya; pulihkan dari backup dan revert kode bersamaan.

## 11. Asumsi dan pertanyaan terbuka

Asumsi: hanya DB lokal test/dev; migrasi ke DB itu diizinkan setelah pra-cek (memory); tidak ada produksi/VPS. Jumlah angka berasal dari Grep longgar, BE memverifikasi ulang. Tidak ada pembacaan penuh DECISIONS/DATA_CONTRACTS/SECURITY_AND_QA/README.

- Q1: Berapa baris `locale<>'id'` dan `alt_en/caption_en` non-kosong yang ada di DB test/dev? (pra-cek baca-saja; menentukan apakah B2 punya dampak nyata). Rekomendasi: jalankan sebelum memutuskan B.
- Q2: Pilihan tahap B: B1 (rekomendasi), B1b, atau B2? Rekomendasi: Tahap A sekarang + B1; B1b hanya bila ingin mengunci data masa depan; B2 hanya bila user memilih, dengan ADR baru dan desain hash aman (format hash berversi, bukan menimpa hash lama).
- Q3: Konten tersimpan dengan tautan rich text `/id/...` atau `/en/...`: ubah datanya (migrasi data, mengubah hash), atau biarkan jadi 404 (rekomendasi: biarkan 404; tidak ada produksi, penulis memperbaiki tautan di draft baru), atau pertahankan normalisasi satu tempat? Rekomendasi sesuai permintaan user "hapus semua": hapus normalisasi.
- Q4: Boleh `altEn`/`captionEn` tetap di jalur hash saja (rekomendasi, wajib agar hash tidak berubah)? Nilai legacy di draft hasil klon dibiarkan (rekomendasi) atau dikosongkan?
- Q5: Fungsi varian/modifier/kategori terjemahan (`saveVariantTranslation` dll., 21 baris locale di `catalog/drafts.mjs`) hanya dipakai internal (`products.mjs:104` untuk varian standar): hapus di tahap 2 ADR-037 (rekomendasi) atau cukup buang locale-nya sekarang?
- Q6: Spec lama (115 kemunculan, 6 file) dibiarkan apa adanya (rekomendasi) atau diberi catatan usang?
- Q7: AGENTS.md: user akan mengedit sendiri teks "bilingual"/"SEO ID/EN"? (usulan di 3C).
