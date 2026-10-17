# Spec: Katalog card CRUD, URL tanpa id, tanpa varian/kategori, hard delete, upload gambar

Status: rev.5. Rev.3 disetujui user 2026-10-17. Bagian 16 (upload gambar, alt text wajib, perbaikan CWV gambar publik) sudah dijawab user pada Q-I..Q-L tetapi rancangannya BELUM disetujui eksplisit: MENUNGGU PERSETUJUAN USER. Bagian lain tidak berubah dari rev.3. Implementasi, file migrasi, dan dependency baru tetap mengikuti gerbang AGENTS.md. Addendum perbaikan pasca-QA: `docs/specs/catalog-card-crud-fixes.md`.
Branch: feat/catalog-card-crud. ADR-037 (draf di bagian 15) wajib dicatat karena menimpa keputusan yang disetujui.

## 1. Masalah dan tujuan
- Editor katalog berbasis revisi (`/admin/catalog/[revisionId]`) menampilkan UUID revisi, kategori, varian, modifier. Terlalu rumit untuk toko tunggal.
- Tujuan: satu halaman katalog berupa grid card produk (gambar, nama, deskripsi, harga) dengan Edit dan Hapus per card, modal Tambah/Ubah produk (nama, deskripsi, harga, upload gambar dengan teks alternatif wajib), tanpa id di URL, tanpa varian/kategori, tanpa sisa fitur "Publikasi terjadwal", dan gambar publik yang ringan (CWV).

## 2. Keputusan user (final, kecuali dinyatakan menunggu)
1. Sisa scheduling: kode dibersihkan; tabel/data job dibiarkan sampai tahap 2.
2. URL lama ber-id: langsung dihapus (tanpa redirect, hasilnya 404).
3. RBAC: Owner dan Staff boleh Tambah/Ubah dan langsung tayang; Hapus hanya Owner.
4. Hapus: HARD DELETE permanen, LANGSUNG tanpa dialog konfirmasi (risiko diterima, bagian 8).
5. Skema kategori/varian/modifier: dihapus di tahap 2.
6. Urutan card: terbaru di atas (`createdAt` desc), admin dan publik. Slug otomatis dari nama; slug produk terhapus boleh langsung dipakai ulang.
7. Multi-varian: skrip dry-run read-only hanya ke DB lokal dev (sudah dijalankan: 1 produk, 1 varian).
8. Gambar (REV.4, membalik keputusan A rev.3 "tanpa field gambar"): modal berisi nama, deskripsi, harga, dan upload gambar. Alt text WAJIB sebagai field di modal (Q-I, REV.5). Satu gambar per produk (Q-K).
9. Hard delete: Opsi A1. Migrasi purge 0014 sudah ada.
10. Aset media produk yang dihapus tetap disimpan di Pustaka media.
11. Featured beranda: 4 produk terbaru, tanpa kontrol manual.
12. (REV.5, Q-J) Perbaikan CWV gambar publik DIKERJAKAN SEKARANG, bukan ditunda.
13. (REV.5, Q-L) Test upload yang terhalang Windows boleh dijalankan dengan storage tiruan atau di Linux/WSL/CI.
14. `npm audit` ambang: usulan high/critical sampai user menyatakan lain.

## 3. Temuan kondisi awal (read-only)
URL admin dengan id:
- `/admin/catalog/[revisionId]` (`src/app/admin/catalog/[revisionId]/page.jsx`), ditautkan dari `src/app/admin/catalog/page.jsx`, dibuat oleh `src/features/cms/catalog/CatalogActions.jsx`. Halaman menampilkan "ID revisi" dan "Revisi xxxxxxxx".
- `/admin/pages/[pageKey]/[revisionId]` (hanya redirect sisa ADR-036). `pageKey` adalah kunci tetap, bukan UUID, dipertahankan.
- API: `/api/cms/catalog/[revisionId]`, `.../actions`, `/api/cms/pages/[revisionId]`, `.../actions`; `media/references` membawa id di body/query. Tidak ada `?id=`.

Scheduling:
- `AdminNav.jsx` sudah tidak memuat menu "Publikasi terjadwal" (ADR-036). Sisa: label di `AdminHeader.jsx`; `src/app/admin/publications/page.jsx`; kode di `src/server/publishing/{worker,service,locks}.mjs`, `src/server/cms/approval.mjs`, `src/server/catalog/workflow.mjs`, `src/server/pages/workflow.mjs`, `src/features/cms/{pages,catalog}/client.js`, route API schedule (410), worker CLI, test scheduling; tabel `publication_jobs`/`publication_events` (migrasi 0012, 0013).

Struktur katalog:
- Skema `src/server/db/schema.mjs`: `catalog_revisions`, `categories`, `category_entries/translations`, `products`, `product_entries` (`categoryId` NOT NULL), `product_translations`, `product_variants` (HARGA di `base_price`), `variant_translations`, `modifier_groups/options` (+translations), `catalog_submissions/approvals/publication/workflow_events`, `catalog_media_refs` (kolom `alt_id`, `alt_en`, `caption_id`, `caption_en`, `sort_order`), dan (0014) `catalog_deletion_log`.
- Proteksi DB (migrasi 0002, 0003, 0005): trigger root/child/identity/receipt/event/publication, `catalog_deny_truncate`; FK `ON DELETE RESTRICT`; hash konten; `media_guard_reference` (hanya draft yang dapat ditulis).
- Server: `src/server/catalog/{products,product-input,drafts,pricing,review,review-readiness,workflow,content-hash,published}.mjs`, `src/server/cms/{catalog,catalog-http,batch,approval}.mjs`; API `src/app/api/cms/catalog/route.js` dan `products/[slug]/route.js`.
- UI: `src/features/cms/catalog/{ProductCard,ProductModal,...}.jsx`.
- Publik: `src/features/public-site/components/{PublishedContent,PublishedMedia,HomeContent}.jsx`, `src/features/public-site/page-content.js`, `src/server/public/view-models.mjs`, `src/app/media/[assetId]/route.js`, `next.config.mjs` (belum ada blok `images`).
- Kode merchant sync tidak ditemukan di `src`.

## 4. Konflik dengan keputusan/invariant yang ada (ditangani ADR-037)
- AGENTS.md: "validate final modifier costs"; "Staff may draft/submit; Owner approves ... publishes" dilonggarkan untuk katalog (disetujui user).
- REQUIREMENTS.md bagian Catalog dan CMS; DECISIONS.md: ADR-008, ADR-014 s.d. ADR-019, ~924, ~1186; ADR-036.
- Hard delete bertentangan dengan snapshot immutable dan audit append-only; bagian 8.
- Upload gambar dan perbaikan CWV TIDAK melanggar invariant: memakai pipeline media disetujui; tidak ada retouch/crop di CMS (derivatif ukuran dibuat saat penyajian publik, bukan penyuntingan konten); tanpa dependency baru (Next 16.4.1 dan sharp 0.35.5 sudah terpasang). Invarian "aset yang ditarik tidak boleh tetap ter-cache tanpa kendali" ditangani AC-31.
- DATA_CONTRACTS.md dan ROADMAP Phase 2 harus diperbarui.
- Invariant yang tidak dilanggar: tanpa checkout/stok, simpan/hapus/unggah tidak memicu sync merchant, RBAC server-side, tanpa data fiktif.

## 5. Scope
1. `/admin/catalog` tunggal tanpa id; Tambah/Ubah lewat modal. Semua URL dan route ber-id dihapus tanpa redirect.
2. Grid card: gambar atau placeholder, nama, deskripsi, harga IDR, tombol Edit dan Hapus; terbaru di atas.
3. Modal Tambah/Ubah: nama, deskripsi, harga, upload gambar opsional dengan alt text wajib bila ada gambar (bagian 16).
4. Hapus: satu klik hard delete permanen (bagian 8). Hanya Owner.
5. Hapus UI/API/publik untuk varian, modifier, kategori.
6. Bersihkan kode scheduling (bagian 6).
7. Ganti tampilan id/revisi dengan waktu ubah (WIB).
8. Slug otomatis (bagian 9), featured beranda 4 produk terbaru (bagian 10), dry-run multi-varian (bagian 11).
9. (REV.5) Perbaikan CWV gambar publik: header cache, ETag, derivatif via Next image optimizer, rasio tetap, prioritas (bagian 16.3).

## 6. Pembersihan scheduling dan ADR-036
- Hapus kode: label `AdminHeader`, `src/app/admin/publications/page.jsx`, route API schedule, worker CLI, `worker.mjs`, bagian jadwal di `service.mjs`/`locks.mjs`/`approval.mjs`/workflow, fungsi client, test scheduling. Dicatat sebagai amandemen ADR-036 di ADR-037.
- Hapus KODE saja; tabel `publication_jobs`/`publication_events` dan datanya dibiarkan. Tahap 2: drop atau ekspor-arsip lewat migrasi terpisah.
- Trigger/fungsi DB yang memakai job (0012-0013) tidak dihapus tanpa migrasi.

## 7. Acceptance criteria
- AC-1: `/admin/catalog` menampilkan grid card: gambar (bila ada) atau placeholder beralt-text, nama, deskripsi, harga IDR bulat, tombol Edit dan Hapus (nama aksesibel memuat nama produk). Modal Tambah/Ubah memuat field nama, deskripsi, harga, gambar, dan teks alternatif gambar.
- AC-2: Tidak ada URL admin yang memuat UUID atau `?id=`; `/admin/catalog/<uuid>` dan `/admin/pages/<key>/<uuid>` menghasilkan 404 (tanpa redirect); route API ber-`[revisionId]` tidak ada. Membuka modal tidak mengubah path.
- AC-3: "Tambah produk" membuka modal berisi nama (wajib), deskripsi (opsional), harga (wajib, integer >= 0 aman JS), gambar (opsional) dengan teks alternatif (wajib bila ada gambar); simpan sukses menutup modal dan card baru muncul paling atas, langsung tayang di publik.
- AC-4: Validasi gagal mempertahankan input (termasuk file terpilih dan alt), error lokal dekat tombol aksi, katalog publik tidak berubah.
- AC-5: Edit memakai modal yang sama dan hanya mengubah produk itu; gambar yang ada tetap bila tidak diubah; konflik versi antar sesi (termasuk perubahan gambar atau alt) ditolak tanpa menimpa.
- AC-6: Klik Hapus oleh Owner langsung menghapus permanen tanpa dialog konfirmasi; tombol nonaktif selama request; kegagalan menampilkan error dan produk tetap ada; Staff tidak melihat tombol Hapus dan API menolak 403.
- AC-7: Setelah hapus, produk tidak ada di grid, website publik, dan tidak tersisa di tabel produk/terjemahan/varian/entri/media refs pada snapshot manapun; hanya satu snapshot katalog (yang live) tersisa; `media_assets` dan file media tetap ada dan tampil di Pustaka media; slug yang sama dapat dipakai produk baru segera; URL publik produk terhapus 404. Klausul sitemap dihapus (sitemap belum ada, Phase 3; user memutuskan tidak dibuat).
- AC-7a: Beranda menampilkan maksimal 4 produk terbaru (`createdAt` desc) tanpa kontrol featured manual.
- AC-7b: Slug otomatis: bentrok menjadi `-2`, `-3`; nama yang menghasilkan slug kosong ditolak; mengganti nama tidak mengubah slug.
- AC-7c: Migrasi purge (0014) lolos di DB lokal terisolasi; fungsi hanya dapat dieksekusi oleh peran CMS; setiap hapus menulis satu baris `catalog_deletion_log`.
- AC-8: UI/API admin tidak memuat kategori, varian, modifier, topping; input berisi field itu ditolak (whitelist; hanya `imageAssetId` dan `imageAlt` yang ditambahkan, AC-20).
- AC-9: Publik tanpa grup kategori dan tanpa pemilih varian; teks "Varian, topping & modifier" dihapus; harga tampil = harga tersimpan; urutan terbaru di atas.
- AC-10: Tidak ada "Publikasi terjadwal" di sidebar, header, route, API; tidak ada kode worker/schedule tersisa; tabel job utuh.
- AC-11: RBAC server: 401 tanpa sesi; Origin/CSRF diverifikasi; Staff dapat Tambah/Ubah tetapi tidak Hapus; akun nonaktif ditolak. Diuji di level API.
- AC-12: Tambah/Ubah/Hapus menghasilkan audit dengan aktor nyata (hapus: `catalog_deletion_log`); tidak ada sync merchant.
- AC-13: Dua pengguna menyunting bersamaan tidak merusak katalog publik; hapus bersamaan dengan edit berakhir konsisten.
- AC-14: Aksesibilitas modal (fokus terjebak, Esc, fokus kembali, label, target >= 44px, mobile); hasil hapus dan hasil upload diumumkan lewat live region.
- AC-15: Beranda maksimal 4 produk terbaru.
- AC-16: Slug otomatis sesuai AC-7b.
- AC-17: Migrasi purge sesuai AC-7c; tidak dijalankan ke staging/produksi tanpa persetujuan terpisah.
- AC-18: Dry-run multi-varian hanya SELECT dan menolak host non-lokal. Status: sudah dijalankan backend ke DB lokal dev (1 produk, 1 varian); QA mengonfirmasi tes penolakan host non-lokal dan tanpa-tulis.
- AC-19: Lint, build, unit, integration, E2E dan security check lulus. Test varian/modifier/kategori/pricing tetap dijalankan sebagai regresi skema sampai tahap 2 (tidak di-skip); test scheduling dihapus.
- AC-20 (kontrak, REV.5): `POST /api/cms/catalog` menerima `imageAssetId` (UUID aset terdaftar) dan `imageAlt` (string); keduanya HARUS ada bersama atau keduanya absen. `PATCH /api/cms/catalog/products/[slug]` mengikuti aturan: (a) kedua kunci absen = gambar dan alt tidak berubah; (b) `imageAssetId` UUID + `imageAlt` non-kosong = pasang atau ganti gambar; (c) `imageAssetId: null` tanpa `imageAlt` (atau `imageAlt: null`) = lepas gambar; (d) hanya `imageAlt` (tanpa `imageAssetId`) = ubah alt gambar yang sudah ada, ditolak `IMAGE_REQUIRED` bila produk tak punya gambar; (e) `imageAssetId` UUID tanpa `imageAlt` ditolak `INVALID_IMAGE_ALT` (alt wajib, tidak ada penggunaan ulang diam-diam); (f) `imageAlt` non-null bersama `imageAssetId: null` ditolak. Aset harus ada dan bertipe `image` (video/YouTube/UUID tak dikenal ditolak 400: `IMAGE_NOT_FOUND`/`INVALID_IMAGE`). Satu gambar per produk. Kunci lain di luar whitelist tetap ditolak.
- AC-20a (alt, REV.5): `imageAlt` di-trim, panjang 1..500 karakter (batas kolom `alt_id`), tanpa karakter kontrol, tanpa `<` atau `>`. Pesan Indonesia di UI dan respons: kosong "Teks alternatif gambar wajib diisi."; terlalu panjang "Teks alternatif maksimal 500 karakter."; karakter terlarang "Teks alternatif tidak boleh memuat < atau >."; gambar tanpa alt "Isi teks alternatif untuk gambar ini."; ganti alt tanpa gambar "Produk ini belum memiliki gambar." Alt tersimpan di `catalog_media_refs.alt_id` (kolom yang sudah ada; `alt_en`, `caption_*` kosong) tanpa perubahan skema.
- AC-21 (validasi file): File dipilih dengan filter jpeg/png/webp; file di luar tipe atau > 10.000.000 byte ditolak di klien SEBELUM upload dengan pesan jelas ("Format gambar harus JPEG, PNG, atau WebP." / "Ukuran gambar maksimal 10 MB."), dan ditolak server (tipe dari isi file, sisi maks 4096 px) dengan 400/413; upload gagal tidak menyimpan produk dan input terjaga.
- AC-22 (RBAC upload): Owner dan Staff aktif dapat mengunggah dan memasang gambar; tanpa sesi 401; Origin/CSRF salah ditolak 403 pada upload; akun nonaktif ditolak; Staff tetap tidak dapat menghapus produk.
- AC-23 (tampil): Setelah simpan, gambar muncul di card admin dan di card publik (menu dan beranda) dengan alt = `imageAlt` yang diisi pengguna (bukan nama produk) pada `catalog.media[].alt`; tanpa gambar tampil placeholder di admin dan tanpa elemen gambar di publik.
- AC-24 (ganti/lepas/alt): Mengganti gambar membuat snapshot baru yang hanya merujuk gambar baru; melepas gambar menghapus rujukan; mengubah alt saja membuat snapshot baru dengan alt baru tanpa mengganti aset; semuanya tidak menghapus aset dari Pustaka media; edit tanpa menyentuh gambar/alt mempertahankan rujukan lama.
- AC-25 (kegagalan): Upload gagal (jaringan, 413, 400, 429 `UPLOAD_BUSY`, 503) menampilkan pesan lokal, tidak membuat/mengubah produk; menutup modal sebelum Simpan tidak mengunggah apa pun; kegagalan simpan setelah upload sukses meninggalkan aset di Pustaka media (diterima).
- AC-26 (versi): Token `expectedVersion` mencakup id aset gambar dan alt; dua sesi mengubah gambar atau alt yang sama: satu berhasil, satu 409 `PRODUCT_CONFLICT`; menyimpan ulang isi identik adalah no-op tanpa snapshot baru.
- AC-27 (hapus produk): Hapus produk berbintang gambar menghapus rujukan di semua snapshot (purge 0014) dan membiarkan `media_assets` serta file (keputusan D).
- AC-28 (a11y modal): Input file berlabel, preview ber-alt, field alt berlabel dan terhubung ke pesan error (`aria-describedby`/`aria-invalid`), tombol "Ganti gambar" dan "Hapus gambar" berlabel dan terjangkau keyboard.
- AC-29 (tanpa skema): Fitur upload dan alt tidak mengubah file migrasi manapun, termasuk 0014; kolom `alt_id` sudah cukup. Bila implementasi ternyata butuh perubahan skema, STOP dan ajukan migrasi 0015 terpisah untuk persetujuan.
- AC-30 (header cache publik, REV.5): `GET /media/<id>` untuk aset live mengembalikan 200 dengan `Cache-Control: public, max-age=3600` (satu konstanta `PUBLIC_MEDIA_MAX_AGE = 3600`), `ETag` kuat = `"<checksum sha256>"`, TANPA `Vary: Cookie`, dengan `X-Content-Type-Options: nosniff` dan CSP sandbox tetap; `If-None-Match` cocok menghasilkan 304 tanpa body dan tanpa membaca/menghash file; aset tidak live/tidak dikenal 404 dengan `Cache-Control: no-store`. `GET /api/cms/media/<id>` (admin) tetap `private, no-store` dan `Vary: Cookie`. Permintaan Range (video) tetap 206 sah.
- AC-31 (penarikan aset): Setelah ganti/lepas gambar atau hapus produk, origin `/media/<idLama>` 404 segera (diuji). Salinan yang sudah ter-cache (browser, cache optimizer Next, CDN bila ada) paling lama bertahan 3600 detik; `images.minimumCacheTTL` di `next.config.mjs` sama dengan konstanta itu; prosedur penarikan darurat (hapus `.next/cache/images` dan purge CDN) dicatat di docs operasi. Tidak ada `immutable` (aset tidak berubah isi, tetapi ketersediaannya berubah).
- AC-32 (derivatif ukuran): Gambar card publik (menu dan beranda) tidak lagi `unoptimized`; disajikan lewat optimizer Next (`next/image`, webp, srcset responsif) dengan `sizes="(max-width: 640px) 100vw, 33vw"` (grid 1 kolom di bawah 640 px, 3 kolom di atasnya). Dengan fixture JPEG foto >= 3 MB berukuran 4000x3000, respons gambar card `Content-Type: image/webp` dan <= 150 KB pada viewport 375 px dan <= 150 KB pada viewport 1280 px (ambang asumsi; QA mengkalibrasi dengan fixture, mencatat angka terukur, dan melaporkan bila tak tercapai pada quality 75).
- AC-33 (CLS): Kontainer gambar card memakai `aspect-ratio: 4 / 3` dengan `fill` + `object-cover` (tidak bergantung dimensi asli); CLS yang disebabkan gambar = 0; CLS halaman (PerformanceObserver `layout-shift`) <= 0.1 (target 0.01) di `/id/menu` dan `/id` dengan >= 4 produk bergambar pada 3 viewport.
- AC-34 (prioritas/lazy): Di `/id/menu` hanya card pertama memakai `priority` (satu per halaman); semua lain `loading="lazy"`. Di `/id` kartu produk semuanya lazy (LCP beranda tetap hero). Tidak ada gambar produk di atas lipatan yang lazy pada `/id/menu`. Gambar punya `width`/`height` atau `fill` di kontainer ber-rasio.
- AC-35 (konfigurasi aman): `next.config.mjs` hanya menambah `images.localPatterns` untuk `/media/**` (tanpa `remotePatterns`), `formats: ["image/webp"]`, daftar `qualities` dan `deviceSizes/imageSizes` terbatas, `minimumCacheTTL: 3600`; opsi diverifikasi terhadap dokumentasi Next 16.4.x sebelum diimplementasikan; tidak ada dependency baru; id tak dikenal atau tidak live lewat optimizer menghasilkan 404, lebar di luar daftar ditolak.
- AC-36 (target kinerja): Pada `/id/menu` dengan >= 4 produk bergambar, Lighthouse mobile >= 90 adalah target (bukan janji) dan dilaporkan jika dijalankan; angka LCP/CLS/TBT dicatat dari run nyata, atau dilaporkan "tidak dijalankan" bila tooling tidak tersedia.

## 8. Rancangan HARD DELETE (Opsi A1, dipilih user)
Kendala: (a) produk ada di banyak snapshot beku; trigger melarang DELETE/UPDATE anak revisi beku dan identitas `products`; (b) FK `RESTRICT`, hash konten, FK approval->submission; (c) receipt/audit append-only; (d) `catalog_media_refs` per revisi; (e) pointer live singleton.

Langkah satu transaksi dengan kunci publikasi (`src/server/catalog/products.mjs` + `catalog_purge_product` di 0014):
1. Klon snapshot live tanpa produk itu (termasuk media refs produk lain), hash baru, receipt aktor Owner nyata, pindahkan pointer live.
2. Hapus semua snapshot katalog lain beserta turunannya, termasuk `catalog_media_refs`.
3. Hapus baris `products` produk itu.
4. Tulis satu baris `catalog_deletion_log` (aktor, waktu, slug, nama).
5. `media_assets` dan file media TIDAK disentuh.
6. Merchant mapping: belum ada; saat sync dibangun, mapping produk terhapus dibuang dan muncul di preview sync.
7. Invalidasi cache halaman publik.

Risiko (DITERIMA user): riwayat katalog hilang, pemulihan hanya dari backup mingguan same-VPS; tanpa dialog konfirmasi (salah klik tak dapat dibatalkan; mitigasi: tombol terpisah, nonaktif saat request, hanya Owner, log, hasil diumumkan); audit append-only dilemahkan; fungsi `SECURITY DEFINER` menambah permukaan serangan; migrasi destruktif hanya dengan backup dev dan persetujuan terpisah untuk produksi.

## 9. Slug otomatis
- Huruf kecil, latin tanpa aksen, non-alfanumerik jadi `-`, pola `^[a-z0-9]+(-[a-z0-9]+)*$`. Slug kosong ditolak. Bentrok `-2`, `-3`. Slug immutable. Slug produk terhapus boleh dipakai ulang (URL lama bisa menampilkan produk lain; diterima).

## 10. Featured beranda
- 4 produk terbaru (`createdAt` desc), tanpa kontrol manual; bila < 4 tampilkan yang ada.

## 11. Data multi-varian
- Dry-run read-only (`catalog-variants-report`), hanya host lokal; hasil: 1 produk, 1 varian; tidak ada keputusan manual Owner saat ini. Produk >1 varian atau modifier berbiaya kelak butuh keputusan Owner per produk sebelum tahap 2; ulangi dry-run sebelum tahap 2.

## 12. Dampak keamanan/RBAC, SEO, merchant sync
- Keamanan: tulis lewat sesi + Origin/CSRF + keanggotaan DB aktif, server-side. Hapus hanya Owner. Input divalidasi (panjang, harga integer aman, tanpa HTML mentah, `imageAlt` bersih). Gambar divalidasi dari isi file oleh pipeline media (`sharp`: jpeg/png/webp, <= 10.000.000 byte, <= 4096 px), disimpan dengan kunci acak. Rute publik hanya melayani aset yang dirujuk revisi terbit (`public_read_media`). Cache publik (AC-30) hanya untuk aset live yang memang publik; admin tetap `private, no-store`. Optimizer hanya dapat mengambil `/media/**`.
- SEO: menu/detail tanpa heading kategori; gambar publik ber-alt tertulis; title/description/canonical tetap; tanpa `Restaurant`/`LocalBusiness`; URL produk terhapus 404. Halaman publik saat ini `noindex` (metadata).
- Merchant sync: tetap OFF; simpan/hapus/unggah tidak memicu sync; gambar tidak dikirim ke merchant manapun.

## 13. Tugas per peran
Urutan kerja upload: backend dulu, lalu frontend, lalu qa (sesudah perbaikan pasca-QA temuan 1 sampai 4 dan 2/6a; lihat addendum fixes).

backend
- API/katalog: `src/app/api/cms/catalog/route.js`, `products/[slug]/route.js`; hapus route `[revisionId]` katalog dan pages.
- `src/server/cms/catalog.mjs`, `catalog-http.mjs`, `src/server/catalog/products.mjs`, `product-input.mjs`: service create/update/delete atomik (klon snapshot live, versi optimistik, audit), kategori internal + varian `standard` tersembunyi pada tahap 1.
- (Upload/alt) `product-input.mjs`: whitelist `imageAssetId` (UUID/null) dan `imageAlt` (string/null) dengan aturan AC-20/AC-20a dan kode galat `INVALID_IMAGE_ALT`, `IMAGE_REQUIRED`, `IMAGE_NOT_FOUND`, `INVALID_IMAGE`. `products.mjs`: fungsi tx-aware untuk memasang/mengganti/melepas/ubah-alt rujukan di draft hasil klon sebelum `publishDraft` (hapus rujukan produk itu; sisipkan satu rujukan `sortOrder 0`, `altId = imageAlt` hasil trim, `altEn`/caption kosong; naikkan versi draft seperti pola `src/server/media/references.mjs`); verifikasi aset ada dan `kind = 'image'` di transaksi yang sama; perluas `productVersion` dan no-op check dengan id aset dan alt; `buildCards` mengembalikan `image {assetId, alt}` (alt dari rujukan, tanpa fallback nama untuk data baru). Konfirmasi Staff boleh (sudah).
- Pipeline unggah: gunakan `POST /api/cms/media/upload` yang ada; tidak ada endpoint upload baru.
- Migrasi: tidak diperlukan; jangan ubah 0014.
- (CWV) `src/server/media/http.mjs` dan `src/app/media/[assetId]/route.js`: jalur penyajian publik terpisah dari admin: `Cache-Control: public, max-age=3600` (konstanta), ETag = checksum, 304 pada `If-None-Match`, tanpa `Vary: Cookie`; 404 `no-store` untuk aset tidak live. Pisahkan logika header menjadi fungsi murni agar bisa diuji tanpa filesystem. Opsional [PERLU PERSETUJUAN karena menyentuh pengecekan integritas di `storage.mjs`]: memoize verifikasi digest di `delivery` per (storageKey, size, mtime) agar 10 MB tidak di-hash pada setiap permintaan; jika tidak disetujui, 304 sudah menghindari hash untuk permintaan bersyarat dan optimizer menyimpan hasil. `next.config.mjs`: blok `images` sesuai AC-35 (verifikasi dokumentasi Next 16.4.x dahulu). Catat prosedur penarikan darurat untuk docs operasi.
- Hapus kode scheduling; `view-models.mjs`: urut `createdAt` desc, 4 produk terbaru.
frontend
- `src/app/admin/catalog/page.jsx` grid card; hapus route ber-id dan `publications`.
- `ProductCard` (gambar lazy, placeholder, Edit/Hapus), `ProductModal` (nama, deskripsi, harga, gambar, alt). Kontrol gambar: input file berlabel (`accept="image/jpeg,image/png,image/webp"`), validasi klien tipe dan <= 10.000.000 byte, preview via object URL (dicabut saat tutup), field "Teks alternatif gambar" wajib saat ada gambar (terpilih atau sudah ada), tombol "Ganti gambar" dan "Hapus gambar" (menghapus gambar dan mengosongkan alt), teks bantu batas, error Indonesia sesuai AC-20a/AC-21 lewat live region. Urutan Simpan: (1) bila ada file baru, unggah lewat `mediaRequest` (`src/features/cms/media/client.js`, raw body, Content-Type = MIME file) ke `/api/cms/media/upload`; (2) kirim POST/PATCH katalog dengan `imageAssetId` + `imageAlt` (atau hanya `imageAlt` bila hanya alt berubah, atau `imageAssetId: null` untuk lepas); (3) tutup modal dan segarkan grid. Tidak mengunggah saat file dipilih. Edit: tampilkan gambar saat ini lewat `/api/cms/media/<assetId>` (tetap tanpa optimizer karena butuh sesi), alt terisi dari data. Tombol Simpan nonaktif selama proses; tangani 413, 400, 409, 429, 503.
- Tombol Hapus langsung untuk Owner. `MediaAttachments` tidak dipakai di katalog.
- Publik (CWV): komponen kartu produk khusus (server component bila memungkinkan) memakai `next/image` tanpa `unoptimized` dengan `fill`, `sizes` AC-32, kontainer `aspect-ratio: 4 / 3` di `src/styles/globals.css`, `object-cover`, alt dari data, `priority` hanya card pertama di `/id/menu`, lazy lainnya; fallback bila gambar gagal dimuat. `PublishedMedia` untuk halaman lain tidak diubah. `PublishedContent.jsx`, hapus pemilih varian, `HomeContent.jsx`, `page-content.js`. Catatan: hero beranda `unoptimized` ada di luar scope ini (usulkan terpisah bila Lighthouse menuntut).
qa
- Hapus/ganti test di addendum fixes. Baru: unit `product-input` (imageAssetId/imageAlt: semua kasus AC-20 a-f, panjang, kosong, karakter terlarang, kunci terlarang); unit fungsi header publik (200/304/404, ETag, Cache-Control, tanpa Vary); integration CRUD gambar (pasang, ganti, lepas, ubah alt saja, no-op, konflik versi, rujukan di snapshot live, hapus produk membiarkan aset), RBAC/CSRF upload dan katalog (AC-22), konkurensi (AC-13, AC-26).
- Strategi test upload di Windows (keputusan, tanpa mengubah `storage.mjs` produksi untuk meluluskan test): (1) PRAKTIS dan wajib: integrasi memakai storage tiruan dalam memori yang disuntikkan ke `createCmsMedia({ storage })` (parameter `storage` sudah ada) dengan `inspectImage` asli (`sharp`, tanpa filesystem) untuk validasi isi, serta `createMediaAssets({ inspectFile })` seperti `tests/fixtures/published-data.mjs`; menutup AC-20 s.d. AC-27 pada lapisan service/API tanpa menyentuh `.media`. (2) Header publik diuji lewat fungsi murni (unit). (3) E2E nyata (unggah file sungguhan, optimizer Next, ukuran byte, CLS, Lighthouse) dijalankan di Linux/WSL/CI; di mesin Windows ini ditandai "tidak dijalankan" bila `Unsafe media directory.` muncul. Test yang tidak bisa jalan dilaporkan jujur sebagai tidak dijalankan, tidak di-skip diam-diam dan tidak ditandai lulus.
- E2E (Linux/WSL/CI): modal dengan jpeg/png/webp nyata; file salah tipe dan > 10 MB ditolak; alt wajib; ganti; lepas; ubah alt saja; muncul di card admin dan publik dengan alt benar; ukuran byte gambar card dan format webp (AC-32); CLS (AC-33); header cache (AC-30); 404 setelah penarikan (AC-31); mobile.
- Migrasi/storage hanya diuji di DB test lokal dan direktori test. Laporkan hanya test yang dijalankan.

## 14. Keterbatasan dan asumsi
- Satu bahasa Indonesia (ADR-034). Harga IDR integer, satu harga per produk. Tidak ada data produk nyata yang dibuat agen.
- Satu gambar per produk di UI dan kontrak (mekanisme media mendukung hingga 12 rujukan; data lama dengan banyak rujukan: card memakai `sortOrder` terkecil; Ganti/Lepas menghapus semua rujukan produk itu).
- Aset media immutable dan tidak dapat dihapus peran CMS; aset yatim bertambah dari upload yang tidak berujung simpan.
- Tidak ada crop/retouch di CMS. Admin menampilkan gambar asli lewat endpoint privat (tanpa optimizer karena butuh sesi); halaman admin dengan banyak gambar besar dapat berat (di luar target CWV publik).
- Alt text tidak diverifikasi kebenarannya oleh sistem (hanya wajib ada); kualitas alt menjadi tanggung jawab editor.
- Derivatif tidak disimpan permanen di basis data; cache optimizer berada di `.next/cache/images` pada VPS dan dapat hilang saat deploy.

## 15. Draf ADR-037 (untuk dimasukkan ke docs/DECISIONS.md oleh developer)
ADR-037 - Katalog card CRUD, tanpa varian/kategori, hard delete, upload gambar (2026-10-17)
- Konteks: katalog berbasis revisi, kategori, varian, modifier dinilai terlalu rumit untuk satu toko.
- Keputusan (user, 2026-10-17): satu halaman `/admin/catalog` berupa grid card dengan modal Tambah/Ubah (nama, deskripsi, harga, satu gambar opsional lewat pipeline media yang ada dengan teks alternatif wajib); URL admin/API ber-id dihapus tanpa redirect; kategori, varian, modifier dihapus dari UI/API/publik (skema dihapus tahap 2); Owner dan Staff aktif menyimpan langsung tayang; Hapus hanya Owner, hard delete permanen tanpa dialog konfirmasi; kode scheduling dihapus, tabel/data job dipertahankan sampai tahap 2; urutan terbaru di atas; slug otomatis dan dapat dipakai ulang; beranda 4 produk terbaru; media asset produk terhapus tetap di Pustaka media; perbaikan CWV gambar publik (cache publik 3600 detik + ETag, optimizer Next webp, rasio tetap) masuk scope sekarang. Catatan revisi: keputusan awal "tanpa field gambar" dibalik user pada 2026-10-17.
- Menggantikan/mengamandemen: ADR-008, ADR-014 s.d. ADR-019, aturan "validate final modifier costs" di AGENTS.md, "Owner approves ... publishes" untuk katalog, "Catalog review/Owner approval retained" dan larangan hapus kode scheduling di ADR-036 (data job tetap), asumsi snapshot katalog immutable berumur panjang.
- Hard delete (Opsi A1): snapshot live baru tanpa produk, semua snapshot lama dan receipt dihapus, `catalog_deletion_log` append-only sebagai satu-satunya jejak; migrasi 0014. Pemulihan hanya dari backup VPS. Risiko diterima: tidak ada riwayat/rollback katalog, salah klik tidak dapat dibatalkan karena tanpa dialog, audit append-only dilemahkan, kehilangan total VPS.
- Upload gambar: dua langkah (unggah lewat `/api/cms/media/upload`, lalu `imageAssetId` + `imageAlt` pada katalog), alt disimpan di `catalog_media_refs.alt_id`, tanpa perubahan skema; aset yatim diterima.
- Cache publik gambar: jendela penarikan maksimum 3600 detik pada cache browser/optimizer/CDN; origin 404 segera; prosedur penarikan darurat tercatat.
- Tidak berubah: tanpa checkout/stok, tanpa sync merchant saat simpan/hapus/unggah (default OFF), RBAC server-side, SEO tanpa Restaurant/LocalBusiness, GA4 hanya niat order.
- Alternatif ditolak: soft delete/arsip, A2, dialog konfirmasi, alt diturunkan dari nama, unggah otomatis saat file dipilih, `immutable` cache, derivatif permanen di basis data (butuh skema/penyimpanan baru).
- Rollback: kembalikan app/UI/docs/`next.config.mjs` bersama; produk yang sudah dihapus tidak dapat dipulihkan kecuali dari backup; migrasi purge tidak otomatis reversibel; aset media tidak terpengaruh.
- Verifikasi: dicatat di SECURITY_AND_QA.md setelah tes dijalankan.

Dokumen yang perlu diperbarui (oleh developer, bukan pm): `docs/DECISIONS.md` (ADR-037; tandai ADR-008/014-019/036), `docs/REQUIREMENTS.md` (CMS dan Catalog), `AGENTS.md` (modifier cost; Owner approves untuk katalog), `docs/DATA_CONTRACTS.md` (kontrak katalog tanpa kategori/varian/modifier, `imageAssetId`/`imageAlt`, purge dan deletion log, header cache media publik), `docs/ROADMAP.md` (Phase 2; sitemap Phase 3), `docs/SECURITY_AND_QA.md`, operasi (prosedur penarikan media, cache optimizer), `docs/PHASE2_PLAN.md`/`PHASE3_PLAN.md`/README bila memuat varian/kategori/scheduling, dan skill `.agents/skills/*` terkait.

## 16. Upload gambar, alt wajib, dan CWV (REV.5, MENUNGGU PERSETUJUAN USER)
### 16.1 Pipeline yang sudah ada (hasil investigasi)
- Upload: `POST /api/cms/media/upload` (raw body, `Content-Type` = MIME) memeriksa sesi, Origin dan `sec-fetch-site`, maks 2 unggahan bersamaan (429), `content-length` <= 100 MB; `src/server/cms/media.mjs` (Owner dan Staff aktif; `storage` dapat disuntikkan) menyimpan ke `.media/<target>`; `inspectImage` (`sharp`) menolak selain jpeg/png/webp, animasi, > 10.000.000 byte, > 4096 px.
- Tautan: `catalog_media_refs` (per revisi, per produk, `asset_id`, `alt_id` <= 500, `sort_order`), hanya draft yang dapat ditulis. `cloneCatalogDraft` menyalin rujukan; purge 0014 menghapusnya.
- Baca: admin `/api/cms/media/<id>` (sesi, `private, no-store`); publik `/media/<id>` (hanya aset live via `public_read_media`). Saat ini `fileResponse` memakai `private, no-store` + `Vary: Cookie` untuk keduanya, dan `delivery` meng-hash seluruh file setiap permintaan; `PublishedMedia` memakai `next/image unoptimized` sehingga file asli (sampai 10 MB/4096 px) dikirim apa adanya.
- Skema: tidak ada perubahan; 0014 tidak disentuh.

### 16.2 Rancangan upload dan alt
1. Dua langkah: unggah dulu, lalu kirim `imageAssetId` + `imageAlt`. Unggah terjadi saat Simpan agar Batal tidak menghasilkan aset yatim.
2. Alt wajib dari field modal; aturan kontrak AC-20/AC-20a. Mengubah alt saja tanpa mengganti file didukung (kasus d). Data lama berrujukan dengan alt kosong: bila produk punya gambar dan form dikirim tanpa alt, ditolak sampai diisi.
3. Satu gambar per produk; Ganti = ganti semua rujukan produk; Lepas = hapus rujukan; aset tetap.
4. Versi: `productVersion` memuat id aset dan alt; token berubah untuk semua card, klien memuat ulang daftar.
5. Gagal/batal: AC-25. Hapus produk: AC-27.

### 16.3 Rancangan CWV gambar publik (keputusan teknis yang diusulkan)
- Header cache `/media/<id>`: `public, max-age=3600` + ETag checksum + 304. Alasan: konten byte per UUID tidak berubah (metadata immutable, checksum) sehingga ETag aman; `immutable`/umur panjang ditolak karena ketersediaan aset berubah saat produk diganti/dihapus. Jendela penarikan <= 3600 detik, origin 404 segera, `Vary: Cookie` dibuang untuk rute publik agar cache bersama dapat bekerja (rute publik tidak bergantung cookie).
- Derivatif: Next image optimizer (zero dependency baru; memakai `sharp` 0.35.5 yang sudah ada) dengan `images.localPatterns` hanya `/media/**`, `formats: ["image/webp"]` (AVIF ditolak: CPU/RAM VPS kecil), `qualities` dan ukuran terbatas, `minimumCacheTTL` 3600. Alternatif ditolak: derivatif saat upload (butuh kolom/penyimpanan baru dan perubahan kunci penyimpanan, berarti migrasi 0015 dan perubahan `storage.mjs`); rute `sharp` kustom (kode baru yang harus dirawat, cache sendiri).
- Rasio dan CLS: kontainer 4:3 dengan `fill` dan `object-cover` (potong tampilan, bukan data); `sizes` mengikuti grid CSS (1 kolom <= 640 px, 3 kolom di atasnya).
- Prioritas: `priority` hanya card pertama `/id/menu`; semua lain lazy; beranda tetap hero sebagai LCP.
- Risiko: CPU/RAM optimizer pada VPS kecil saat banyak gambar baru (dibatasi oleh daftar ukuran dan cache); cache optimizer hilang saat deploy (regenerasi); cache bersama dapat menyajikan gambar yang sudah ditarik sampai 1 jam; hero beranda dan gambar admin tetap besar (di luar scope).

### 16.4 Risiko baru
- CWV: sampai perbaikan 16.3 selesai, gambar publik tidak di-cache dan tidak dikecilkan; setelahnya muncul risiko jendela penarikan 1 jam.
- Aset yatim menumpuk (disk); tidak ada pembersihan.
- Batas 2 unggahan bersamaan (`UPLOAD_BUSY`) dapat menolak Owner/Staff bersamaan.
- Windows: `Unsafe media directory.` (`storage.mjs` baris 80) menghalangi verifikasi upload fisik di mesin ini; strategi di bagian 13 (storage tiruan + Linux/WSL/CI).
- Upload sukses tetapi simpan gagal meninggalkan file tanpa rujukan (diterima).
- Next 16.4.x: opsi `images` harus dicek ke dokumentasi sebelum implementasi (AGENTS.md: pin versi setelah cek docs).

## 17. Urutan eksekusi
Lihat addendum fixes. Ringkas: pasca-QA temuan 1 sampai 4, lalu temuan 2 dan 6a, lalu upload (backend, frontend, qa), lalu tes AC-11/AC-13, `security:check`, dokumen, verifikasi penuh.

## 18. Pertanyaan terbuka
- Q-M: Persetujuan eksplisit atas bagian 16 (upload, alt wajib, CWV) dan konfigurasi `images` Next.
- Q-N: Jendela penarikan cache publik 3600 detik diterima, atau lebih pendek (mis. 600) dengan konsekuensi trafik lebih tinggi?
- Q-O: Ambang ukuran gambar card (<= 150 KB) dan CLS (<= 0.1) diterima sebagai target QA?
- Q-P: Memoize verifikasi digest di `storage.mjs` (perubahan kode produksi pada pengecekan integritas) disetujui atau tidak dilakukan?
- Q-Q: Hero beranda (`unoptimized`, JPEG 1600x1200) dimasukkan ke perbaikan CWV atau tetap di luar scope?
- Q3 (ambang `npm audit`) masih belum dijawab tegas; dipakai high/critical sebagai usulan.
