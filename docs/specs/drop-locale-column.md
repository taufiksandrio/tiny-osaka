# Spec: Tahap B - hapus kolom `locale`, `alt_en`, `caption_en` dari skema (migrasi 0016)

Status: SELESAI (2026-10-18). Bukti: PR #23 ter-merge ke main (b49a5db); DB `tiny_osaka_test` dan `tiny_osaka_dev` sudah di state migrasi 17 (0016 terapan; diverifikasi baca-saja oleh agen backend). QA di main: lint, build, unit 168/168, integration DB, E2E Playwright, security-check, dan `drizzle-kit check` lulus; `/id` dan `/en` mengembalikan 404; tidak ada kemunculan `locale` selain di `tests/integration/drop-language-schema.test.mjs` dan `scripts/lib/language-removal-protection.mjs`. Berkas migrasi: drizzle/0016_drop_language_columns.sql (ADR-039).
BELUM teruji / belum terbukti (jangan dianggap lulus): AC-1 (backup dan pra-cek), AC-2 (pengecekan langsung riwayat `drizzle.__drizzle_migrations`; role migrator tidak bisa SELECT skema drizzle), AC-7 (atomisitas), AC-8 (konsistensi hash dari data DB), AC-13 (smoke dev), AC-15 (dokumen). Bukti no-op `db:migrate:test`/`db:migrate:dev` (jalankan kedua) juga belum ada: perintah ditolak pengaman dan belum dijalankan user.
Tanggal: 2026-10-18. Penulis: PM. Lanjutan `docs/specs/remove-all-locale-code.md` (opsi B2 DISETUJUI user: "kolom locale hapus saja ga berguna"; sebelumnya: "pokoknya jangan ada /id /eng apapun caranya lakukan").
Prasyarat keras: Tahap A (kode/test/dokumen tanpa locale) selesai dan hijau. Tahap B mengubah skema, hash, dan data; kode dan DB harus berpindah bersamaan (lihat bagian 9, risiko R2).

## 1. Masalah dan tujuan

Setelah Tahap A, kode tidak lagi memodelkan bahasa, tetapi DB masih menyimpan: kolom `locale` (NOT NULL, bagian PK, CHECK `IN ('id','en')`) di 6 tabel terjemahan; kolom `alt_en`/`caption_en` di 2 tabel referensi media; fungsi SQL `public_read_catalog(p_locale)` / `public_read_page(p_key,p_locale)` yang mem-filter locale; dan satu konstanta data `STORED_LOCALE = "id"` (`src/server/db/stored-language.mjs`) hanya untuk memuaskan skema. Tujuan: hapus semuanya dari skema, fungsi SQL, kode, test, dan dokumen, sehingga tidak ada lagi jejak locale selain riwayat migrasi lama (`drizzle/0000-0015`, tidak boleh diedit) dan teks ADR historis.

Masalah inti: hash snapshot immutable dihitung dari baris terjemahan TERMASUK `locale` (`src/server/catalog/content-hash.mjs` 5 daftar field; `src/server/pages/content-hash.mjs` `row.locale`) dan dari `altEn`/`captionEn` (`mediaRefFields` di `src/server/media/policy.mjs:13`). Menghapus kolom itu mengubah input hash setiap snapshot lama. Hash tersimpan di 9 tabel (lihat 3.4) dan diverifikasi ulang saat publish/baca (`src/server/pages/published.mjs:25` -> `HASH_CONFLICT`; `src/server/catalog/published.mjs:21` -> "Content integrity failure").

## 2. Keputusan terkait dan batas

- ADR-034 ("Legacy English rows, immutable hashes/receipts, published pointers ... retained", "Existing hash algorithms stay unchanged") DIAMANDEMEN oleh ADR-039 (draf di bagian 6). Tanpa ADR-039 disetujui, pekerjaan ini tidak boleh dimulai.
- AGENTS.md: "Release requires ...", "no unapproved production migrations", "immutable hash/receipt" tetap berlaku untuk produksi. Pengecualian ini HANYA untuk DB lokal `tiny_osaka_test` dan `tiny_osaka_dev` (tidak ada produksi/VPS, tidak ada data nyata menurut user). Migrasi menolak berjalan di luar dua role owner lokal.
- ADR-037 tahap 2 (hapus varian/modifier/kategori beserta tabel terjemahannya) TIDAK digabung ke sini; tabel-tabel itu hanya kehilangan kolom `locale`.
- Out of scope: mengubah nama tabel `*_translations`/`page_translations` (rename = diff besar; lihat Q4), menyentuh produksi/VPS, merchant sync, mengubah URL/SEO, menghapus `media_assets`/file media, mengedit AGENTS.md (hanya user), mengedit migrasi 0000-0015 atau `drizzle/meta/0000..0015_snapshot.json`.

## 3. Inventaris objek DB (hasil Grep/Read; BE verifikasi ulang dengan `pg_catalog`)

### 3.1 Tabel dan kolom

| Tabel | Kolom | PK sekarang | CHECK sekarang | Perubahan di 0016 |
|---|---|---|---|---|
| `category_translations` | `locale` | `category_translations_pk (revision_id, category_id, locale)` | `category_translations_locale` | drop CHECK, drop PK, drop kolom, PK baru `(revision_id, category_id)` |
| `product_translations` | `locale` | `(revision_id, product_id, locale)` | `product_translations_locale` | PK baru `(revision_id, product_id)` |
| `variant_translations` | `locale` | `(revision_id, product_id, variant_id, locale)` | `variant_translations_locale` | PK baru `(revision_id, product_id, variant_id)` |
| `modifier_group_translations` | `locale` | `(revision_id, product_id, group_id, locale)` | `modifier_group_translations_locale` | PK baru `(revision_id, product_id, group_id)` |
| `modifier_option_translations` | `locale` | `(revision_id, product_id, group_id, option_id, locale)` | `modifier_option_translations_locale` | PK baru `(revision_id, product_id, group_id, option_id)` |
| `page_translations` | `locale` | `page_translations_pk (revision_id, locale)` | `page_translations_locale` | PK baru `(revision_id)` (satu baris isi per revisi) |
| `catalog_media_refs` | `alt_en`, `caption_en` (NOT NULL DEFAULT '') | PK tidak berubah | `catalog_media_refs_text` (panjang alt_id, alt_en, caption_id, caption_en) | drop CHECK, drop 2 kolom, CHECK baru hanya `alt_id <= 500` dan `caption_id <= 2000` |
| `page_media_refs` | `alt_en`, `caption_en` | tidak berubah | `page_media_refs_text` | sama |

Sumber: `drizzle/0000` (category/product), `0001` (variant, modifier group/option), `0004` (page), `0005` (media refs), `src/server/db/schema.mjs:84-324,428-434`. Tidak ada FK, indeks non-PK, trigger, atau GRANT kolom yang menyebut `locale`/`alt_en`/`caption_en` (Grep `drizzle/*.sql`: hanya 0000, 0001, 0004, 0005, 0006, 0014). GRANT di 0008-0010 bersifat tabel-level sehingga tidak terpengaruh. Catatan: PK dan CHECK dijatuhkan EKSPLISIT (bukan mengandalkan DROP COLUMN) agar nama constraint PK dipertahankan dan CHECK media diganti, bukan hilang.

### 3.2 Fungsi SQL

| Fungsi | Sumber | Perubahan |
|---|---|---|
| `public.public_read_catalog(p_locale text)` | 0006 | DROP lalu CREATE `public_read_catalog()` tanpa argumen: tanpa `t.locale=p_locale`, tanpa `p_locale IN ('id','en')`, media `'alt',m.alt_id,'caption',m.caption_id` |
| `public.public_read_page(p_key text, p_locale text)` | 0006 | DROP lalu CREATE `public_read_page(p_key text)`: tanpa join `t.locale`, tanpa kunci `'locale'` di JSON keluaran, `alt_id`/`caption_id` |
| `public.catalog_purge_product(uuid,text)` | 0014 baris 63 | `CREATE OR REPLACE` dengan satu perubahan: hapus `AND t.locale = 'id'` (nama produk diambil dari baris terjemahan terbaru). Signature, SECURITY DEFINER, `search_path`, ACL tidak berubah |
| `public_read_media` (0010/0011), semua `catalog_*`/`page_*`/`media_*`/`publishing_*` guard | - | Tidak menyebut locale; tidak diubah |

Kedua fungsi baru wajib mempertahankan kelengkapan pengerasan 0006: `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog`, `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE` hanya ke role `*_app` melalui blok `DO` yang menolak role selain `tiny_osaka_test_owner`/`tiny_osaka_dev_owner`. Format `CREATE FUNCTION public.public_read_x(...) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$ ... $$;` harus persis karena `scripts/lib/public-read-protection.mjs:7` mem-parse file SQL dengan regex itu.

### 3.3 Trigger dan guard

Tidak ada trigger yang menyebut kolom ini. Guard beku (`catalog_child_guard` pada 5 tabel terjemahan, `page_translation_guard`, `media_reference_guard`, `*_no_truncate`, `catalog_root_guard`, receipt/publication/event guard) tetap sama. Dampaknya hanya prosedural: baris snapshot beku tidak bisa di-DELETE/UPDATE tanpa menonaktifkan guard (`ALTER TABLE ... DISABLE TRIGGER USER`, pola yang sama dengan `catalog_purge_product` 0014). Setelah migrasi, semua trigger harus `tgenabled='O'` (sudah diperiksa `verify*Protection`).

### 3.4 Lokasi hash (semua terikat ke input yang berubah)

`catalog_revisions.content_hash`, `catalog_submissions.content_hash`, `catalog_approvals.content_hash` (FK komposit ke submissions `ON UPDATE RESTRICT`), `catalog_publication.content_hash` (FK komposit ke approvals), `page_revisions.content_hash` (UNIQUE `(page_key,id,content_hash)`), `page_submissions`, `page_approvals`, `page_publications` (FK komposit ke revisions dan approvals), `publication_jobs.content_hash` (di-freeze oleh `publishing_guard_job`). Kode yang memverifikasi/menghitung: `catalog/{workflow,published,products}.mjs`, `pages/{workflow,published}.mjs`, `cms/current-pages.mjs`, loader `catalog/review.mjs::loadCatalogGraph` dan `pages/drafts.mjs::loadPageGraph`.

### 3.5 Skrip proteksi dan rencana migrasi (state = panjang riwayat Drizzle)

- `scripts/lib/{test,dev}-migration-plan.mjs`: `reviewedMigrations` (16 entri dengan hash berkas), `journal.entries.length !== 16`, daftar state `[12..16]`, pesan "0000-0015". Perlu entri ke-17 (`0016_...`, hash berkas dipin setelah ditulis) dan state `[12..17]`.
- `scripts/migrate-{test,dev}-db.mjs`: `initialState === 16` -> no-op, verifikasi akhir `!== 16`; panggilan `verifyPublicReadProtection(..., { media })`; pesan log.
- `scripts/lib/public-read-protection.mjs`: membaca 0006+0010 untuk badan fungsi; setelah 0016 badan `public_read_catalog/page` harus diambil dari 0016 (fungsi lama sudah tidak ada). Banyak pemanggil tanpa argumen (`tests/fixtures/published-data.mjs:103`, `scripts/verify-dev-db.mjs:50`, `tests/integration/*`), jadi default harus "sesudah 0016"; runner meneruskan `localeRemoved: state >= 17` untuk state antara.
- `scripts/lib/catalog-protection.mjs`: tambah verifikasi state >= 17 (kolom/PK/CHECK/fungsi tanpa locale). `scripts/security-check.mjs:30`, `tests/fixtures/catalog-cleanup.mjs:14`, `tests/integration/catalog-delete.test.mjs:39` memakai literal state `15`/`16` -> perlu dinaikkan atau diganti konstanta. `tests/integration/catalog-publication.test.mjs:378` menegaskan jumlah riwayat = 16 -> 17. `tests/unit/{test,dev}-migration-plan.test.mjs` menegaskan state 15/16.
- `scripts/lib/catalog-variants-report.mjs:27` memakai `t.locale = 'id'` pada join -> hapus kondisi itu (dan sesuaikan `tests/unit/catalog-variants-report.test.mjs`).
- `drizzle/meta/_journal.json` + `drizzle/meta/0016_snapshot.json` dihasilkan `drizzle-kit generate` dari `schema.mjs` baru; SQL hasil generate DIGANTI SQL tulis-tangan yang direview (pola 0014).

## 4. Strategi hash dan data: opsi dan REKOMENDASI

### Opsi

- S1 - hash berversi (format baru tanpa locale; snapshot lama ditandai legacy, tidak diverifikasi). TIDAK MEMUNGKINKAN bila kolom benar-benar dihapus: input hash lama (`locale`, `alt_en`, `caption_en`) sudah tidak ada di DB, jadi hash lama tidak bisa dihitung ulang oleh siapa pun. Konsekuensi: harus menambah kolom penanda legacy pada tabel beku (butuh bypass guard juga), cek integritas `published.mjs` harus dilewati untuk snapshot legacy (melemahkan deteksi manipulasi), dan kode hash bercabang dua selamanya - bertentangan dengan tujuan "hapus semua". S1 hanya masuk akal untuk B1 (kolom dipertahankan), yang sudah ditolak user.
- S2 - hitung ulang dan tulis ulang hash + approval + receipt semua snapshot. Hash tidak bisa dihitung di SQL (canonical JSON + sha256 harus identik dengan JS), jadi perlu skrip JS di dalam transaksi migrasi; harus menimpa 9 tabel yang diikat FK komposit `ON UPDATE RESTRICT` (non-deferrable) sehingga FK harus di-drop lalu dipasang ulang, serta menonaktifkan semua guard beku. Hasilnya: receipt "Owner X menyetujui hash H" diubah menjadi H' yang tidak pernah dilihat/disetujui siapa pun - bukti dipalsukan, bukan dilestarikan; pembuktian hanya "kode yang sama menghitung ulang". Kompleksitas dan blast radius tertinggi, tanpa manfaat nyata karena tidak ada data nyata.
- S3 - reset konten uji (kosongkan snapshot, revisi, approval, receipt, terjemahan, pointer publikasi, job) lalu ubah skema dan seed ulang. Sederhana, murni SQL + satu hook runner, atomik, dan bukti benar menurut konstruksi: tidak ada snapshot berhash lama yang tersisa; semua hash berikutnya dihitung oleh kode baru.

### REKOMENDASI: S3 (reset), dengan dua pengaman

Alasan: (1) kebenaran bukti - tidak ada approval/receipt yang dimodifikasi; yang ada dihapus utuh bersama datanya, dan semua yang dibuat sesudahnya konsisten; (2) kompleksitas terkecil dan satu jalur hash (tanpa percabangan legacy); (3) risiko terbatas pada data yang menurut user hanya data uji dan DB yang bisa di-backup; (4) rollback realistis (restore backup); (5) test DB memang diasumsikan kosong saat diam (`tests/fixtures/published-data.mjs::assertEmptyTestDatabase` menegaskan semua `allTables` bernilai 0), jadi untuk test DB reset hanya membersihkan sisa. Hanya aman karena TIDAK ADA data nyata dan TIDAK ADA produksi/VPS; untuk produksi nanti, strategi ini TIDAK berlaku dan butuh ADR + persetujuan baru.

Pengaman 1 (fail-closed): berkas migrasi 0016 sendiri HANYA struktural dan di awal menegaskan (`DO` + `RAISE EXCEPTION`) bahwa 8 tabel yang diubah plus `catalog_revisions`/`page_revisions` kosong. Jika seseorang menjalankan 0016 lewat jalur lain pada DB berisi konten, migrasi gagal dan tidak menghapus apa pun. Penghapusan konten dilakukan di hook `prepare` runner (`applyReviewedMigration(client, migrations, verify, prepare)`, `scripts/lib/apply-reviewed-migration.mjs`) yang berjalan di transaksi yang sama.
Pengaman 2 (konfirmasi eksplisit): hook reset hanya berjalan bila runner dipanggil dengan variabel lingkungan `TINY_OSAKA_CONFIRM_CONTENT_RESET=0016`; tanpa itu runner berhenti sebelum `BEGIN` dengan pesan yang menunjuk ke prasyarat bagian 7. Reset juga menolak jalan bila role bukan `tiny_osaka_test_owner`/`tiny_osaka_dev_owner`.

### Yang hilang dan yang dipertahankan (S3)

Dihapus (hanya di DB test/dev): semua revisi katalog dan halaman (draft dan beku), terjemahan, entri/varian/modifier, `catalog_media_refs`/`page_media_refs` (lampiran gambar), submission/approval, workflow events, pointer publikasi (`catalog_publication`, `page_publications`), `publication_jobs`/`publication_events`, identitas `products` dan `categories` (agar slug bisa dipakai ulang). Akibatnya di dev: kartu produk, gambar yang terpasang, tautan order, dan halaman yang sudah dipublikasi hilang; situs publik tidak punya konten terbit sampai Owner membuat dan mempublikasi ulang.
Dipertahankan: `cms_auth.*` (akun, peran, sesi, audit), `media_assets` dan `media_events` (metadata immutable + berkas fisik tetap valid dan bisa dilampirkan ulang), `pages` (identitas key/template), `catalog_deletion_log` (append-only), riwayat `drizzle.__drizzle_migrations`.
Jejak operasi: runner mencetak jumlah baris per tabel yang dihapus (hanya angka, tanpa data) dan laporan BE menyalinnya; ADR-039 mencatat bahwa reset terjadi.

### Urutan langkah migrasi (satu transaksi runner; tidak perlu 0017)

Runner `migrate-{test,dev}-db.mjs` (start state 16, target 17), sudah menahan advisory lock runner:

1. Validasi berkas/jurnal (17 entri) dan state awal tepat 16; env konfirmasi ada; role owner lokal.
2. `BEGIN` -> hook `prepare` (JS, daftar eksplisit, diuji):
   a. cek ulang state 16;
   b. `pg_advisory_xact_lock(76210990)` lalu `(76210984)` (urutan sama dengan 0014), dan `(76210985, hashtext(page_key))` tidak perlu karena `LOCK TABLE` di bawah;
   c. `LOCK TABLE <semua tabel yang dihapus + diubah> IN ACCESS EXCLUSIVE MODE` (`lock_timeout` 5 detik sudah di klien; aplikasi dev/test harus berhenti);
   d. cetak hitungan baris per tabel;
   e. `ALTER TABLE ... DISABLE TRIGGER USER` pada tabel yang dihapus;
   f. `DELETE` urutan aman-FK (anak -> induk): `publication_events`, `publication_jobs`, `catalog_publication`, `page_publications`, `catalog_workflow_events`, `page_workflow_events`, `catalog_approvals`, `page_approvals`, `catalog_submissions`, `page_submissions`, `modifier_option_translations`, `modifier_options`, `modifier_group_translations`, `modifier_groups`, `variant_translations`, `product_variants`, `catalog_media_refs`, `page_media_refs`, `product_translations`, `product_entries`, `category_translations`, `category_entries`, `page_translations`, `catalog_revisions`, `page_revisions`, `products`, `categories` (DELETE, bukan TRUNCATE: TRUNCATE dilarang guard dan FK RESTRICT);
   g. `ALTER TABLE ... ENABLE TRIGGER USER` pada semua tabel yang tadi dinonaktifkan, lalu assert jumlah trigger non-internal `tgenabled <> 'O'` = 0.
3. SQL 0016 (statement terpisah, `--> statement-breakpoint`): (i) `DO` assert 10 tabel kosong; (ii) per tabel terjemahan: `DROP CONSTRAINT IF EXISTS <t>_locale`, `DROP CONSTRAINT IF EXISTS <t>_pk`, `DROP COLUMN IF EXISTS locale`, `ADD CONSTRAINT <t>_pk PRIMARY KEY (...)` (nama sama); (iii) per tabel media ref: drop CHECK, `DROP COLUMN IF EXISTS alt_en, caption_en`, tambah CHECK baru; (iv) `DROP FUNCTION IF EXISTS` kedua `public_read_*` lama, `CREATE FUNCTION` baru, `REVOKE`/`GRANT` via blok `DO`; (v) `CREATE OR REPLACE FUNCTION public.catalog_purge_product` tanpa filter locale; (vi) tidak ada GRANT baru lain.
4. Insert baris riwayat (oleh `applyReviewedMigration`), lalu `verify`: `checkHistory` state 17 (semua `verify*Protection` + pemeriksaan ketiadaan kolom/constraint/fungsi lama + semua tabel yang dihapus berjumlah 0 + tabel yang dipertahankan berjumlah sama dengan sebelum).
5. `COMMIT`. Kegagalan di mana pun -> `ROLLBACK` (DDL Postgres transaksional): DB kembali utuh di state 16 beserta datanya.

Idempoten: runner menolak/no-op bila state sudah 17 (cetak "already applied"); `IF EXISTS` pada semua DROP; DELETE pada tabel kosong aman. Atomik: seluruh reset + DDL + riwayat + verifikasi dalam satu transaksi. Tidak perlu 0017 (tidak ada langkah yang harus di luar transaksi).

## 5. Dampak ke kode, test, dan dokumen

### 5.1 Kode (nama/field yang berubah)

- `src/server/db/schema.mjs`: hapus 6 kolom `locale`, `altEn`, `captionEn`; PK 6 tabel seperti 3.1; hapus 6 CHECK `*_locale`; CHECK `*_text` tanpa kolom en.
- `src/server/db/stored-language.mjs`: HAPUS berkas (`STORED_LOCALE`). `src/server/public/data.mjs`: `SELECT public.public_read_catalog()` dan `public_read_page($1::text)`; hapus `delete result.locale`.
- Hash: `catalog/content-hash.mjs` hapus `"locale"` dari 5 daftar; `pages/content-hash.mjs` hapus `locale` dan pengurutan berdasarkan locale (satu baris per revisi; bentuk muatan hash bebas diubah BE karena tidak ada hash lama yang bertahan, tetapi harus deterministik dan dikunci golden baru); `media/policy.mjs` `mediaRefFields` hapus `altEn`, `captionEn`; komentar "Legacy English columns" di `media/validation.mjs:35` dihapus. Tidak perlu penanda `format` baru (Q6).
- Penulis/pembaca: `catalog/drafts.mjs` (target upsert tanpa `locale`, daftar kolom klon baris ~324-333 tanpa `locale`/`alt_en`/`caption_en`), `catalog/products.mjs:50` (cari terjemahan per `productId`), `catalog/review-readiness.mjs` (satu terjemahan per entitas; PK menjamin; cukup validasi judul), `pages/drafts.mjs` (upsert target `revisionId`; klon `INSERT .. SELECT` tanpa locale/alt_en/caption_en, baris 65-69), `pages/validation.mjs`, `cms/pages.mjs`, `media/references.mjs`, `cms/media.mjs`, `cms/batch.mjs`. Loader graf (`catalog/review.mjs`, `pages/drafts.mjs::loadPageGraph`) memakai `select()` penuh: otomatis tanpa kolom, tidak perlu perubahan selain tipe field.
- `scripts/lib/catalog-variants-report.mjs` (3.5), skrip proteksi dan rencana migrasi (3.5), skrip baru `scripts/precheck-drop-language.mjs` (baca-saja; bagian 7).
- Sisa konstanta/komentar dari Tahap A yang menyebut locale (mis. `tests/unit/legacy-hash-golden.test.mjs`, komentar `stored-language`) dihapus/diganti.

### 5.2 Test dan fixture

- Hapus/ganti `tests/unit/legacy-hash-golden.test.mjs` (mengunci hash lama + `locale`): diganti golden baru (nilai dihitung dari kode baru, dikunci sebagai regresi format sesudah ADR-039).
- Tulis ulang fixture/test yang membuat baris `en`, `altEn`/`captionEn`, atau menegaskan CHECK `locale IN (...)` dan multi-locale: `tests/fixtures/{published-data,media,page-content}.mjs`, `tests/integration/{pages,catalog-translations,catalog-constraints,catalog-modifiers,catalog-variants,pricing-constraints,catalog-clone,catalog-foundation,public-read,media,cms-media,cms-catalog-image,current-pages}.test.mjs`, `tests/unit/{catalog-drafts,catalog-review-readiness,page-content,media,home-draft,catalog-content-hash}.test.mjs`, `tests/cms-pages-e2e/pages.spec.mjs`. Angka saat ini: `locale|altEn|captionEn|alt_en|caption_en` 182 kemunculan di 25 file (BE hitung ulang dari hasil Tahap A).
- Test baru: (a) ketiadaan kolom/constraint locale via `information_schema`/`pg_constraint`; (b) bentuk PK baru; (c) signature dan keluaran `public_read_*` (tanpa `locale`); (d) purge produk tetap berfungsi dan mencatat nama; (e) hash: golden baru + hitung ulang snapshot beku terbit == hash tersimpan di revision/submission/approval/pointer; (f) unit hook reset (daftar tabel reset = `allTables` dikurangi `media_assets`, `media_events`, `pages`; urutan DELETE tidak melanggar FK; menolak tanpa env konfirmasi/role salah).
- Test regresi yang tetap: `tests/e2e/navigation.spec.js` dan `public-routes.spec.js` (404 untuk `/id`, `/en`).
- Pesan tersisa: `tests/unit/{test,dev}-migration-plan.test.mjs` (state 17), `catalog-publication.test.mjs:378` (17).

### 5.3 Dokumen (dikerjakan agen implementasi, bukan PM)

`docs/DECISIONS.md` (tambah ADR-039 + "Status update" pada ADR-034), `docs/DATA_CONTRACTS.md` (kontrak `public_read_*`, hash), `docs/SECURITY_AND_QA.md`, `docs/ROADMAP.md`, `docs/OPERATIONS.md` (prosedur backup/reset lokal), `README.md`. ADR lama tidak ditulis ulang.

## 6. Draf ADR-039 (untuk disalin ke `docs/DECISIONS.md` setelah disetujui)

```
## ADR-039 - Hapus kolom locale, alt_en, caption_en; reset konten uji (2026-10-18)

Status: Diusulkan (menunggu persetujuan user). Mengamandemen ADR-034 (klausa retensi
"legacy English rows, immutable hashes/receipts, published pointers dan nilai field lama
dipertahankan; algoritma hash tidak berubah") dan melengkapi ADR-038.

Konteks: situs hanya berbahasa Indonesia. Kolom locale (di 6 tabel terjemahan, ikut PK),
alt_en/caption_en (2 tabel media ref), serta argumen locale pada fungsi public_read_* tidak
memiliki fungsi. Hash snapshot immutable memuat kolom-kolom itu, sehingga menghapusnya
membatalkan verifikasi semua snapshot, approval, dan receipt lama. Seluruh data di DB
tiny_osaka_test dan tiny_osaka_dev adalah data uji; tidak ada data nyata, DB produksi, atau VPS.

Keputusan: (1) Migrasi 0016 menghapus kolom tersebut, mengubah PK, CHECK, dan fungsi
public_read_* (tanpa argumen locale) serta catalog_purge_product. (2) Konten ber-hash di DB
test/dev (revisi, terjemahan, approval, submission, event, pointer publikasi, job, lampiran
media, identitas produk/kategori) DIHAPUS dalam transaksi yang sama, bukan dihitung ulang;
tidak ada hash/approval/receipt lama yang ditulis ulang. cms_auth, media_assets, media_events,
pages, catalog_deletion_log dan riwayat migrasi dipertahankan. (3) Semua hash sesudah 0016
dihitung dari daftar field tanpa locale/altEn/captionEn; golden test baru mengunci format.
(4) Runner menolak reset tanpa TINY_OSAKA_CONFIRM_CONTENT_RESET=0016 dan di luar role owner
lokal; berkas 0016 gagal bila tabel berisi konten. (5) Tidak berlaku untuk produksi: migrasi
produksi nanti butuh ADR, backup, dan persetujuan terpisah, dan hash lama TIDAK boleh ditulis ulang.

Konsekuensi: invariant "hash/receipt immutable" tetap untuk semua snapshot yang pernah
dibuat sesudah 0016; tidak ada snapshot sebelum 0016 yang dapat diverifikasi karena sudah
dihapus. Pemulihan hanya lewat backup DB. Kode, test, dokumen kehilangan seluruh konsep locale.
```

## 7. Prasyarat dan pengecekan sebelum menjalankan (baca-saja kecuali dinyatakan lain)

Prasyarat berurutan:
1. Tahap A selesai: lint, build, semua `test:*`, Playwright e2e hijau (hasil aktual dilaporkan), diff direview user. Cabang Tahap B diambil dari hasil Tahap A (Q8).
2. ADR-039 dan spec ini disetujui user.
3. Server dev/aplikasi dihentikan (lock `ACCESS EXCLUSIVE` + `lock_timeout` 5 detik).
4. Pra-cek baca-saja di DB test lalu dev (hasil ditempelkan ke laporan BE dan ditinjau user sebelum dev). Cara disarankan: skrip `scripts/precheck-drop-language.mjs` (BE; `BEGIN READ ONLY`, memakai kredensial migrator, hanya cetak angka dan nilai non-sensitif):
   - `node --env-file=.env.test-migrator.local scripts/precheck-drop-language.mjs`
   - `node --env-file=.env.dev-migrator.local scripts/precheck-drop-language.mjs`
   Alternatif manual (PowerShell, klien PostgreSQL 18 seperti `scripts/setup-*.ps1`; kata sandi diminta interaktif, tidak ditulis di mana pun):
   ```
   $env:PGOPTIONS='-c default_transaction_read_only=on'
   $psql='C:\Program Files\PostgreSQL\18\bin\psql.exe'
   & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d tiny_osaka_test -W -f <berkas SQL di bawah>
   & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d tiny_osaka_dev  -W -f <berkas SQL di bawah>
   ```
   Isi SQL pra-cek: (a) untuk tiap 6 tabel terjemahan `SELECT count(*) total, count(*) FILTER (WHERE locale<>'id') non_id FROM public.<tabel>`; (b) `SELECT count(*) FILTER (WHERE alt_en<>'' OR caption_en<>'') FROM public.catalog_media_refs` dan `public.page_media_refs`; (c) `SELECT status,count(*) FROM public.catalog_revisions GROUP BY 1` dan `page_revisions`; (d) `count(*)` tiap tabel yang akan dihapus, `publication_jobs` per `status`, `catalog_publication`, `page_publications`; (e) `count(*)` tabel yang dipertahankan (`media_assets`, `media_events`, `pages`, `catalog_deletion_log`, `cms_auth.*`); (f) `SELECT DISTINCT approved_by FROM public.catalog_approvals UNION SELECT DISTINCT approved_by FROM public.page_approvals`, `SELECT slug FROM public.products`, `SELECT key FROM public.pages` agar user dapat memastikan semuanya data uji; (g) `SELECT count(*) FROM drizzle.__drizzle_migrations` harus 16.
5. Backup (WAJIB untuk dev; test juga disarankan karena kecil), simpan DI LUAR repo:
   ```
   New-Item -ItemType Directory -Force "$env:USERPROFILE\tiny-osaka-backups" | Out-Null
   & 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' -h 127.0.0.1 -p 5432 -U postgres -d tiny_osaka_dev  -Fc -f "$env:USERPROFILE\tiny-osaka-backups\tiny_osaka_dev_pre0016.dump"
   & 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' -h 127.0.0.1 -p 5432 -U postgres -d tiny_osaka_test -Fc -f "$env:USERPROFILE\tiny-osaka-backups\tiny_osaka_test_pre0016.dump"
   & 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --list "$env:USERPROFILE\tiny-osaka-backups\tiny_osaka_dev_pre0016.dump" | Select-Object -First 5
   Get-FileHash "$env:USERPROFILE\tiny-osaka-backups\tiny_osaka_dev_pre0016.dump"
   ```
   Dump menyertakan skema `drizzle` dan `cms_auth` (akun). Kepemilikan objek dipertahankan (jangan `--no-owner`). Media bytes tidak tersentuh migrasi sehingga tidak perlu dicadangkan khusus.
6. Uji di DB test dulu (urutan perintah, setelah kode/SQL 0016 direview dan unit hijau):
   ```
   $env:TINY_OSAKA_CONFIRM_CONTENT_RESET='0016'; npm run db:migrate:test
   Remove-Item Env:TINY_OSAKA_CONFIRM_CONTENT_RESET
   npm run db:migrate:test   # harus mencetak "already applied", tanpa perubahan
   ```
   lalu seluruh suite DB/e2e (bagian 8, AC-11). Hanya bila hijau dan user menyetujui pra-cek dev:
   ```
   $env:TINY_OSAKA_CONFIRM_CONTENT_RESET='0016'; npm run db:migrate:dev
   Remove-Item Env:TINY_OSAKA_CONFIRM_CONTENT_RESET
   node --env-file=.env.dev-migrator.local scripts/verify-dev-db.mjs
   ```
   (`scripts/verify-dev-db.mjs` dijalankan sesuai cara pemakaiannya saat ini; BE konfirmasi nama env/flag dari berkasnya.) Tidak ada perintah terhadap VPS/produksi/merchant.

## 8. Acceptance criteria

- AC-1: Pra-cek test dan dev tercatat (jumlah `locale<>'id'`, `alt_en/caption_en` terisi, jumlah baris per tabel, daftar aktor/slug) dan ditinjau user sebelum migrasi dev. File backup dev dan test ada, ukuran > 0, `pg_restore --list` berhasil, hash file tercatat.
- AC-2: Setelah migrasi, `SELECT count(*) FROM drizzle.__drizzle_migrations` = 17, baris terakhir cocok dengan hash berkas 0016 yang dipin di kedua rencana migrasi; `npm run db:migrate:test` / `db:migrate:dev` kedua kali = no-op ("already applied").
- AC-3: `SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('locale','alt_en','caption_en')` = 0 baris di DB test dan dev.
- AC-4: PK 6 tabel terjemahan sesuai 3.1 (nama constraint sama; `pg_get_constraintdef`); tidak ada constraint dengan definisi memuat `locale`/`alt_en`/`caption_en`; `catalog_media_refs_text` dan `page_media_refs_text` hanya membatasi `alt_id` (<=500) dan `caption_id` (<=2000).
- AC-5: `public_read_catalog()` dan `public_read_page(text)` ada; signature lama (`(text)`, `(text,text)`) tidak ada; badan fungsi dan `catalog_purge_product` tidak memuat `locale`/`alt_en`; ACL: EXECUTE hanya owner + role app (public read) dan owner + role cms (purge); `SECURITY DEFINER` + `search_path=pg_catalog`; keluaran JSON tanpa kunci `locale`.
- AC-6: Setelah migrasi: semua tabel yang dihapus berjumlah 0; `media_assets`, `media_events`, `pages`, `catalog_deletion_log`, `cms_auth.*` berjumlah sama dengan baseline pra-cek; seluruh trigger non-internal `tgenabled='O'`; tidak ada transaksi/lock tersisa.
- AC-7: Atomisitas terbukti: uji gagal-sengaja pada DB test (mis. run dengan env konfirmasi tetapi dengan satu `verify` dipaksa gagal di test unit/dobel runner) meninggalkan state 16 dengan data utuh; tanpa env konfirmasi, runner berhenti sebelum `BEGIN`; 0016 pada DB berkonten gagal dengan pesan assert (diuji di test unit/integrasi tanpa menyentuh DB nyata, atau di DB test berisi satu baris fixture lalu dibersihkan).
- AC-8: Konsistensi hash: setelah kode baru membuat dan mempublikasi konten di DB test (fixture/e2e), untuk setiap revisi non-draft katalog dan halaman: hash dihitung ulang dari graf = `content_hash` revisi = submission = approval = pointer publikasi (dan job bila ada); 0 selisih. Golden test baru untuk `hashCatalogContent` dan `hashPageContent` lulus. Tidak ada kode yang membaca `locale`/`altEn`/`captionEn` untuk hash.
- AC-9: `grep -rniE "locale|altEn|captionEn|alt_en|caption_en|STORED_LOCALE" src tests scripts next.config.mjs` hanya menghasilkan: `localeCompare` (positif palsu) dan SATU modul pernyataan ketiadaan kolom di `scripts/lib/` beserta test yang memakainya (nama kolom sebagai string pengecekan). `drizzle/0000-0015*.sql`, `drizzle/meta/0000-0015_snapshot.json`, berkas 0016 (komentar), dan teks ADR historis dikecualikan. Hasil dicatat.
- AC-10: `npx drizzle-kit generate` (atau cek drift setara) tidak menghasilkan perubahan baru; `drizzle/meta/0016_snapshot.json` selaras dengan `schema.mjs`.
- AC-11: Dijalankan dan dilaporkan hasil aktual: `npm run lint`, `npm run build`, `test:db-config`, `test:db-connection`, `test:workflow-unit`, `test:catalog-cards-unit`, semua `test:*-db` (catalog, pricing, drafts, clone, translations, variants, modifiers, foundation, publication, pages, media, public, auth, cms-catalog, cms-media, catalog-delete, cms-catalog-security), unit lain di `tests/unit`, Playwright `npm run test:e2e`, `test:published-e2e`, `test:auth-e2e`, `test:cms-pages-e2e`, `test:cms-catalog-e2e`, `test:cms-media-e2e`, `node scripts/security-check.mjs`. Gagal/tidak dijalankan disebut apa adanya.
- AC-12: `/id`, `/id/menu`, `/en`, `/en/menu` tetap 404; `<html lang="id">`; metadata `noindex, nofollow`; tanpa hreflang/`Restaurant`/`LocalBusiness`; tidak ada URL/canonical/sitemap berubah.
- AC-13: Smoke dev (setelah migrasi dev, server dev dijalankan atas izin user): halaman publik merespons tanpa HTTP 500 saat belum ada konten terbit (perilaku 404/fallback dicatat); login Owner berfungsi; Owner dapat membuat dan mempublikasi satu halaman dan satu kartu produk baru; hash konsisten (AC-8).
- AC-14: RBAC tidak berubah: Staff tetap tidak bisa publish/hapus produk; `catalog_purge_product` tetap Owner-only (role dicek di fungsi dan EXECUTE hanya untuk role cms); runtime role tidak punya hak DDL/DELETE baru.
- AC-15: Dokumen bagian 5.3 diperbarui, ADR-039 ada di `docs/DECISIONS.md`, ADR-034 diberi "Status update"; `grep -rniE "locale|alt_en|caption_en" README.md docs/*.md .claude .agents` hanya di ADR/riwayat bertanda dan spec.

## 9. Dampak keamanan, SEO, merchant

- Keamanan/RBAC: tidak ada perubahan peran. Pelanggaran invariant immutable bersifat terbatas, disengaja, dan hanya di DB lokal test/dev: guard dinonaktifkan HANYA di dalam transaksi migrasi oleh role owner lokal (pola 0014), dibuktikan aktif kembali sebelum COMMIT (AC-6). Tiga lapis pengaman penyalahgunaan: guard role owner, env konfirmasi, assert tabel kosong di 0016 (fail-closed untuk jalur lain). Permukaan input berkurang (kolom dan field dihapus). Tidak ada kredensial di log/laporan; perintah memakai env file dan prompt kata sandi interaktif.
- SEO: tidak berubah (lihat AC-12). Selama dev belum punya konten terbit, halaman publik kosong/fallback - tidak berdampak ke indeks karena situs `noindex`.
- Merchant sync: tidak ada dampak; tidak ada panggilan endpoint merchant live; sinkron tetap tidak otomatis saat simpan. Tautan order (kolom 0015 di `product_entries`) ikut terhapus bersama entri produk di dev/test dan dibuat ulang lewat CMS.

## 10. Tugas per peran

backend:
- Setelah ADR-039 dan spec disetujui dan Tahap A hijau: cabang baru dari hasil Tahap A. Ubah `src/server/db/schema.mjs`; `drizzle-kit generate` untuk jurnal + snapshot 0016, lalu GANTI SQL dengan 0016 tulis-tangan (bagian 4); pin hash berkas di `scripts/lib/{test,dev}-migration-plan.mjs` (17 entri, state `[12..17]`, pesan); `scripts/migrate-{test,dev}-db.mjs` (no-op di 17, env konfirmasi, hook reset `scripts/lib/reset-local-content.mjs`, verifikasi akhir 17); perbarui `scripts/lib/{public-read,catalog}-protection.mjs`, tambah modul pernyataan ketiadaan locale, `scripts/security-check.mjs`, `scripts/verify-dev-db.mjs`, `scripts/lib/catalog-variants-report.mjs`; tulis `scripts/precheck-drop-language.mjs`.
- Ubah kode di 5.1; hapus `stored-language.mjs`; hash tanpa locale/en; unit test dan integrasi yang disentuh pada 5.2; jangan jalankan migrasi dev sebelum test hijau dan user menyetujui pra-cek dev.
- Jalankan pra-cek, backup, migrasi test sesuai bagian 7 (izin migrasi DB test/dev sudah diberikan user setelah pra-cek; reset dev tetap berhenti di titik tinjauan - Q5).
frontend:
- `src/features/**` dan `src/app/**`: konfirmasi nol sisa locale/altEn/captionEn (hasil Tahap A); `tests/e2e/*` dan `tests/cms-*-e2e` yang menyebut locale/EN; dokumen bagian 5.3, ADR-039, `.claude/agents` dan `.agents/skills` bila masih menyebut locale; usulan teks AGENTS.md untuk user bila ada.
qa:
- Tulis ulang/uji test pada 5.2; jalankan AC-1..AC-15 dan semua perintah AC-11 di test, ulang di dev sesuai yang relevan (`verify-dev-db`, smoke AC-13); verifikasi AC-8 (hash) dan AC-9 (grep); maksimal 2 putaran perbaikan; laporkan hasil aktual.

## 11. Urutan

1. User menyetujui spec + ADR-039 (+ jawaban Q1-Q8). 2. BE: skema, 0016, runner, kode, unit. 3. BE: pra-cek + backup + migrasi test. 4. FE: dokumen/e2e. 5. QA: suite penuh di test (maks 2 putaran). 6. STOP: tampilkan pra-cek dev ke user. 7. Backup + migrasi dev + verify + smoke. 8. Laporan akhir; tidak ada commit/push tanpa izin.

## 12. Risiko

- R1 Kehilangan data tak terbalik di dev/test: mitigasi pra-cek yang ditinjau user, backup terverifikasi, env konfirmasi, hanya role owner lokal.
- R2 Kode dan DB harus selaras: kode B tidak jalan di DB state 16 (INSERT tanpa `locale` gagal) dan kode A tidak jalan di state 17. Test DB yang sudah termigrasi tidak bisa menjalankan cabang Tahap A lagi. Mitigasi: satu unit rilis, jangan migrasi dev sebelum cabang B lengkap; dev server dihentikan.
- R3 `public-read-protection.mjs` mem-parse SQL dengan regex: format fungsi di 0016 menyimpang -> verifikasi gagal. Mitigasi: salin format 0006 persis; unit test regex.
- R4 `statement_timeout` 15 detik / `lock_timeout` 5 detik pada klien migrator: proses lain yang memegang lock membuat migrasi gagal (aman, rollback). Mitigasi: hentikan aplikasi/test lain; jangan menaikkan timeout tanpa alasan.
- R5 Urutan DELETE/FK salah atau tabel terlewat: seluruh transaksi rollback; diuji unit (daftar vs `allTables`) dan di DB test lebih dulu.
- R6 Drift Drizzle (snapshot vs `schema.mjs`) atau hash berkas 0016 tidak dipin: runner menolak (aman); AC-10.
- R7 Sisa residu di test DB (suite yang gagal) ikut terhapus tanpa jejak; `media_assets` residu tetap ada dan membuat `assertEmptyTestDatabase` gagal (kondisi lama, di luar scope; pra-cek melaporkannya).
- R8 Situs dev tanpa konten terbit: perilaku fallback belum terverifikasi (AC-13); Owner harus mempublikasi ulang (tidak diotomasi agen; publish tetap aksi Owner).
- R9 Jejak audit append-only (`*_workflow_events`) di DB test/dev hilang: diterima karena data uji; dicatat di ADR-039 dan laporan.
- R10 Rujukan lama ke angka state (15/16 literal) di test/skrip terlewat: grep AC-9/AC-11 menangkapnya.

## 13. Rollback (realistis)

- Sebelum COMMIT: otomatis `ROLLBACK`, DB tetap state 16 utuh.
- Sesudah COMMIT di dev: stop aplikasi; restore dari backup sebagai superuser lokal: `pg_restore --clean --if-exists --single-transaction -h 127.0.0.1 -p 5432 -U postgres -d tiny_osaka_dev "$env:USERPROFILE\tiny-osaka-backups\tiny_osaka_dev_pre0016.dump"` (hasilnya state 16 + data semula), lalu kembalikan kode ke cabang Tahap A (`git checkout`/revert cabang B). Setelah restore jalankan `node --env-file=.env.dev-migrator.local scripts/verify-dev-db.mjs` dengan kode Tahap A.
- Test DB: restore dari dump test dengan perintah serupa, atau karena datanya tidak bernilai, re-migrate dari awal hanya lewat prosedur bootstrap yang disetujui terpisah (runner menolak DB kosong).
- Tidak ada skrip "down" untuk 0016 (data sudah dihapus; mengembalikan kolom tanpa data tidak bermakna). Mengembalikan kode tanpa mengembalikan DB (atau sebaliknya) tidak didukung.
- Media bytes tidak berubah sehingga tidak perlu dipulihkan.

## 14. Asumsi dan pertanyaan terbuka

Asumsi: hanya DB lokal `tiny_osaka_test`/`tiny_osaka_dev` (PostgreSQL 18, 127.0.0.1:5432, role `*_owner`/`*_migrator` seperti `scripts/lib/*-db.mjs`); tidak ada produksi/VPS/data nyata (pernyataan user); izin migrasi lokal setelah pra-cek (memory proyek). Inventaris berasal dari Grep/Read; BE verifikasi ulang nama constraint PK dan FK terhadap DB nyata. Saya tidak membaca utuh DECISIONS/DATA_CONTRACTS/SECURITY_AND_QA/README. Tahap A sedang dikerjakan: angka kemunculan bisa berubah.

- Q1: Setujui S3 (reset konten uji, tanpa menulis ulang hash/approval/receipt)? Rekomendasi: ya. Alternatif S1/S2 ditolak (bagian 4).
- Q2: `media_assets`/`media_events` tetap (rekomendasi: tetap, berkas fisik tetap valid dan bisa dilampirkan ulang) atau ikut dihapus?
- Q3: `catalog_deletion_log` (jejak penghapusan produk) tetap? Rekomendasi: tetap.
- Q4: Nama tabel `*_translations`/`page_translations` dipertahankan? Rekomendasi: ya (rename = diff besar tanpa manfaat; tabel varian/modifier/kategori-terjemahan akan dihapus di ADR-037 tahap 2).
- Q5: Titik berhenti sebelum reset dev: tampilkan hasil pra-cek dev ke user dan tunggu "lanjut"? Rekomendasi: ya (satu jeda); izin umum "migrasi test/dev setelah pra-cek" tetap dihormati, tetapi ini penghapusan data.
- Q6: Naikkan penanda `format` hash (saat ini `media ? 2 : 1`)? Rekomendasi: tidak; tidak ada snapshot lama yang tersisa, penanda baru hanya menambah cabang.
- Q7: Setelah reset dev, perlu skrip seed konten dev? Rekomendasi: tidak; konten dibuat ulang lewat CMS (Owner mempublikasi). Bila situs dev tidak nyaman kosong, seed dibuat sebagai spec terpisah.
- Q8: Cabang untuk Tahap B: dari hasil Tahap A setelah user meng-commit/merge A (rekomendasi: cabang baru `chore/drop-locale-column`); kapan A di-commit sepenuhnya keputusan user.
- Q9: State awal yang diizinkan runner tetap `[12..17]` (rekomendasi) atau dipersempit ke `[16,17]` karena reset hanya bermakna dari 16? Rekomendasi: persempit hook reset ke start 16 saja (start <16 ditolak dengan pesan), daftar state lain tidak diubah.
