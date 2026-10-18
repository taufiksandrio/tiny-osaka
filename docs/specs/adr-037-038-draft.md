# Draf ADR-037 dan ADR-038 + daftar pembaruan dokumen

Status: Diterapkan ke dokumen 2026-10-18 (disetujui user; teks final di docs/DECISIONS.md ADR-037/038, dengan perbaikan: asumsi snapshot ganda belum diuji, pelonggaran AC-30, catatan B-2 allowlist kosong). Teks di bawah adalah draf asli. Semula: MENUNGGU PERSETUJUAN USER. Berkas ini hanya draf. Tidak ada dokumen keputusan yang diubah. Teks ADR di bawah siap disalin ke `docs/DECISIONS.md` (setelah ADR-036, baris ~1360) oleh agen/user lain setelah draf disetujui.
Sumber: `docs/specs/catalog-card-crud.md` (rev.6), `docs/specs/catalog-card-crud-fixes.md`, `docs/specs/nav-no-language-switch.md`, keputusan user 2026-10-17/18.
Format mengikuti ADR-034/ADR-036 (judul `## ADR-nnn - ... (tanggal)`, paragraf berurutan: persetujuan, keputusan, modul terdampak, verifikasi, rollback).

---

## 1. Teks ADR-037

## ADR-037 - Katalog kartu sederhana, hapus permanen, gambar, dan link order (2026-10-18)

Status: Diterima user 2026-10-17/18. Branch feat/catalog-card-crud. Keputusan ini
menggantikan model katalog berbasis revisi/kategori/varian/modifier dan
mengamandemen ADR-014 sampai ADR-019 dan ADR-036 (bagian katalog dan scheduling).
Dokumen/AGENTS.md yang bertentangan diperbarui menurut daftar di bagian 3 draf ini.
Tidak ada dependency baru (Next, sharp, shadcn yang terpasang dipakai ulang).

Keputusan produk. (1) Katalog adalah satu halaman /admin/catalog berupa grid card
(gambar atau placeholder, nama, deskripsi, harga IDR, tombol Edit dan Hapus).
Tambah/Ubah lewat modal; tidak ada id/revisi di URL admin dan semua route ber-id
dihapus tanpa redirect (404). Waktu ubah ditampilkan dalam WIB. (2) Kategori dan
varian/modifier dihapus dari admin, API, dan situs publik; skema/tabelnya baru
dihapus di tahap 2. Setiap produk memiliki satu harga integer IDR. (3) Owner dan
Staff aktif boleh Tambah/Ubah dan perubahan langsung tayang; Hapus hanya Owner,
ditegakkan server-side (sesi, Origin/CSRF, keanggotaan DB aktif). (4) Urutan
"terbaru di atas" memakai sort_order (penghitung pembuatan monoton, lebih besar =
lebih baru, slug sebagai pemecah seri), bukan createdAt; berlaku di admin, publik,
dan beranda (4 produk terbaru, tanpa kontrol manual). Slug otomatis dari nama,
immutable, bentrok diberi -2, -3.

Hapus permanen. Hapus adalah hard delete langsung tanpa dialog konfirmasi
(permintaan user, risiko diterima). Dalam satu transaksi dengan kunci publikasi:
klon snapshot live tanpa produk itu (hash baru, receipt aktor Owner nyata, pointer
live dipindah), hapus snapshot katalog lain beserta turunannya dan baris
catalog_media_refs, hapus baris products, tulis satu baris catalog_deletion_log
(aktor, waktu, slug, nama), lalu invalidasi cache publik. Fungsi
catalog_purge_product (migrasi 0014) berstatus SECURITY DEFINER dan hanya dapat
dieksekusi peran CMS. Karena FK RESTRICT dari publication_jobs ke snapshot, satu
produk dapat tetap dirujuk oleh job lama sehingga snapshot lama tertentu tidak
dapat dihapus; akibatnya setelah hapus bisa tersisa lebih dari satu snapshot
(snapshot live baru ditambah snapshot yang dipegang job lama). Ini diterima dan
dicatat sebagai tindak lanjut tahap 2. Aset media (media_assets dan berkas) tidak
disentuh dan tetap di Pustaka media. Slug produk terhapus dapat langsung dipakai
ulang (URL lama dapat menampilkan produk lain; diterima). Merchant mapping belum
ada; saat sync dibangun, mapping produk terhapus dibuang dan muncul di preview.

Scheduling. Seluruh kode scheduling dihapus (route, UI, worker, helper). Tabel
publication_jobs dan data/event lama dipertahankan sampai tahap 2. Ini mengamandemen
ADR-036 yang mempertahankan kode historis dan "Catalog review/Owner approval
retained", serta ADR-035 untuk katalog.

Gambar. Upload gambar opsional pada modal lewat pipeline media yang ada
(/api/cms/media/upload, dua langkah: unggah saat Simpan, lalu imageAssetId +
imageAlt). Teks alternatif WAJIB bila ada gambar. Satu gambar per produk; Ganti
mengganti semua rujukan produk, Lepas menghapus rujukan (aset tetap). Modal TANPA
pratinjau gambar (keputusan user); gambar terlihat di card. Validasi isi file di
server (jpeg/png/webp, <= 10.000.000 byte, <= 4096 px), tanpa crop/retouch di CMS.
Alt disimpan di catalog_media_refs.alt_id (tanpa perubahan skema). Cache publik
aset live 1 jam (Cache-Control public, max-age=3600, ETag = checksum, tanpa
immutable, tanpa Vary: Cookie); origin /media/<idLama> 404 segera setelah ditarik;
salinan di cache browser/optimizer/CDN dapat bertahan hingga 3600 detik
(images.minimumCacheTTL disamakan). Admin tetap private, no-store. Perbaikan CWV
gambar publik (optimizer Next, rasio tetap, prioritas card pertama) masuk scope.

Link order opsional. Modal memuat tiga input opsional: GrabFood, GoFood,
ShopeeFood (tidak required; satu link per platform per produk), disimpan lewat
migrasi 0015 (tiga kolom nullable pada product_entries; hash snapshot lama harus
identik; klon wajib menyalin kolom). Link HANYA disimpan: tidak tampil di situs
publik dan tidak tampil di card admin; tidak ada event GA4 baru dan tidak ada
panggilan jaringan ke platform. Validasi server-side: https saja, panjang
terbatas, host dicocokkan persis dengan allowlist. Allowlist host DIBIARKAN KOSONG
dan harus diisi dari host resmi yang dikonfirmasi user sebelum link boleh
ditampilkan di publik (agen tidak boleh mengarang host). Tampilan publik
(termasuk label "Pesan via ...", rel noopener noreferrer nofollow, GA4
click_order dan nilai platform shopeefood) memerlukan spec lanjutan dan pembaruan
REQUIREMENTS/DATA_CONTRACTS. Ini input manual, bukan integrasi merchant; login
aplikasi merchant tidak berarti hak API.

Migrasi. 0014 (purge: catalog_deletion_log, catalog_purge_product, grant, constraint
aksi audit termasuk delete) dan 0015 (kolom link order) hanya dijalankan di DB
lokal test; DB dev tertunda sampai user menyetujui pra-cek (dump, tinjau SQL).
Tidak ada DB produksi/VPS; tidak ada migrasi produksi tanpa persetujuan terpisah.
Migrasi 0015 tidak mengubah 0014.

Konflik dengan keputusan lama dan konsekuensi (semua disetujui user):
- ADR-014 sampai ADR-019 (migrasi harga, draft, klon atomik, terjemahan, varian,
  modifier): fitur varian/modifier/terjemahan katalog dihentikan. Ditandai
  "superseded by ADR-037" untuk perilaku; kode dan tabel tetap ada sampai tahap 2.
- ADR-036: bagian "Catalog review/Owner approval is otherwise retained" dan
  penyimpanan kode scheduling diamandemen (lihat Scheduling).
- ADR-034/035 untuk katalog: form name/category/price, varian otomatis, Setujui
  Owner, dan scheduling tidak berlaku lagi.
- AGENTS.md "validate final modifier costs": tidak berlaku selama modifier tidak
  ada; kesetaraan harga merchant menjadi harga tunggal produk (tanggung jawab
  Owner). Perubahan AGENTS.md dilakukan HANYA oleh user.
- AGENTS.md "Staff may draft/submit; Owner approves revisions and publishes":
  dilonggarkan untuk halaman (ADR-036) dan katalog; Staff menyimpan langsung
  tayang, hanya Hapus katalog yang eksklusif Owner.
- Audit append-only dan snapshot beku immutable: DILEMAHKAN. Hard delete menghapus
  snapshot/receipt lama; satu-satunya jejak adalah catalog_deletion_log
  (append-only, peran CMS SELECT saja). Trigger beku/immutabilitas dihormati
  lewat fungsi SECURITY DEFINER yang menambah permukaan serangan.
- DATA_CONTRACTS/REQUIREMENTS: model varian/modifier/kategori dan revisi katalog
  harus ditandai usang (bagian 3).

Tidak berubah: tanpa checkout/pembayaran/stok; tidak ada sync merchant otomatis
(menyimpan, menghapus, mengunggah, mengubah link tidak pernah sync; default OFF);
RBAC server-side; GA4 hanya niat order keluar tanpa PII; SEO tanpa
Restaurant/LocalBusiness; tidak ada alamat/harga/URL menu fiktif.

Risiko diterima: (a) tidak ada rollback produk yang sudah dihapus kecuali backup
mingguan VPS yang sama (kehilangan total VPS = kehilangan backup); (b) salah klik
Hapus tidak dapat dibatalkan karena tanpa dialog (mitigasi: tombol terpisah,
nonaktif saat request, hanya Owner, log, hasil diumumkan); (c) audit append-only
melemah; (d) slug yang dipakai ulang dapat membuat URL lama menampilkan produk
lain; (e) aset yatim dari upload yang tidak disimpan; (f) cache gambar yang ditarik
bertahan hingga 1 jam; (g) Staff dapat mengubah link order yang langsung tayang
bila kelak ditampilkan (mitigasi: allowlist, audit aktor); (h) satu produk dapat
meninggalkan beberapa snapshot karena FK RESTRICT job lama.

Verifikasi dicatat di SECURITY_AND_QA.md setelah tes dijalankan; test upload yang
terhalang Windows dijalankan dengan storage tiruan atau di Linux/WSL/CI dan yang
tidak dijalankan dilaporkan jujur. Verified commit/push/PR mengikuti alur berlaku;
merge dan deploy terpisah.

Rollback. Kembalikan app/UI/docs/next.config.mjs bersama. Produk yang sudah
dihapus TIDAK dapat dipulihkan kecuali dari backup; migrasi 0014 tidak otomatis
reversibel. Rollback 0015: DROP kolom link (kehilangan link tersimpan; backup dulu;
hanya DB lokal/dev). Aset media dan data job/event tidak terpengaruh. Jaga app dan
data pada versi yang sama; tanpa deploy/tindakan cloud.

---

## 2. Teks ADR-038

## ADR-038 - Situs satu bahasa (Indonesia), URL tanpa prefix bahasa (2026-10-18)

Status: Diterima user 2026-10-18 (kutipan: "tombol pilihan dihapus dan satu bahasa
jadi default, alamat eng dihapus selamanya"; "gausah ada langg, hanya url/menu").
Melanjutkan ADR-034 (situs Indonesia saja) dan mengamandemen ADR-002 (path locale),
ADR-034 (URL /id tetap stabil; /en redirect), serta keputusan bilingual awal.

Keputusan. (1) Tidak ada tombol/pemilih bahasa di navigasi publik maupun admin.
(2) Rute publik tanpa segmen bahasa: /, /menu, /menu/<slug>, /about, /guides,
/guides/<slug>, /promos, /location. Rute dipindah dari src/app/[locale] ke route
group (mis. src/app/(site)) dengan <html lang="id">. (3) /en dan /en/* menjadi 404
permanen, tanpa redirect, tanpa konten/terjemahan Inggris publik (membalik
redirect permanen /en ke /id pada ADR-034). (4) /id dan /id/* diarahkan 308 ke
padanan tanpa prefix (menjaga bookmark/link bersama). (5) Tanpa hreflang dan tanpa
alternates; canonical menunggu domain final dan SEO Phase 3 (halaman tetap
noindex sekarang). Tautan rich-text berawalan /id atau /en pada snapshot lama
dirender sebagai padanan tanpa prefix; snapshot/hash immutable tidak diubah.
(6) Tabel/data terjemahan Inggris di DB dibiarkan (kolom locale, check
locale IN ('id','en'), baris en); penanganan dijadwalkan di tahap 2. Pembaca
publik tidak lagi memakai parameter locale dari URL; locale tetap 'id' di
lapisan data sampai tahap 2.

Pelonggaran AGENTS.md: baris "SEO ID/EN with verified public content" diubah
oleh USER menjadi "SEO Indonesia dengan konten publik terverifikasi"; misi
"bilingual" dan REQUIREMENTS yang menyebut ID/EN disesuaikan.

Dampak SEO. Halaman tetap robots noindex, jadi URL /id kemungkinan belum
terindeks; 308 menjaga link lama. Tidak ada sitemap/canonical sampai Phase 3.
Tidak ada Restaurant/LocalBusiness schema. Tidak ada klaim publik baru.

Modul terdampak (rencana, bukan sekarang): src/app/[locale] (dipindah), next.config.mjs
(redirect /id 308, hapus redirect /en dan / ke /id; /en dibiarkan 404), SiteHeader,
SiteFooter, HomeContent, PageIntro, MenuCard, PublishedContent, PublicRichText,
AdminHeader/AdminNav/AdminShell (tautan /id), src/server/public/data.mjs,
src/server/pages/templates.mjs (isPageLocale/isInternalPageLink),
playwright.config.mjs (url /id), tests e2e/integration/unit, scripts/run-published-qa.mjs.

Rollback. Kembalikan route [locale] dan next.config.mjs bersama; data tidak
diubah sehingga tidak ada pemulihan data. Link yang sudah dibagikan tanpa prefix
akan 404 setelah rollback bila tidak ada redirect balik.

---

## 3. Daftar pembaruan dokumen (lokasi nyata hasil Grep)

Prinsip: berkas dikerjakan setelah draf disetujui oleh agen/user lain. Agen ini tidak mengubah apa pun.

### AGENTS.md (HANYA user yang mengubah)
- Baris 4 "bilingual Japanese street-food website" -> "Indonesian-language Japanese street-food website".
- Baris 28 "Staff may draft/submit; Owner approves revisions and publishes/schedules/archives." -> usul: "Staff dan Owner dapat menyimpan halaman dan katalog langsung tayang (ADR-036/037); hanya Owner yang menghapus produk katalog dan mengelola akun/sync merchant. Scheduling dihapus."
- Baris 30 "validate final modifier costs and detect external differences" -> "validate the single product price and detect external differences" (modifier tidak ada).
- Baris 33 "SEO ID/EN with verified public content" -> "SEO Indonesia dengan konten publik terverifikasi; Restaurant/LocalBusiness tetap di luar scope."
- Tambah di Invariants satu baris: "Hapus produk katalog bersifat permanen oleh Owner (ADR-037); audit append-only hanya berlaku untuk catalog_deletion_log."
- Baris "Session..."/sync/GA4 tidak berubah.

### docs/REQUIREMENTS.md
- Judul baris 1: naikkan versi (mis. v1.6 katalog kartu + satu bahasa).
- Bagian CMS baris 7 ("Staff drafts and submits... only Owner approves... schedules"): ganti dengan "Owner dan Staff aktif menyimpan halaman dan katalog langsung tayang; Hapus produk hanya Owner; scheduling dihapus." Baris 9 (Catalog "name/category/price... advanced variants/modifiers"), baris 11 (ADR-035 Setujui/jadwal), baris 13 ("Catalog review/Owner permissions remain") ditandai usang dan diganti ringkasan ADR-037.
- Bagian Catalog baris 16: ganti dengan usulan: "CMS master katalog: produk berupa kartu (nama, deskripsi, satu harga IDR, satu gambar opsional dengan alt wajib, tiga link order opsional GrabFood/GoFood/ShopeeFood yang hanya disimpan). Tanpa kategori, varian, modifier, stok. Kesetaraan harga GoFood/GrabFood tetap aturan bisnis Owner. Verified deep links tampil di publik hanya setelah host resmi diverifikasi. Hapus permanen oleh Owner."
- Baris 22 SEO: "Indonesian public content" sudah benar; tambah "canonical/sitemap menunggu Phase 3; tanpa hreflang; URL tanpa prefix bahasa (ADR-038)".
- Baris 34 daftar input belum diterima: pertahankan "Official GrabFood URL/product links" dan tambah "host resmi GoFood/GrabFood/ShopeeFood untuk allowlist".
- Baris 6 "Owner/Admin and Staff/Editor": tidak berubah.

### docs/DECISIONS.md (tambah ADR-037/038; tandai ADR lama)
- Baris 507 ADR-014, 540 ADR-015, 581 ADR-016, 617/618 ADR-017, 656 ADR-018, 693 ADR-019: tambah baris status di bawah judul: "Status: Superseded sebagian oleh ADR-037 (2026-10-18): varian/modifier/kategori/terjemahan katalog tidak lagi dipakai; kode dan tabel tetap sampai tahap 2."
- Baris 1176 ADR-034: tambah "Diamandemen ADR-037 (katalog) dan ADR-038 (URL: /en kini 404; /id 308 ke tanpa prefix)."
- Baris 1213 ADR-035: tambah "Tidak berlaku untuk katalog sejak ADR-037; scheduling dihapus."
- Baris 1306 ADR-036: tambah "Amended by ADR-037: katalog tanpa review/approval, scheduling dihapus dari kode."
- Baris 58 ADR-002 (locale paths): tambah "Superseded oleh ADR-038."
- ADR-008 (baris 272) dan referensi sekitar baris 924/1186 yang disebut di spec: periksa konsistensi RBAC (hapus katalog Owner-only) saat menandai.
- Tempelkan teks bagian 1 dan 2 sebagai ADR-037 dan ADR-038 setelah baris ~1360.

### docs/DATA_CONTRACTS.md (88 kemunculan variant/modifier/categor/ShopeeFood/click_order)
- Baris 5 (Indonesian-only, `/id` stabil, `/en` redirect ke `/id`): ganti dengan "URL tanpa prefix; /en 404; /id 308 (ADR-038)".
- Baris 7, 11, 14, 91 (Approval ADR-035, jadwal, `Schedules use Asia/Jakarta`): tandai usang untuk katalog.
- Baris 33 `click_order` (platform `gofood`/`grabfood`, parameter `locale`): usul: hapus parameter `locale` (situs satu bahasa); tambah `shopeefood` HANYA bila tampil publik diputuskan; tetap "niat order, bukan pesanan selesai".
- Baris 43-92 (Phase 2A catalog/content, "Price and modifier validation" baris 60): tandai "usang sejak ADR-037; kontrak hidup: product {slug, nama, deskripsi, harga IDR, gambar{assetId,alt}, grabfoodUrl, gofoodUrl, shopeefoodUrl}".
- Bagian 94 (2B1), 143 (2C1 pricing/variants/modifiers), 229 (2D2 clone), 256 (2D3 translations), 285 (2D4 variants), 317 (2D5 modifiers): ditandai "Historis/usang; tabel dihapus di tahap 2".
- Tambah bagian baru: `catalog_deletion_log`, `catalog_purge_product`, kolom link order di `product_entries`, kontrak API katalog (POST/PATCH/DELETE `/api/cms/catalog`, tanpa id revisi), galat `INVALID_ORDER_URL`, `INVALID_IMAGE_ALT`, `PRODUCT_CONFLICT`.
- Baris 52 (CatalogRevision "submitted/approved snapshots immutable"), 57 (Media reference immutable, "no deletion of assets referenced by live content"): tambah catatan bahwa purge menghapus snapshot lama tetapi tidak aset media.
- Baris 81 ("Staff may draft/submit; only Owner may approve/reject/publish/schedule/archive"): selaraskan dengan ADR-036/037.

### docs/ROADMAP.md
- Baris 13-15 (Phase 2): ganti "localized fields... category/product pages" dengan "kartu produk, satu harga, gambar+alt, tanpa kategori/varian/modifier"; acceptance "validated modifier constraints and price" -> "harga tunggal tervalidasi; data publik hanya yang tayang; tanpa stok numerik".
- Baris 17-18 (Phase 3: "revision approvals, schedule/archive"): hapus scheduling; revisi approval hanya relevan bila dikembalikan.
- Baris 22-23 (Content ID/EN; "proper canonical/hreflang"): -> "konten Indonesia; canonical dan sitemap hanya halaman tayang; tanpa hreflang".
- Tambah item tahap 2 (bagian 4 di bawah).

### README.md (hanya bagian yang menyebut bilingual/[locale]; README besar)
- Baris 8, 18: "bilingual" -> "satu bahasa Indonesia".
- Baris 223-238 (Phase 1A beranda bilingual, root layout `[locale]`, "Link pemilih bahasa memiliki hreflang"), 272-273, 296-300, 312, 336-344 (tujuh route `[locale]/...`), 385 (24 halaman ID/EN), 496 (pohon `[locale]/`), 530: tambah catatan "Historis; sejak ADR-038 rute di `src/app/(site)` tanpa prefix". Jangan menghapus riwayat.
- Tambah bagian ringkas ADR-037/038 (modul, migrasi 0014/0015 lokal saja, rollback).

### CLAUDE.md
- Baris 7 "Publik: `src/app/[locale]`, `src/features/public-site`" -> "Publik: `src/app/(site)` (tanpa segmen bahasa; sebelum pemindahan: `src/app/[locale]`), `src/features/public-site`". Ubah hanya setelah rute benar-benar dipindah.

### Dokumen lain untuk diperiksa (di luar daftar, hanya disebut)
CONTENT_AND_UX.md (CTA GoFood/GrabFood, tanpa pemilih bahasa), PHASE2_PLAN.md baris ~90, SECURITY_AND_QA.md (hasil verifikasi), docs operasi (prosedur penarikan gambar darurat).

---

## 4. Tindak lanjut tahap 2 (butuh persetujuan terpisah)

1. Hapus tabel/kolom kategori, varian, modifier (dan terjemahan katalog terkait); ulangi dry-run `catalog-variants-report` (saat ini 1 produk, 1 varian) sebelum menghapus; produk >1 varian atau modifier berbiaya butuh keputusan Owner per produk. `product_entries.category_id` NOT NULL dan varian `standard` tersembunyi disingkirkan.
2. Nasib `publication_jobs` dan event: arsipkan/hapus data; lepaskan FK RESTRICT yang menahan snapshot lama; bersihkan snapshot yang tersisa (lebih dari satu) setelah hapus produk.
3. Kolom `locale` NOT NULL, check `locale IN ('id','en')`, baris `en`, dan penulis server legacy (writer terjemahan/varian/modifier, `public_read_*` bersyarat locale): hapus atau jadikan konstanta `id`.
4. Daftar host resmi link order (GrabFood, GoFood, ShopeeFood): user menyediakan contoh link "bagikan" nyata; allowlist persis tanpa wildcard; konfirmasi status layanan ShopeeFood.
5. Tampilkan link order di publik (Q-R): lokasi (detail/kartu), label, `rel`, GA4 `click_order` + nilai `shopeefood`, pembaruan REQUIREMENTS/DATA_CONTRACTS, perubahan `public_read_catalog`.
6. Canonical, sitemap, robots, OG, dan pencabutan `noindex` di Phase 3 setelah domain final.
7. Prosedur penarikan darurat gambar (AC-31): hapus `.next/cache/images` + purge CDN, dicatat di docs operasi; uji E2E 404 setelah penarikan.
8. Pengukuran CWV nyata (LCP/CLS/INP, Lighthouse mobile >= 90 sebagai target) di Linux/WSL/CI atau staging; hero beranda `unoptimized` ditinjau terpisah.
9. Migrasi 0014/0015 ke DB dev (pra-cek dump, tinjau SQL), lalu staging; produksi hanya dengan persetujuan terpisah.
10. Pertimbangkan pemulihan: backup dengan frekuensi lebih tinggi/off-VPS (risiko hard delete), dan perluasan `catalog_deletion_log` bila perlu.

## 5. Pertanyaan terbuka untuk user

1. Setuju teks "diterima 2026-10-17/18" dan tanggal judul ADR (2026-10-18)?
2. ADR-038 butir (4): `/id/*` 308 ke padanan sudah benar menurut Anda? (Spec nav-no-language-switch awalnya menulis "/en 404, /id dihapus"; draf ini mengikuti instruksi 308.)
3. Parameter `locale` pada event `click_order` dihapus dari kontrak?
4. Boleh AGENTS.md diubah sesuai bagian 3 (hanya Anda yang mengubah)?
5. Klaim "satu snapshot bisa lebih dari satu karena job lama (FK RESTRICT)" saya tulis dari instruksi; mohon konfirmasi bahwa pengamatan ini sudah diverifikasi QA.
6. Nilai cache: spec lama mencatat 3600 detik; draf memakai 1 jam (setara).
