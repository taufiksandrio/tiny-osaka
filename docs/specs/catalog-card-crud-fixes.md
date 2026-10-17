# Addendum: Perbaikan pasca-QA untuk catalog-card-crud

Status: rev.3, DRAFT menunggu persetujuan user per item. Melengkapi `docs/specs/catalog-card-crud.md` (rev.5) dan berkaitan dengan `docs/specs/nav-no-language-switch.md`. Bila bertentangan, addendum ini berlaku untuk item yang disebut. Branch: feat/catalog-card-crud.
Basis temuan QA: lint, build, unit 135/135, test DB katalog dan hapus 9/9, test:e2e 132/132, auth-e2e lulus. Belum teruji: test:cms-catalog-e2e, test:cms-pages-e2e, test:cms-media-db (terhalang temuan 2), serta test:published-e2e dan test:public-db (temuan 1, 3, 4).
Tidak ada kode aplikasi yang ditulis pm. Item bertanda [PERLU PERSETUJUAN] belum disetujui eksplisit user.

## Jawaban user yang sudah masuk
- Q1: test locale `en` di `public.spec.mjs` DIHAPUS. Q2: `categories` boleh tetap di payload publik sampai tahap 2 asal tak dipakai UI. Q4: sitemap TIDAK dibuat.
- Upload gambar: Q-I alt text WAJIB sebagai field di modal; Q-J perbaikan CWV gambar publik DIKERJAKAN SEKARANG; Q-K satu gambar per produk; Q-L test upload yang terhalang Windows boleh memakai storage tiruan atau Linux/WSL/CI.
- Navigasi/bahasa: pemilih bahasa dihapus, `/en` dihapus selamanya (404), URL tanpa segmen bahasa (`/menu`); spec `nav-no-language-switch.md` menunggu persetujuan.
- Q3 (ambang `npm audit`): belum dijawab tegas; dipakai usulan high/critical (perintah gagal hanya bila ada kerentanan tingkat tinggi/kritis di dependensi produksi; tingkat rendah/sedang hanya dilaporkan).
- Persetujuan eksplisit item 1 sampai 8 di bawah BELUM dijawab.

## Urutan eksekusi yang direkomendasikan
Prinsip: bangun jaring regresi hijau dulu, lakukan refactor struktural sekali, baru fitur baru yang menulis komponen/test terhadap struktur final.
1. Harness: temuan 2 dan 6a [PERLU PERSETUJUAN], jalankan `test:cms-catalog-e2e`, `test:cms-pages-e2e`, `test:cms-media-db` (catatan Windows di bawah).
2. Perbaikan kecil: temuan 1, 3, 4 [4 PERLU PERSETUJUAN], jalankan `test:published-e2e` dan `test:public-db`.
3. Refactor URL/bahasa (`nav-no-language-switch.md`) [PERLU PERSETUJUAN]. Alasan sebelum upload: keduanya menyentuh `PublishedContent.jsx`, `HomeContent.jsx`, dan `test:published-e2e`; refactor mengubah URL dan test secara mekanis di mana-mana, sedangkan upload menambah komponen kartu publik baru dan E2E baru yang sebaiknya ditulis sekali terhadap URL final dan tanpa prop `locale`.
4. Upload gambar + alt wajib + CWV (spec utama bagian 16) [PERLU PERSETUJUAN]: urutan backend dulu (kontrak, `products.mjs`, `product-input.mjs`, header publik, `next.config.mjs`), lalu frontend (`ProductModal`, kartu publik), lalu qa (AC-20 s.d. AC-36).
5. Tes AC-11 dan AC-13 (temuan 6d), jalankan.
6. `security:check` (temuan 6c) [PERLU PERSETUJUAN].
7. Dokumen keputusan (temuan 6f): ADR-037, ADR-038, AGENTS.md (user), dll.
8. Verifikasi penuh (lint, build, unit, integration, E2E, security); laporkan hanya yang benar-benar dijalankan. Tiap langkah di commit terpisah untuk rollback terisolasi.
Catatan Windows (baseline): `src/server/media/storage.mjs` baris 80 melempar "Unsafe media directory." di mesin ini. Strategi (keputusan, tanpa mengubah `storage.mjs` produksi demi meluluskan test): (a) integrasi/API upload memakai storage tiruan dalam memori yang disuntikkan lewat parameter `storage` pada `createCmsMedia` (sudah ada) dan `inspectImage` asli (`sharp`, tanpa filesystem) atau `createMediaAssets({ inspectFile })`; (b) logika header cache publik diuji sebagai fungsi murni; (c) E2E nyata (unggah file, optimizer Next, ukuran byte, CLS, Lighthouse) dijalankan di Linux/WSL/CI. Test yang tidak dapat dijalankan di Windows dilaporkan sebagai "tidak dijalankan", tidak di-skip diam-diam dan tidak ditandai lulus.

## Temuan 1: a11y heading-order di menu publik
- Akar masalah (terkonfirmasi): `CatalogCards` di `src/features/public-site/components/PublishedContent.jsx` baris 49 memakai `h3` tetap; dipanggil langsung di bawah `h1` (halaman menu, baris 72) dan di dalam section ber-`h2` (beranda, baris 63).
- Keputusan: prop tingkat heading: `h2` di bawah `h1`, `h3` di dalam section ber-`h2`.
- Pemilik: frontend; verifikasi qa (`npm run test:published-e2e`, 3 project).
- AC-F1: axe `heading-order` lulus di halaman menu, beranda, dan detail produk pada 3 project; card `h2` setelah `h1` di menu; `h3` di bawah `h2` di beranda; tidak ada lompatan level. (Rute disebut `/id/menu` sebelum refactor URL dan `/menu` sesudahnya.)

## Temuan 2: default `deletion=false` di `scripts/lib/cms-protection.mjs` [PERLU PERSETUJUAN]
- Akar masalah (terkonfirmasi): baris 2 default `deletion = false`; baris 19 membandingkan daftar aksi constraint `catalog_workflow_events_action` secara EXACT; baris 21 menambah `catalog_deletion_log` ke SELECT hanya bila `deletion`. Setelah 0014, pemanggil tanpa argumen gagal: `scripts/run-cms-catalog-qa.mjs` (10, 38), `run-cms-pages-qa.mjs` (10, 31), `run-cms-media-qa.mjs` (14, 40), `scripts/verify-dev-db.mjs` (52), `tests/integration/cms-media.test.mjs` (56). `migrate-*-db.mjs` dan `catalog-delete.test.mjs` sudah eksplisit.
- Penilaian: penyelarasan dengan migrasi 0014, bukan pelonggaran; exact-match tetap; `catalog_deletion_log` hanya SELECT, tanpa INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES.
- Rekomendasi: default `deletion = true`. Argumen per pemanggil ditolak (6 perubahan, mudah terlewat); deteksi otomatis ditolak (menerima dua keadaan, lebih longgar).
- Tetap dicek: semua assertion peran, isolasi DB, hak per tabel per privilege untuk CMS dan app, hak kolom `cms_auth`, constraint aksi exact termasuk `delete`, `catalog_deletion_log` SELECT-only. `scripts/lib/catalog-protection.mjs` tidak diubah.
- Pemilik: qa (satu baris), review backend, user meninjau diff.
- AC-F2: (a) `verifyCmsProtection(client, owner)` tanpa opsi lulus pada DB sampai 0014 dan GAGAL bila constraint tidak memuat `delete` atau peran CMS punya INSERT/UPDATE/DELETE pada `catalog_deletion_log` (uji negatif di DB test terisolasi); (b) `test:cms-catalog-e2e`, `test:cms-pages-e2e`, `test:cms-media-db`, `verify-dev-db` lulus precondition; (c) E2E katalog desktop, mobile, small-mobile dijalankan dan dilaporkan.

## Temuan 3: `tests/published-e2e/public.spec.mjs` baris 53-64
- Akar masalah: test memakai UI modifier lama.
- Keputusan: ganti dengan test harga tunggal; test locale `en` DIHAPUS (Q1). Pemilik: qa. Fixture memakai harga 250000.
- AC-F3: detail produk menampilkan h1 `QA Product id`, harga `Rp 250.000`, tanpa `role=status` Lengkapi, tanpa checkbox/select varian/modifier, axe bersih, tanpa overflow horizontal. Setelah upload ada, test memeriksa gambar dengan alt = `imageAlt` yang diisi (AC-23). Tidak ada test locale `en`. Catatan: setelah refactor URL, test memakai `/menu/<slug>`.

## Temuan 4: `tests/integration/public-read.test.mjs` baris 10 dan 34-36 [PERLU PERSETUJUAN]
- Akar masalah (terkonfirmasi): baris 10 mengimpor `calculatePrice`; baris 34-36 memakai `pricingProduct` (sudah dihapus), `fixture.optionId`, ekspektasi 400000. Cakupan harga tetap ada di baris 32.
- Keputusan: hapus blok dan impor; assertion pengganti pada payload `readPublicCatalog`: (1) produk tidak mengekspos `variants`/`modifierGroups`/`optionIds` ke klien (atau `productPrice` satu-satunya harga yang dipakai view model); (2) `JSON.stringify(catalog)` tanpa kata `modifier`; (3) `productPrice` 250000 dan benar untuk produk kedua berharga berbeda; (4) urutan terbaru dulu dan `featuredProducts(catalog, 4)` maksimal 4.
- Catatan (Q2): baris 31 membaca `catalog.categories[0]` boleh tetap; tambah penelusuran bahwa tidak ada komponen publik merender `categories`.
- Pemilik: qa; konfirmasi payload oleh backend.
- AC-F4: `npm run test:public-db` lulus tanpa ReferenceError; tanpa impor `calculatePrice`/`pricingProduct`; assertion pengganti 1-4 ada; jumlah assertion harga tidak turun.

## Temuan 5: AC-7 dan sitemap (diputuskan user: tidak dibuat)
- REQUIREMENTS.md baris 22 dan ROADMAP Phase 3 mewajibkan sitemap, tetapi belum ada di `src`. AC-7 sudah direvisi di spec utama (klausul sitemap dihapus; verifikasi 404 dan hilang dari grid/beranda). Catatan "sitemap kelak hanya produk live" masuk ROADMAP Phase 3 oleh developer.
- AC-F5: test memastikan URL produk terhapus 404 (bukan 200 kosong); laporan QA tidak mengklaim sitemap.

## Temuan 6
### 6a. `scripts/run-cms-catalog-qa.mjs` usang
- Akar masalah: baris 27-35 melacak dan membersihkan `catalog_revisions`, `categories`, `products` lewat event aktor; setelah hapus A1 hanya satu snapshot live tersisa dan produk terhapus tak punya event lama.
- Keputusan: bersihkan lewat (1) daftar slug produk "QA ..." yang dicatat runner dan (2) koneksi OWNER test DB (bukan peran CMS) dengan guard host test; sebelum run tegaskan tidak ada sisa "QA " (bersihkan bila ada), sesudah run tegaskan katalog kembali seperti sebelum run. Aset media hasil E2E (immutable, tak bisa dihapus peran CMS) dan file `.media/test` dibersihkan lewat koneksi owner test DB hanya untuk aset yang dibuat run itu (dilacak lewat `media_events` aktor QA), dengan guard host dan direktori test.
- Pemilik: qa. AC-F6a: setelah `test:cms-catalog-e2e` (lulus atau gagal) tidak ada produk "QA ", akun QA, atau aset QA tersisa di DB/`.media/test`; dua run berturut-turut lulus; pembersihan menolak host non-test.

### 6b. Test varian/modifier/kategori dibiarkan sampai tahap 2
- `tests/integration/catalog-{variants,modifiers,constraints,translations,clone,drafts,foundation,publication}.test.mjs`, `pricing-constraints.test.mjs`, unit `catalog-pricing/drafts/review-readiness/workflow/content-hash` tetap dijalankan sebagai regresi skema; tidak di-skip; dihapus bersama skema di tahap 2. AC-F6b: laporan QA mencantumkannya sebagai "regresi skema tahap 2".

### 6c. "Security check" yang realistis [PERLU PERSETUJUAN]
- Cakupan minimum tanpa dependency baru: (1) `npm audit --omit=dev --audit-level=high` (gagal pada high/critical produksi; jaringan read-only ke registry, perlu izin); (2) suite auth/RBAC (`test:auth-db`, `test:auth-e2e`) + tes AC-11, AC-13, AC-22 baru; (3) `verifyCmsProtection` dan `catalog-protection` setelah temuan 2; (4) cek nama variabel rahasia tidak ada di `.next/static` setelah build; (5) lint.
- Tambah script `security:check` di `package.json` [PERLU PERSETUJUAN]. Pemilik: backend (script), qa (menjalankan). Perbaikan dependensi butuh persetujuan terpisah.
- AC-F6c: `npm run security:check` ada dan hasil nyata dilaporkan; tidak ada klaim lulus tanpa menjalankan.

### 6d. Tes minimal AC-11, AC-13, dan upload
- AC-11: tanpa sesi create/update/delete 401; Origin salah/hilang ditolak; CSRF salah/hilang ditolak; Staff create/update berhasil, delete 403 dan produk utuh; akun nonaktif ditolak; Owner delete berhasil dan satu baris `catalog_deletion_log`.
- AC-13: dua update paralel dengan `expectedVersion` sama: satu sukses satu konflik; update vs delete paralel: tidak ada produk setengah terhapus, katalog live valid (satu snapshot, hash cocok); dua create paralel nama sama: slug `x` dan `x-2`.
- Upload (AC-20 s.d. AC-36): spec utama bagian 7 dan 13, dengan strategi Windows di atas.
- AC-F6d: tes-tes itu ada, dijalankan, hasil dilaporkan.

### 6e. Status AC-18
- Dry-run read-only sudah dijalankan backend ke DB lokal dev: 1 produk, 1 varian; tidak ada keputusan manual Owner. QA mengonfirmasi tes penolakan host non-lokal dan tanpa-tulis di `tests/unit/catalog-variants-report.test.mjs`. Ulangi dry-run sebelum tahap 2.

### 6f. Dokumen keputusan yang belum diperbarui
Dikerjakan developer/user; pm tidak menulis di luar `docs/specs/`. Draf ADR-037 ada di spec utama bagian 15, ADR-038 di `nav-no-language-switch.md` bagian 11.
- `docs/DECISIONS.md` [developer]: ADR-037 dan ADR-038; tandai ADR-002, ADR-008, ADR-014 s.d. ADR-019, ADR-034 (klausa URL), ADR-036 diamandemen; catat risiko diterima dan hasil verifikasi.
- `AGENTS.md` [user]: revisi "validate final modifier costs", "Staff may draft/submit; Owner approves", dan "SEO ID/EN"/"bilingual".
- `docs/REQUIREMENTS.md` [developer]: CMS dan Catalog (card CRUD, hard delete, upload gambar, 4 produk terbaru); SEO (tanpa hreflang, URL tanpa prefix).
- `docs/DATA_CONTRACTS.md` [backend, via Grep]: kontrak katalog tanpa kategori/varian/modifier, `imageAssetId`/`imageAlt`, purge dan deletion log, header cache media publik, baca publik dengan locale tetap `id`.
- `docs/ROADMAP.md` [developer]: Phase 2; Phase 3 sitemap belum dibangun dan canonical/hreflang menjadi canonical tanpa prefix.
- `docs/SECURITY_AND_QA.md` [qa]: hasil verifikasi aktual, risiko diterima, baseline Windows; operasi: prosedur penarikan media dan cache optimizer; `docs/PHASE2_PLAN.md`/`PHASE3_PLAN.md`/README/skill `.agents/skills/*` yang menyebut varian, kategori, scheduling, bilingual [developer, via Grep].
- AC-F6f: Grep tidak menemukan klaim yang bertentangan kecuali sebagai catatan historis.

## Item yang membutuhkan persetujuan eksplisit user (BELUM disetujui; rekomendasi: setuju)
1. Temuan 2: default `deletion=true` di `scripts/lib/cms-protection.mjs`.
2. Temuan 4: hapus assertion `calculatePrice`, ganti assertion 1-4.
3. Temuan 5: teks AC-7 tanpa klausul sitemap.
4. Temuan 6c: script `security:check` di `package.json`, izin `npm audit`, ambang high/critical.
5. Temuan 6f: penerapan ADR-037, ADR-038, dan perubahan AGENTS.md serta dokumen keputusan.
6. Temuan 6a: perubahan script pembersihan test DB (termasuk aset QA).
7. Upload gambar, alt wajib, dan CWV (spec utama bagian 16), termasuk konfigurasi `images` Next dan header cache publik.
8. Refactor URL/bahasa (`nav-no-language-switch.md`), termasuk jawaban Q-1 (perlakuan `/id/*`).
9. Opsional: memoize verifikasi digest di `storage.mjs` (perubahan pengecekan integritas; spec utama Q-P).

## Pertanyaan terbuka
- Q3: Ambang `npm audit` high/critical (usulan) atau moderate?
- Spec utama: Q-M persetujuan bagian 16, Q-N jendela cache 3600 detik, Q-O ambang 150 KB dan CLS 0.1, Q-P memoize digest, Q-Q hero beranda.
- Spec navigasi: Q-1 sampai Q-6 (terutama redirect `/id/*` vs 404, canonical sekarang atau nanti).
