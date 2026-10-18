# Spec: Pop up pilihan order (GoFood / GrabFood / ShopeeFood) pada card menu publik

Status: DRAF, menunggu persetujuan user. Belum ada kode yang diubah.
Tanggal: 2026-10-18. Branch kerja yang disarankan: `feat/menu-card-order-popup` (dari main, bukan dari `feat/catalog-csv-import`).

## 0. Keputusan user (2026-10-18) dan status implementasi

Keputusan: (1) dialog hanya berisi logo/tombol tiap platform; (2) produk tanpa link tetap bisa diklik tetapi tanpa pop up; (3) produk dengan satu link tetap membuka dialog; (4) `rel="noopener noreferrer nofollow"` diterima; (5) migrasi 0017 (ganti `public_read_catalog()` agar mengirim link order) disetujui; (6) copy dialog sesuai usulan spec. `OFFICIAL_ORDER_HOSTS` TETAP KOSONG (daftar host belum disetujui); sebelum diisi, jalur publik fail-closed (tidak ada link tampil). GA4 tetap ditunda. Logo: belum ada aset yang disetujui (lihat 9.2).

Backend (selesai, DB test saja): migrasi `drizzle/0017_public_read_order_links.sql` + snapshot/journal; `publicOrderLinks`/`withPublicOrderLinks` di `src/server/catalog/order-links.mjs`; `readPublicCatalog` (`src/server/public/data.mjs`) dan `getPublishedCatalog` mengirim `orderLinks: [{ platform, href }]` dan membuang field URL mentah. 0017 BELUM diterapkan ke dev (menunggu konfirmasi terpisah) dan tidak ke produksi.

## 1. Masalah & tujuan

Link order per produk (`grabfoodUrl`, `gofoodUrl`, `shopeefoodUrl`, migrasi 0015) saat ini hanya tersimpan di CMS. Link itu sengaja disembunyikan dari publik (ADR-037, "Link order opsional"; `src/server/catalog/published.mjs` baris 26-31 membuang ketiga field; fungsi SQL `public.public_read_catalog()` tidak memuatnya). Pengunjung belum punya jalan memesan ke platform.

Tujuan: klik card produk di situs publik membuka dialog berisi tombol platform yang punya link. Klik tombol membuka link produk itu di platform terkait (tab baru). Platform tanpa link tidak ditampilkan.

ADR-037 secara tegas menyatakan tampilan publik link order (label, rel, GA4 `click_order`, nilai `shopeefood`) "memerlukan spec lanjutan dan pembaruan REQUIREMENTS/DATA_CONTRACTS". Spec ini adalah spec lanjutan itu. Ini bukan konflik dengan ADR/invarian, tetapi ada prasyarat keputusan user (bagian 9).

## 2. Kondisi saat ini (hasil inspeksi read-only)

- Card publik: `CatalogCards` di `src/features/public-site/components/PublishedContent.jsx` (baris ~34-45): `<article class="prose-panel">` dengan judul berupa `Link` ke `/menu/{slug}`, deskripsi, harga, gambar (`ProductCardImage`). Dipakai di beranda (4 produk terbaru, `HomeContent.jsx`) dan halaman menu.
- Halaman detail `/menu/[slug]` (`PublishedProduct`) ada, `robots: noindex, nofollow` pada metadata.
- `MenuCard.jsx` dan `OrderingNotice.jsx` adalah komponen contoh/placeholder (teks "unavailable"); belum dipastikan masih dipakai.
- Data publik dibaca via `src/server/public/data.mjs` -> `SELECT public.public_read_catalog()` (migrasi 0006, terakhir didefinisikan ulang di 0016). Fungsi ini tidak mengeluarkan kolom link order. Jadi menampilkan link publik membutuhkan migrasi baru yang mengganti fungsi tersebut.
- `src/server/catalog/order-links.mjs` dan salinan klien `src/features/cms/catalog/order-links.mjs`: `OFFICIAL_ORDER_HOSTS` KOSONG untuk ketiga platform, artinya validasi host tidak diberlakukan (host https apa pun diterima). ADR-037 catatan B-2 mewajibkan allowlist diisi di KEDUA tempat sebelum link tampil publik.
- Tidak ada Headless UI di `package.json`; yang terpasang `radix-ui` 1.8.1 dengan wrapper shadcn `src/components/ui/dialog.jsx` (juga `sheet.jsx`, `alert-dialog.jsx`). AGENTS.md menyebut Headless UI "untuk primitif aksesibel", tetapi ADR-037 menyatakan shadcn terpasang dipakai ulang dan melarang dependency baru tanpa bukti. Asumsi: pakai `dialog.jsx` yang ada (lihat Q-4).
- Tidak ada kode GA4 di `src/` (tidak ada `gtag`/`click_order`). Kontrak event ada di `docs/DATA_CONTRACTS.md` baris ~49-52.
- Data dev DB (laporan PM/user): 39 produk, semuanya punya link Grab dan GoFood dari CSV; ShopeeFood kemungkinan kosong. Belum diverifikasi oleh spec ini; host nyata harus dibaca dari data (lihat 9.1).

## 3. Scope

1. Interaksi card: klik/Enter/Spasi pada card produk membuka dialog "Pesan via".
2. Dialog memuat nama produk, harga (format IDR yang ada), dan tombol platform (GoFood, GrabFood, ShopeeFood) hanya untuk link yang tersedia.
3. Server mengekspos link order ke jalur baca publik hanya setelah lolos validasi allowlist host (defense in depth: filter saat baca, bukan hanya saat simpan).
4. Pengisian allowlist `OFFICIAL_ORDER_HOSTS` di server dan salinan klien CMS (setelah persetujuan eksplisit user atas daftar host).
5. Pembaruan dokumen kontrak yang diwajibkan ADR-037 (REQUIREMENTS, DATA_CONTRACTS, catatan ADR baru) oleh user/agen yang diizinkan, bukan oleh PM.
6. GA4 `click_order` (OPSIONAL, keputusan user; lihat 9.3).

## 4. Out of scope

- Checkout, pembayaran, keranjang, stok, status pesanan (invarian AGENTS.md).
- Sinkronisasi merchant/API platform, validasi tautan ke platform (tidak ada panggilan jaringan ke platform), pengecekan link mati.
- Mengubah form CMS link order, perilaku simpan, atau RBAC produk.
- Halaman `/menu/[slug]` tetap ada dan tidak diubah isinya (kecuali keputusan Q-5); tidak ada perubahan SEO canonical/sitemap.
- Structured data `Restaurant`/`LocalBusiness` (tetap di luar scope).
- Klaim "resmi", "terverifikasi", diskon, estimasi waktu/ongkir, harga per platform. Harga yang tampil hanya harga tunggal produk dari CMS.
- Multi-bahasa (situs Indonesia saja, ADR-038).
- Mengisi atau mengubah data produk di DB.

## 5. Perilaku

### 5.1 Card dan pemicu
- Seluruh card adalah target klik, tetapi dibuat sebagai tombol yang dapat difokus dan memicu dialog (bukan `div` dengan onClick saja). Judul tetap berupa link ke `/menu/{slug}` agar jalur crawl/aksesibilitas tidak hilang (lihat Q-5 untuk pilihan: judul tetap link vs. card menjadi tombol murni). Default usulan: tombol "Pesan" eksplisit pada card + seluruh area card klik membuka dialog; judul tetap link ke detail. Interaksi bersarang (link di dalam tombol) dilarang; FE memilih pola overlay yang valid secara HTML.
- Tidak ada JS: konten card (judul, deskripsi, harga, gambar) tetap server-render dan terindeks; hanya dialog yang butuh JS. Tanpa JS, pengunjung masih dapat membuka `/menu/{slug}`.
- Hanya komponen interaktif yang menjadi Client Component; data link dikirim sebagai prop serializable minimal (`[{platform, href}]`), bukan seluruh entri produk.

### 5.2 Dialog
- Judul dialog: nama produk; deskripsi singkat: "Pilih aplikasi untuk memesan." (copy final disetujui user, Indonesia saja).
- Isi: daftar tombol/link platform dalam urutan tetap GoFood, GrabFood, ShopeeFood. Platform dengan link kosong/tidak valid TIDAK dirender (tidak disabled, tidak ada placeholder).
- Tiap tombol adalah `<a href target="_blank" rel="noopener noreferrer nofollow">` dengan teks terlihat nama platform (logo boleh tambahan, bukan satu-satunya label) dan `aria-label`/teks sr-only "Pesan {produk} via {platform} (buka di tab baru)".
- Aksesibilitas: `role="dialog"`/`aria-modal`, `aria-labelledby` judul, fokus pindah ke dialog saat buka dan dikembalikan ke card pemicu saat tutup, focus trap, Esc menutup, klik overlay menutup, tombol tutup (X) dengan label "Tutup", scroll body terkunci, target sentuh minimal 44x44 px, kontras memenuhi WCAG AA, `prefers-reduced-motion` dihormati.
- Mobile-first: tampil sebagai bottom sheet atau dialog tengah responsif; tombol platform ditumpuk vertikal pada layar sempit dan tidak menyebabkan scroll horizontal (cek 320 px).
- Setelah tombol platform diklik, dialog boleh tetap terbuka (link di tab baru). Tidak ada redirect lewat server kita (tidak ada endpoint `/go?url=`), sehingga tidak ada open redirect.

### 5.3 Kasus tepi
- Tidak ada link valid untuk sebuah produk: card tidak menampilkan pemicu dialog (tidak ada tombol "Pesan"); card tetap menampilkan konten dan link ke detail. Tidak ada dialog kosong. (Alternatif: pesan "Belum tersedia untuk dipesan online"; default usulan: tanpa pesan, lihat Q-6.)
- Hanya satu link valid: dialog tetap muncul dengan satu tombol (konsisten, tanpa auto-redirect) — default usulan; alternatif langsung membuka link (Q-7).
- Link tersimpan namun host tidak lolos allowlist (data lama sebelum allowlist diisi): diperlakukan kosong untuk publik, tidak error, tidak dilog dengan isi URL penuh di klien.
- Nama produk sangat panjang atau tanpa gambar: dialog tidak overflow (truncate/wrap).
- Dua dialog tidak boleh terbuka bersamaan; klik cepat berulang tidak membuat dialog ganda.
- Link berubah di CMS: tayang sesuai kebijakan cache publik yang ada (invalidasi cache saat simpan, ADR-037); dokumentasikan bila ada jeda.

## 6. Keamanan, RBAC, SEO, merchant sync

Keamanan
- Validasi server-side adalah sumber kebenaran: `checkOrderUrl` (https saja, tanpa userinfo/port/karakter terlarang, panjang <= 2048, host persis di allowlist). Pada jalur baca publik, link yang gagal `checkOrderUrl` dibuang sebelum dikirim ke klien. Tidak mengandalkan validasi klien.
- Klien tidak pernah menyusun URL dari input pengguna; hanya merender `href` dari server yang sudah lolos validasi. Tidak ada parameter query yang mengarahkan ke URL arbitrer.
- Tidak ada `javascript:`/`data:`/`http:` (ditolak `checkOrderUrl`); React tidak menyuntik HTML mentah.
- `rel="noopener noreferrer nofollow"` + `target="_blank"` pada semua link keluar. Pertimbangkan `referrerPolicy`. Nilai `noreferrer` berarti platform tidak melihat asal; ini bisa mempengaruhi atribusi (lihat Q-8).
- Dependensi domain pada "link shortener"/deeplink pihak ketiga (mis. onelink): host allowlist harus eksak, bukan wildcard/suffix (aturan `order-links.mjs`). Risiko: host bersama (shared link service) memungkinkan siapa pun membuat link ke host yang sama; allowlist hanya membatasi host, bukan tujuan akhir. Diterima user secara eksplisit atau ditolak (lihat 9.1 dan Risiko R-2).
- CSP (bila ada) tidak perlu melonggarkan `connect-src`/`form-action` karena tidak ada fetch; navigasi `<a>` tidak dibatasi CSP. Cek bila ada `navigate-to`. Tidak ada pelonggaran CSP yang direncanakan.
- RBAC: tidak ada perubahan. Staff/Owner tetap bisa mengubah link (langsung tayang, ADR-037); karena itu allowlist + audit aktor adalah mitigasi yang sudah diterima (risiko (g) ADR-037).
- Perubahan fungsi SQL `public_read_catalog` adalah migrasi baru (0017). Per aturan repo: hanya dijalankan di DB test/dev setelah pra-cek, tidak di produksi tanpa persetujuan terpisah. Fungsi harus tetap hanya dapat dieksekusi peran baca publik (grant tidak diperlebar) dan tidak boleh membuka kolom lain.

SEO
- Konten card tetap server-render; dialog tidak mengubah teks yang terindeks. Link keluar `nofollow`. Halaman `/menu/[slug]` tetap `noindex` (tidak diubah). Tidak ada structured data baru. Dialog tidak boleh menimbulkan layout shift (CLS) atau menunda LCP (kode dialog dimuat lazy bila wajar; target Lighthouse mobile >= 90 adalah target QA, bukan janji).
- Tidak ada teks klaim ("resmi"/"terpercaya") yang tidak terverifikasi.

Merchant sync
- Tidak ada perubahan: link hanya input manual untuk pengunjung; bukan integrasi API; menyimpan tidak sync; tidak ada panggilan live ke merchant. Login aplikasi merchant tidak berarti hak API.

GA4 (OPSIONAL; keputusan 9.3)
- Bila disetujui: event `click_order` saat tombol platform diklik, parameter `item_id` (slug produk), `platform` (`gofood`/`grabfood`/`shopeefood`), `source_page` (path non-PII), `placement` (`menu_card_dialog`). Tanpa PII, tanpa URL tujuan penuh, tanpa nama pengguna. Hanya niat order keluar, tidak pernah "pesanan selesai". Kontrak `DATA_CONTRACTS.md` harus diperbarui lebih dulu untuk nilai `shopeefood` dan `placement` baru. Tidak ada GA4 di kode saat ini; bila GA4 belum dipasang, event ini ditunda dan spec ini hanya menyiapkan hook (fungsi no-op) atau di luar scope (Q-3). Pemanggilan hanya setelah persetujuan consent (bila ada mekanisme consent) dan tidak boleh memblokir navigasi.

## 7. Acceptance criteria (dapat dites)

Prasyarat data: fixture uji dengan link palsu pada host allowlist uji (bukan host nyata untuk test otomatis; allowlist dapat diinjeksi via parameter `hosts` seperti pada `checkOrderUrl`).

- AC-1: Pada halaman menu dan beranda, setiap card produk yang punya minimal satu link valid dapat dibuka dialog dengan klik mouse, sentuhan, dan keyboard (Enter/Spasi pada pemicu yang fokus).
- AC-2: Dialog menampilkan nama produk dan hanya tombol platform yang linknya terisi dan valid; urutan GoFood, GrabFood, ShopeeFood. Produk dengan link kosong untuk satu platform tidak merender elemen platform itu (tidak ada di DOM).
- AC-3: Produk dengan semua link kosong tidak memiliki pemicu dialog dan tidak ada dialog kosong yang dapat dibuka; konten card lain tidak berubah.
- AC-4: Produk dengan tepat satu link valid menampilkan dialog dengan tepat satu tombol (perilaku default Q-7).
- AC-5: Setiap tombol platform adalah `<a>` dengan `href` = link tersimpan persis, `target="_blank"`, `rel` mengandung `noopener`, `noreferrer`, dan `nofollow`.
- AC-6: Saat dialog terbuka: fokus berpindah ke dalam dialog; Tab/Shift+Tab tidak keluar dari dialog (focus trap); Esc menutup; klik overlay menutup; tombol "Tutup" menutup; setelah ditutup fokus kembali ke card pemicu.
- AC-7: Dialog memiliki `role="dialog"` (atau `alertdialog` tidak dipakai), `aria-modal`, nama aksesibel dari judul produk; tombol platform punya nama aksesibel yang menyebut platform dan produk. Pemeriksaan otomatis aksesibilitas (axe) pada dialog terbuka tidak melaporkan pelanggaran serius/kritis.
- AC-8: Pada viewport 320 px dan 390 px tidak ada scroll horizontal; target sentuh tombol >= 44x44 px; dialog dapat di-scroll bila konten panjang dan scroll body terkunci selama terbuka.
- AC-9: Payload publik (HTML/RSC yang dikirim ke klien dan hasil `public_read_catalog`) memuat link order HANYA yang lolos `checkOrderUrl` dengan allowlist terisi. Link dengan host di luar allowlist, `http:`, `javascript:`, userinfo, atau port tidak muncul di payload. (Test unit untuk filter, test integrasi untuk fungsi SQL/baca publik.)
- AC-10: Payload publik tidak memuat field lain yang sebelumnya disembunyikan (tidak ada kebocoran kolom internal, id audit, dll.) dan tidak ada nilai link untuk produk yang tidak live.
- AC-11: `OFFICIAL_ORDER_HOSTS` terisi persis dengan daftar yang disetujui user di server dan salinan klien CMS; test unit memastikan kedua daftar identik, tidak mengandung wildcard/suffix, dan host di luar daftar ditolak (`checkOrderUrl` mengembalikan `host`). Test existing `tests/unit/catalog-order-links.test.mjs` diperbarui dan lulus.
- AC-12: Setelah allowlist diisi, ada laporan (skrip baca-saja atau query) jumlah produk di DB dev yang linknya ditolak oleh allowlist, agar user tahu berapa link yang tidak akan tampil. Tidak ada data DB yang diubah otomatis.
- AC-13: Tidak ada panggilan jaringan keluar ke host platform dari server maupun klien saat render atau saat dialog dibuka (hanya navigasi pengguna ketika link diklik). Tidak ada endpoint redirect baru.
- AC-14: Perubahan link di CMS (simpan) tercermin di situs publik sesuai mekanisme invalidasi cache publik yang ada; test integrasi memastikan link baru muncul dan link yang dikosongkan hilang.
- AC-15: Tanpa JavaScript, halaman menu tetap menampilkan judul, deskripsi, harga, gambar, dan link ke `/menu/{slug}`; tidak ada error hidrasi di konsol.
- AC-16: (Hanya bila GA4 disetujui dan terpasang) klik tombol platform memicu tepat satu `click_order` dengan parameter pada bagian 6, tanpa PII dan tanpa URL tujuan; tidak ada event saat dialog hanya dibuka/ditutup (atau event terpisah bila diputuskan). Event tidak memblokir navigasi.
- AC-17: Mode `prefers-reduced-motion` tidak menjalankan animasi buka/tutup yang bergerak.
- AC-18: Lint, build, unit, integrasi, dan Playwright E2E lulus; hasil perintah yang benar-benar dijalankan dilaporkan (aturan release AGENTS.md). Lighthouse mobile dicatat sebagai target, bukan gate.

## 8. Tugas per peran

backend
- `src/server/catalog/order-links.mjs`: isi `OFFICIAL_ORDER_HOSTS` hanya dengan host yang disetujui user (9.1). Tambah helper murni `publicOrderLinks(entry, hosts)` yang mengembalikan `[{platform, href}]` terurut dan tervalidasi (memakai `checkOrderUrl`).
- Migrasi baru `drizzle/0017_*.sql` (+ meta snapshot): ganti `public.public_read_catalog()` agar memuat tiga kolom link order per produk TANPA mengubah hash snapshot, grant, atau kolom lain. Pra-cek (dump, tinjau SQL) sebelum dijalankan di DB dev; jalankan di DB test lebih dulu. Tidak ke produksi. Alternatif tanpa ubah SQL: tidak ada (fungsi saat ini tidak mengeluarkan kolom) — lihat Q-9.
- `src/server/catalog/published.mjs` (baris 26-31) dan `src/server/public/data.mjs`/`view-models.mjs`: hentikan pembuangan link pada jalur publik, tapi filter lewat `publicOrderLinks`; produk yang dikirim ke FE hanya membawa `orderLinks` tervalidasi, bukan URL mentah per kolom.
- Pastikan invalidasi cache publik saat simpan produk mencakup perubahan link (cek `src/server/catalog/products.mjs`).
- Test: unit `tests/unit/catalog-order-links.test.mjs` (tambah kasus allowlist), unit untuk `publicOrderLinks`, integrasi untuk `public_read_catalog` (AC-9, AC-10, AC-14).

frontend
- `src/features/public-site/components/PublishedContent.jsx` (`CatalogCards`): tambah pemicu per card dan teruskan `orderLinks` + judul + harga ke komponen dialog.
- Komponen Client baru (mis. `src/features/public-site/components/OrderDialog.jsx`) memakai `src/components/ui/dialog.jsx` (Radix via shadcn; lihat Q-4), Tailwind, tanpa TypeScript. Logo platform sesuai keputusan 9.2.
- Salinan klien allowlist `src/features/cms/catalog/order-links.mjs` disinkronkan dengan server (AC-11); `ProductModal.jsx` tidak berubah perilaku, hanya pesan validasi host mulai berlaku.
- Gaya: reuse token Tailwind/`globals`; tidak menambah font/dependency.
- Hook GA4 hanya bila 9.3 disetujui.
- Pastikan `MenuCard.jsx`/`OrderingNotice.jsx` tidak ikut berubah kecuali dipastikan masih dipakai (cek via Grep); jangan tampilkan teks "unavailable" bertentangan dengan fitur baru bila komponen itu masih tayang.

qa
- Unit: AC-5, AC-9, AC-11. Integrasi: AC-9, AC-10, AC-13, AC-14. E2E Playwright (`tests/e2e`): AC-1 sampai AC-8, AC-15, AC-17 pada viewport mobile dan desktop, termasuk pemeriksaan axe dan keyboard-only. Fixture: produk dengan 0, 1, 2, 3 link serta satu link host terlarang.
- Verifikasi tidak ada panggilan jaringan ke platform (intersepsi request Playwright, AC-13).
- Laporkan perintah yang benar-benar dijalankan, yang gagal, dan yang tidak dijalankan.

Dokumen (dilakukan user atau atas izin terpisah, bukan oleh PM): catatan ADR baru (turunan ADR-037), pembaruan `docs/REQUIREMENTS.md`, `docs/DATA_CONTRACTS.md` (nilai `platform=shopeefood`, `placement`), `docs/ROADMAP.md` (centang butir "host resmi allowlist" dan "tampilan publik link order + GA4"), `docs/SECURITY_AND_QA.md` setelah test.

## 9. Keputusan yang butuh user (BLOKIR implementasi)

9.1 Allowlist host (WAJIB). Saat ini kosong. Agen tidak boleh mengarang host. Usulan proses: backend menjalankan skrip baca-saja pada DB dev untuk mendaftar host unik dari ketiga kolom beserta jumlah (tanpa mencetak path/query lengkap), lalu user memilih host mana yang diizinkan per platform. Kandidat yang disebut (mis. `grab.onelink.me`, `gofood.link`, domain Shopee) belum terverifikasi dan harus dikonfirmasi dari data nyata. Perhatian: host perantara bersama (onelink.me, branch.io-style) dipakai banyak merek; mengizinkannya berarti hanya host yang dibatasi, bukan tujuan. User harus menyetujui risiko ini atau mengganti dengan host langsung resmi. Perubahan allowlist di `order-links.mjs` memerlukan persetujuan eksplisit user atas daftar final.
9.2 Logo platform. Sumber aset belum ditentukan; hak pakai logo merek GoFood/GrabFood/ShopeeFood belum diverifikasi. Opsi: (A) tombol teks saja dengan nama platform (aman, tanpa aset, DEFAULT usulan); (B) user menyediakan file logo resmi (SVG/PNG) beserta konfirmasi hak/pedoman merek, disimpan di repo (mis. `public/platforms/`); (C) ikon generik + teks. Agen tidak boleh menggambar ulang atau mengunduh logo merek sendiri. Permintaan awal menyebut "logo"; spec memakai opsi A sampai user memilih.
9.3 GA4 `click_order`. Opsional. Perlu keputusan: (a) masukkan sekarang atau tunda; (b) bila ya, apakah GA4 sudah dipasang (tidak ada di kode saat ini, pemasangan GA4 + consent adalah pekerjaan terpisah); (c) pembaruan kontrak `DATA_CONTRACTS.md` untuk `shopeefood` dan `placement`. Default usulan: TUNDA (tanpa GA4), tidak ada event baru.

## 10. Asumsi dan pertanyaan terbuka

Asumsi
- A-1: Link order di DB dev berasal dari CSV pengguna dan dianggap data user; spec tidak memverifikasi kebenarannya.
- A-2: Tidak ada perubahan skema tabel; hanya fungsi baca publik yang diganti (migrasi 0017).
- A-3: Dialog memakai komponen Radix/shadcn yang sudah ada dan tidak menambah dependency.
- A-4: Urutan platform tetap dan teks UI berbahasa Indonesia tanpa klaim.

Pertanyaan
- Q-1: Host mana yang masuk allowlist (9.1)?
- Q-2: Logo atau teks saja (9.2)?
- Q-3: GA4 sekarang atau tunda (9.3)?
- Q-4: Konfirmasi memakai `src/components/ui/dialog.jsx` (Radix) alih-alih Headless UI yang disebut AGENTS.md tetapi tidak terpasang (menghindari dependency baru). Setuju?
- Q-5: Pola card: seluruh card klik membuka dialog dengan judul tetap link ke detail, atau card hanya membuka dialog dan detail dijangkau lewat link terpisah? Apakah halaman `/menu/[slug]` juga menampilkan tombol order yang sama?
- Q-6: Produk tanpa link: tanpa pemicu (default) atau tampilkan pesan "Belum tersedia untuk dipesan online"?
- Q-7: Satu link saja: tetap dialog (default) atau langsung buka link?
- Q-8: `noreferrer` dapat menghilangkan atribusi referrer di sisi platform; terima atau pakai `noopener nofollow` saja dengan `referrerPolicy="strict-origin-when-cross-origin"`? Default usulan: `noopener noreferrer nofollow`.
- Q-9: Persetujuan membuat migrasi 0017 (ganti `public_read_catalog`) dan menjalankannya di DB test dulu, DB dev setelah pra-cek. Tidak ada produksi.
- Q-10: Copy final dialog (judul "Pesan via", deskripsi, label tombol) disetujui user.

## 11. Risiko

- R-1: Link tampil publik sebelum diverifikasi akurasinya (data CSV): tautan salah atau mati langsung terlihat pengunjung. Mitigasi: laporan AC-12, Owner mengecek manual, tidak ada klaim "resmi".
- R-2: Host perantara bersama (onelink) tidak menjamin tujuan akhir milik platform; Staff dapat menyimpan link berbahaya pada host yang sama dan langsung tayang. Mitigasi: allowlist eksak, audit aktor, `nofollow noopener noreferrer`; risiko sisa diterima user atau tidak.
- R-3: Migrasi fungsi SQL publik dapat merusak baca publik (semua halaman katalog). Mitigasi: pra-cek, test integrasi pada DB test, rollback = kembalikan definisi fungsi 0016.
- R-4: Penggunaan logo merek tanpa hak (lihat 9.2). Mitigasi: opsi teks default.
- R-5: Dialog menambah JS pada halaman menu (CWV/INP). Mitigasi: komponen kecil, lazy-load dialog, ukur dengan Lighthouse.
- R-6: Beranda sebelumnya memakai card yang berfungsi sebagai link; mengubah pola klik dapat mengurangi keterbukaan ke `/menu/{slug}`. Mitigasi: Q-5.
- R-7: Allowlist ditulis di dua tempat (server dan klien CMS) dapat menyimpang. Mitigasi: test kesetaraan AC-11.
- R-8: Link yang sudah tersimpan namun ditolak allowlist baru akan tidak tampil publik secara diam-diam dan juga gagal saat Edit/Simpan di CMS. Mitigasi: AC-12, komunikasikan ke Owner.

Rollback: kembalikan file FE/BE dan kosongkan lagi `OFFICIAL_ORDER_HOSTS` serta migrasi fungsi (kembali ke definisi 0016) bersama-sama; data link di tabel tidak berubah. Tanpa deploy/aksi cloud.

## 12. Ringkasan untuk user

Klik card produk -> dialog dengan tombol GoFood/GrabFood/ShopeeFood; platform tanpa link disembunyikan; link terbuka di tab baru (`noopener noreferrer nofollow`). Butuh migrasi 0017 untuk mengekspos link ke jalur baca publik (saat ini disembunyikan). Tiga keputusan Anda sebelum implementasi: (1) daftar host allowlist yang boleh (saat ini kosong; hanya Anda yang boleh menyetujui), (2) logo resmi atau teks saja (default teks), (3) GA4 click_order sekarang atau tunda (default tunda; GA4 belum terpasang). Tidak ada checkout/sync merchant; produk tanpa link tidak punya pemicu dialog.
