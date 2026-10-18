# Spec: Deploy Tiny Osaka ke Railway (staging lalu produksi)

Status: DRAF, menunggu persetujuan user. Belum ada kode, konfigurasi, migrasi, atau aksi cloud yang dijalankan. Dokumen ini hanya rencana.

Dasar keputusan (AGENTS.md): deploy hanya setelah staging QA dan persetujuan eksplisit developer; tidak ada migrasi produksi tanpa persetujuan; rahasia hanya di env server; tidak ada panggilan merchant live; tanpa checkout/analytics internal/sinkron merchant otomatis. ADR-036/037/038 tetap berlaku. Tidak ada ADR yang melarang Railway; DECISIONS.md/REQUIREMENTS.md hanya menyebut "VPS" sebagai asumsi awal (VPS provider berstatus PENDING). Memilih Railway menggantikan asumsi itu dan perlu dicatat sebagai ADR baru oleh user (lihat Pertanyaan Terbuka).

Prasyarat: PR `feat/public-site-redesign` (commit 67236be: popup order card, migrasi 0017, redesain publik) sudah di-merge ke `main`.

---

## 1. Masalah & tujuan

Kode saat ini sengaja "local-only": semua konfigurasi koneksi menolak host selain loopback, target hanya `dev`/`test`, media disimpan di `.media/<target>` pada disk lokal, dan tidak ada jalur migrasi/bootstrap produksi. Tujuan: menayangkan situs publik + CMS di Railway lewat dua lingkungan (staging, produksi) dengan DB Postgres terkelola, penyimpanan media persisten, HTTPS, dan semua kontrol keamanan yang sudah ada tetap berlaku, tanpa melemahkan guard lokal untuk dev/test.

## 2. Temuan blocker (hasil penelusuran repo, read-only)

| ID | Blocker | Bukti (file) | Dampak |
|----|---------|--------------|--------|
| B-1 | Koneksi DB publik menolak host non-loopback, port selain 5432, ada query string (mis. `sslmode`), DB/user harus `tiny_osaka_{dev,test}` / `_app` | `src/server/db/config.mjs`, `src/server/public/config.mjs` | Situs publik tidak bisa konek ke Railway Postgres |
| B-2 | Koneksi CMS menolak target selain `dev`/`test` dan host selain `127.0.0.1`/`[::1]` | `src/server/cms/request-policy.mjs` (`getCmsDatabaseConfig`), `src/server/cms/runtime.mjs` | CMS (halaman, katalog, media) tidak jalan |
| B-3 | `BETTER_AUTH_URL` hanya boleh `localhost`/`127.0.0.1`/`[::1]`, path `/`; `useSecureCookies` hanya aktif bila URL `https:` | `src/server/auth/config.mjs`, `src/server/auth/service.mjs` | Login/sesi tidak bisa pakai domain asli; cookie aman bergantung pada URL https |
| B-4 | Penyimpanan media: `path.resolve(".media", target)` dan target hanya `dev`/`test`; filesystem Railway efemeral | `src/server/media/storage.mjs` | Upload gagal (target) dan file hilang setiap redeploy bila tanpa volume |
| B-5 | Nama role di dalam SQL migrasi di-hardcode: 0006-0016 hanya mengenal `current_user` = `tiny_osaka_test_owner` atau `tiny_osaka_dev_owner`, selain itu `RAISE EXCEPTION` (0006: "Refusing public-read grants outside reviewed local owner"; 0007/0008/0009/0010/0012/0014/0016 serupa) | `drizzle/0006..0016*.sql` | Migrasi tidak bisa dijalankan dengan role produksi apa pun tanpa keputusan (lihat opsi di 5.3) |
| B-6 | Tidak ada runner migrasi produksi. `migrate-dev-db.mjs` / `migrate-test-db.mjs` mengunci DB `tiny_osaka_dev`, user `tiny_osaka_dev_migrator`, host loopback; `validateDevMigrationState` hanya menerima riwayat 12-18 (DB kosong ditolak: "Empty/uninitialized DBs need a separately approved bootstrap operation"); jalur 0016 mereset konten lokal | `scripts/migrate-dev-db.mjs`, `scripts/lib/dev-db.mjs`, `scripts/lib/dev-migration-plan.mjs` | DB Railway baru (kosong) tidak bisa dimigrasi dengan tooling yang ada; `drizzle-kit migrate` tidak dipakai/direview |
| B-7 | Tidak ada bootstrap Owner pertama untuk produksi: `scripts/provision-account.mjs` memakai `connectDevOwner` (dev only) | `scripts/provision-account.mjs`, `src/server/auth/provision.mjs` | Tidak ada cara membuat akun Owner pertama di produksi |
| B-8 | Tidak ada endpoint healthcheck ringan (hanya `/api/auth/*` dengan allowlist path, `/api/cms/*`, `/media/[id]`) | `src/app/api/**` | Railway tidak punya healthcheck yang aman (halaman `/` memakai DB dan `force-dynamic`) |
| B-9 | Email transaksional belum terpasang (`sendEmail` tidak di-wire; `/request-password-reset` dan `/send-verification-email` mengembalikan 503). Penyedia email belum dipilih | `src/server/auth/runtime.mjs`, `src/server/auth/service.mjs` | Reset kata sandi lewat UI tidak tersedia di produksi; pemulihan akun Owner harus lewat prosedur operator (lihat 10) |
| B-10 | Seluruh situs publik `noindex,nofollow` (layout `(site)`, metadata produk/halaman); tidak ada `robots.txt`/`sitemap.xml`; tidak ada header keamanan (CSP/HSTS/X-Frame-Options/Referrer-Policy/Permissions-Policy) di `next.config.mjs` | `src/app/(site)/layout.jsx`, `src/features/public-site/components/PublishedContent.jsx`, `next.config.mjs` | Go-live SEO butuh keputusan dan perubahan; header keamanan belum ada di level app |
| B-11 | Importer CSV katalog menolak `NODE_ENV=production`, mewajibkan `PUBLIC_DATABASE_TARGET` test/dev (dev butuh `--allow-dev`), memakai `getCmsDatabaseConfig` (loopback), dan menulis foto ke `createLocalStorage()` lokal | `scripts/import-catalog-csv.mjs` | 39 produk + foto tidak bisa diisi ke produksi dengan alat yang ada (disengaja) |
| B-12 | Rate limit auth berbasis kunci HMAC rute/akun, bukan IP (`ipAddressHeaders: []`) | `src/server/auth/service.mjs` | Tidak ada pembatasan per-IP di belakang proxy Railway; penyerang dapat memicu lockout login Owner (5 percobaan/15 menit per email). Risiko diterima atau ditangani di edge (lihat 9) |

Catatan non-blocker: `npm run build` tidak membuka koneksi DB (klien dibuat lewat factory); layout `(site)` memakai `force-dynamic`. Ini harus dibuktikan di staging (AC-3). `package.json` mensyaratkan Node `>=22.16.0 <23`, npm `>=10 <11`. Worker publikasi terjadwal sudah dihapus (ADR-036), jadi tidak butuh service worker terpisah. Pemutar/ffmpeg video bersifat opsional (`FFMPEG_PATH`/`FFPROBE_PATH`); upload video tidak tersedia tanpa keduanya.

## 3. Scope

1. Arsitektur Railway: satu project, dua environment (`staging`, `production`), masing-masing: service `web` + service Postgres + volume untuk media.
2. Perubahan kode minimal yang membuka target `production` secara eksplisit tanpa melonggarkan dev/test (bagian 6).
3. Runner migrasi produksi yang direview (bukan jalan otomatis saat deploy), pra-cek, dan rencana rollback.
4. Bootstrap Owner pertama.
5. Strategi mengisi 39 produk + foto (opsi, keputusan user).
6. Keamanan, SEO/robots/sitemap, domain/HTTPS, backup, rollback, checklist go-live.

## 4. Out of scope

- Checkout/pembayaran/inventori, analytics internal, feed sosial, sinkron merchant, panggilan endpoint merchant live, skema `Restaurant`/`LocalBusiness`, retouch gambar.
- Penyedia email transaksional dan alur reset sandi via email (pertanyaan terbuka; bukan prasyarat go-live bila Owner siap dengan prosedur pemulihan operator).
- Pengisian alamat, harga, klaim bahan, URL menu, jam buka yang belum terverifikasi.
- Auto-deploy dari Git ke produksi, CI/CD, preview environment per PR.
- Pemindahan penyimpanan media ke object storage (hanya opsi alternatif, tidak dikerjakan sekarang).
- Menjalankan aksi cloud apa pun dalam tahap penulisan spec ini.

## 5. Desain

### 5.1 Arsitektur Railway

- Project `tiny-osaka`; environment `staging` dan `production` terpisah penuh (DB, volume, secret, domain tidak dibagi).
- Service `web`: build dari repo (branch `main`), `npm ci` lalu `npm run build`, start `npm run start` (`next start`; Next membaca `PORT` dari Railway dan bind 0.0.0.0 secara default; diverifikasi di staging). Pin Node 22 (field `engines` sudah ada; Railway membaca versi Node dari sana atau variabel build, diverifikasi saat dry-run staging). `sharp` dipakai oleh optimizer gambar dan penyimpanan media: pastikan binary platform Linux ter-install lewat `npm ci` (tidak ada dependency baru).
- Service Postgres (plugin Railway): satu database aplikasi per environment, diakses lewat jaringan privat (host internal Railway). TCP proxy publik dimatikan kecuali ada prosedur operator sementara yang disetujui (lihat 5.5).
- Volume Railway pada service `web`, mount di path tetap (usulan `/data/media`), dipakai sebagai root penyimpanan media. Konsekuensi: `web` harus satu replika (volume hanya melekat pada satu instance) dan setiap deploy ada jeda singkat. Untuk skala traffic 1k-10k kunjungan/bulan ini wajar.
- Alternatif penyimpanan media (keputusan user): (a) volume Railway [direkomendasikan, perubahan kode terkecil]; (b) object storage S3-compatible [butuh adapter storage baru, dependency baru, mengubah model `realpath`/hard link, di luar scope sekarang]; (c) mem-bundle foto di Git [ditolak: melanggar alur upload CMS, checksum/audit, dan "tidak ada foto asli di Git"]. Cara kerja volume dan fitur backupnya harus diverifikasi di dokumentasi/akun Railway user sebelum diandalkan (tidak diasumsikan di spec ini).
- Healthcheck: path `/api/health` (belum ada, lihat 6), timeout wajar, tanpa detail internal di response.
- Domain: domain belum dipilih (REQUIREMENTS). Staging memakai domain Railway otomatis sampai domain ditetapkan. Produksi: domain kustom + sertifikat otomatis Railway (HTTPS), `BETTER_AUTH_URL` = origin HTTPS final tanpa path.
- Region: pilih region terdekat Indonesia yang tersedia di plan user; belum diverifikasi (pertanyaan terbuka).

### 5.2 Variabel environment (nama saja; semua server-only, tidak ada `NEXT_PUBLIC_*`)

Yang sudah dibaca kode (hasil Grep `process.env`):

| Variabel | Dipakai oleh | Catatan produksi |
|----------|--------------|------------------|
| `PUBLIC_DATABASE_TARGET` | publik, CMS, media, importer | Perlu nilai baru yang diizinkan (mis. `production`/`staging`; lihat 6) |
| `PUBLIC_CONTENT_SOURCE` | `src/server/public/config.mjs` | Harus `published` (default); `fixture` tidak boleh dipakai di Railway |
| `DATABASE_URL` | pembacaan publik (role `_app`) dan auth | Role runtime terbatas |
| `CMS_DATABASE_URL` | CMS (role `_cms`) | Role terpisah, terbatas |
| `BETTER_AUTH_SECRET` | auth, HMAC rate limit | Min 32 karakter, acak, berbeda per environment; menggantinya mengubah kunci rate limit dan menginvalidasi sesi |
| `BETTER_AUTH_URL` | auth, origin CSRF, cookie secure | Origin HTTPS final, tanpa path/query |
| `FFMPEG_PATH`, `FFPROBE_PATH` | upload video (opsional) | Tidak diset = upload video nonaktif (default aman) |
| `NODE_ENV` | importer menolak `production`; Next | `next build`/`next start` menyetel `production` sendiri; jangan menimpa |
| `PORT` | `next start` | Disediakan Railway |
| `QA_NEXT_DIST_DIR` | hanya QA lokal | Tidak diset di Railway |

Variabel baru yang MUNGKIN diperlukan (perubahan kode, lihat 6; nama usulan, belum final):

| Variabel | Fungsi |
|----------|--------|
| `MEDIA_STORAGE_ROOT` | Path absolut mount volume (mis. `/data/media`); mengganti `.media/<target>` hanya untuk target non-lokal |
| `MIGRATION_DATABASE_URL` | Kredensial role owner/migrator, hanya ada di lingkungan operator/job migrasi, TIDAK pernah di service `web` |
| `TINY_OSAKA_SETUP_ADMIN_PASSWORD`-setara untuk provisioning (nama final ditentukan backend) | Bootstrap Owner; input via stdin seperti `provision-account.mjs`, tidak di env service |
| `TINY_OSAKA_CONFIRM_PRODUCTION_MIGRATION` | Konfirmasi eksplisit runner migrasi produksi (pola sama dengan `TINY_OSAKA_CONFIRM_CONTENT_RESET=0016`) |

Sumber nilai: Railway Variables per environment (referensi variabel layanan Postgres boleh dipakai untuk host/port, tetapi URL aplikasi tetap disusun dengan role terbatas, bukan kredensial `postgres` admin). Tidak ada nilai rahasia di Git, log, issue, atau pesan agen.

### 5.3 Peran DB dan cara membuatnya di Railway

Peran yang diperlukan per environment (mengikuti pola lokal; nama final mengikuti keputusan 5.3.1):

- `*_owner`: NOLOGIN, NOSUPERUSER, pemilik database dan semua objek (dipakai lewat `SET ROLE` oleh migrator). Pola lokal.
- `*_migrator`: LOGIN, NOINHERIT, anggota `*_owner` dengan `SET` saja (tanpa INHERIT/ADMIN), tanpa CREATEDB/CREATEROLE/SUPERUSER/REPLICATION/BYPASSRLS, tidak bisa CONNECT ke DB lain, tidak punya CREATE sebelum `SET ROLE`. Hanya dipakai oleh runner migrasi (operator), bukan oleh `web`.
- `*_app`: LOGIN terbatas, hanya EXECUTE pada fungsi `public.public_read_*` (0006/0010/0011/0016) dan hak auth pada skema `cms_auth` (0007). Dipakai `DATABASE_URL`.
- `*_cms`: LOGIN terbatas, `CONNECTION LIMIT 5`, hak CMS (0008-0014). Dipakai `CMS_DATABASE_URL`.

Pembuatan di Railway: plugin Postgres hanya menyediakan user admin (`postgres`) dan database default. Role di atas dan database aplikasi dibuat sekali oleh operator memakai kredensial admin tersebut lewat `psql` dari mesin operator atau Railway shell/one-off, dengan skrip provisioning produksi yang direview (setara `setup-local-db.ps1`, `setup-dev-migrator.ps1`, `setup-cms.ps1`, `setup-auth.ps1`; skrip lokal itu berbasis PowerShell, hardcode `127.0.0.1` dan akun `postgres` lokal, jadi tidak bisa dipakai apa adanya). Password di-generate acak (>=48 hex, seperti `setup-cms.mjs`) dan langsung dimasukkan ke Railway Variables, tidak dicetak. Kredensial admin `postgres` tidak disimpan di variabel service `web`. Kemampuan Railway untuk membuat role/DB kustom dan membatasi superuser perlu diverifikasi di staging sebelum produksi (belum diasumsikan).

#### 5.3.1 Keputusan penamaan role vs SQL migrasi (B-5), user memilih satu

- Opsi P (direkomendasikan): tambah cabang `tiny_osaka_production_owner` / `tiny_osaka_staging_owner` pada SQL role-dispatch 0006-0016 lewat varian terpisah untuk DB baru, tanpa mengubah berkas 0000-0017 yang sudah terpakai di dev/test. Praktisnya: runner produksi memakai jalur "reviewed SQL" yang menerapkan salinan SQL yang diberi cabang role baru dan hash-nya di-pin di rencana migrasi produksi sendiri. Risiko: dua versi SQL harus dijaga setara; wajib uji perbandingan skema (dump schema-only dev vs staging) sebagai AC.
- Opsi Q: ubah langsung 0006-0016 menambah cabang `ELSIF`. Risiko: hash berubah, `reviewedMigrations` dev/test dan riwayat `drizzle.__drizzle_migrations` di DB dev/test jadi tidak cocok (pelanggaran aturan "jangan menulis ulang migrasi terapan"). Tidak direkomendasikan.
- Opsi R: di Railway, pakai nama role persis `tiny_osaka_dev_*` (DB `tiny_osaka_dev`) agar SQL lama jalan. Tidak butuh perubahan SQL, tetapi menyamarkan target produksi sebagai "dev", bertabrakan dengan guard dan membingungkan audit. Tidak direkomendasikan.

### 5.4 Urutan deploy

0. Prasyarat: PR di-merge ke `main`; user menyetujui spec ini; ADR Railway dicatat.
1. (Dev/test, lokal) Implementasi perubahan kode (bagian 6) + uji unit/integrasi; `lint`, `build`, `security:check`, E2E hijau.
2. Buat project Railway + environment `staging` (aksi cloud, butuh persetujuan eksplisit terpisah).
3. Provisioning DB staging: buat database, role (5.3), set Variables. Setup layanan `web` + volume.
4. Jalankan runner migrasi staging dengan pra-cek (5.6). Verifikasi.
5. Bootstrap Owner staging (5.7). Isi data uji staging (bukan data produksi).
6. Deploy `web` staging; cek healthcheck, HTTPS, cookie, CSRF, sesi, rate limit, upload media, persistensi media setelah redeploy, restore backup uji.
7. Staging QA penuh: `lint`, `build`, unit, integrasi, Playwright E2E terhadap URL staging, `security:check`, Lighthouse mobile (target >=90, bukan janji), pemeriksaan aksesibilitas. Staging tetap `noindex` dan idealnya tidak terbuka bebas (lihat 9).
8. Persetujuan eksplisit developer/user untuk produksi (checklist 12).
9. Ulangi 3-6 di environment `production` (DB kosong baru, runner yang sama, pra-cek yang sama), lalu isi katalog (5.8), pasang domain kustom, ubah kebijakan indeks (bagian 8), go-live.
10. Pasca-go-live: pantau, uji backup/restore terjadwal, catat hasil di DECISIONS (oleh pihak yang berwenang).

### 5.5 Akses operator ke DB

Migrasi/bootstrap/restore dijalankan dari mesin operator atau shell Railway (`railway run` / one-off). Jika memakai TCP proxy publik Railway, itu membuka DB ke internet: hanya dinyalakan sementara selama operasi yang disetujui, memakai role `_migrator` bukan admin, dan dimatikan setelahnya. Alternatif yang lebih aman: menjalankan skrip dari dalam jaringan privat (shell service). Pilihan ini bagian keputusan user (Pertanyaan 6).

### 5.6 Rencana migrasi 0000-0017 (produksi dan staging)

Karena DB Railway kosong, alur dev ("riwayat 12-18") tidak berlaku. Runner baru `scripts/migrate-production-db.mjs` (usulan nama) + `scripts/lib/production-migration-plan.mjs`:

- Memuat `drizzle/meta/_journal.json` dan memvalidasi 18 entri (0000-0017) terhadap tag, `when`, dan hash yang di-pin (hash dev yang ada di `reviewedMigrations`, atau hash varian Opsi P bila dipilih).
- Menolak jika `MIGRATION_DATABASE_URL` bukan role `_migrator` environment yang dituju, jika DB bukan DB target, atau jika `TINY_OSAKA_CONFIRM_PRODUCTION_MIGRATION` tidak sama persis dengan nilai yang diminta (mis. label target + "0017").
- Pra-cek (semua harus lolos, read-only, dicetak ringkas tanpa kredensial): koneksi sebagai `_migrator`; flag atribut role (tidak super/createdb/createrole/replication/bypassrls); keanggotaan `SET` ke `_owner`; DB kosong (`public` tanpa tabel, tanpa skema `drizzle`/`cms_auth`) atau riwayat tepat 0..N sesuai prefix pin; tidak ada role lain berhak tulis; ekstensi yang dibutuhkan tersedia (belum diinventarisasi, QA backend harus mendaftarnya dari SQL); advisory lock `76210983` agar tidak berjalan ganda.
- Urutan: semua dijalankan sebagai `SET ROLE *_owner`; dibungkus transaksi per migrasi (mengikuti perilaku Drizzle) dengan `lock_timeout`/`statement_timeout` seperti runner dev; setelah tiap tahap panggil `verify*Protection` yang sama (`catalog`, `page`, `media`, `public-read`, `auth`, `cms`, `publishing`) dengan nama owner produksi.
- Migrasi 0016 pada DB baru: tidak ada konten untuk di-reset; tombol `TINY_OSAKA_CONFIRM_CONTENT_RESET` tidak boleh dipakai di produksi dan runner produksi tidak boleh punya jalur reset konten sama sekali.
- Idempotensi: menjalankan ulang pada state 18 hanya mencetak "sudah diterapkan".
- Pasca-cek: jumlah tabel (31 publik + 9 auth sesuai catatan runner dev), kepemilikan semua objek oleh `_owner`, hak `_app`/`_cms` sesuai matriks, dan perbandingan skema-saja terhadap DB dev (`pg_dump --schema-only`, diff yang dijelaskan) sebagai bukti kesetaraan.
- Rollback: SQL 0000-0017 tidak punya jalur reverse umum. Rencana rollback pada DB baru: (1) sebelum migrasi ambil backup/snapshot kosong; (2) jika gagal di tengah, pulihkan snapshot atau buang DB dan buat ulang (aman karena belum ada data produksi). Setelah ada data produksi, rollback skema = restore dari backup + redeploy kode versi sebelumnya; tidak ada `DROP SCHEMA`/`TRUNCATE` ad hoc. Migrasi berikutnya (0018+) wajib punya rencana reverse yang direview sebelum produksi.
- Runner tidak dijalankan otomatis pada deploy/`start`; hanya manual dengan persetujuan.

### 5.7 Bootstrap Owner pertama

- Skrip `scripts/provision-production-account.mjs` (usulan) memakai pola `provisionAccount` (`src/server/auth/provision.mjs`): kredensial dari stdin (JSON), tidak dari argumen/env service/log; kata sandi minimum sesuai kebijakan (`minPasswordLength` 6 di konfigurasi saat ini, lemah; tinjau menaikkan ke kebijakan yang disetujui sebagai pertanyaan terbuka); koneksi memakai role migrator/owner terbatas; menolak jika sudah ada akun Owner (tidak menimpa); hanya satu Owner awal. Email ownership belum terverifikasi karena email belum terpasang.
- Setelah login pertama di `/admin/login`: Owner mengaktifkan MFA (opsional dalam kebijakan, sangat disarankan di produksi), mengganti kata sandi sementara, membuat akun Staff sesuai kebutuhan lewat prosedur provisioning internal.
- Pemulihan Owner terkunci (karena B-9): prosedur operator terdokumentasi (mis. skrip reset kata sandi terkontrol dengan persetujuan) -- bagian kerja backend; tanpa itu risiko lockout permanen.

### 5.8 Mengisi 39 produk + foto di produksi (keputusan user)

Importer sengaja menolak produksi. Opsi:

| Opsi | Cara | Keuntungan | Risiko |
|------|------|------------|--------|
| A. Input manual via CMS | Owner/Staff membuat 39 kartu dan unggah foto di `/admin/catalog` pada produksi | Tanpa perubahan kode; semua guard (validasi, audit, allowlist link order, RBAC) tetap | Lambat; rawan salah ketik harga/nama; harus dari sumber terverifikasi |
| B. Jalankan importer di dalam shell service `web` produksi | Tambah target `production` yang ketat ke importer (dry-run default, `--apply` + konfirmasi eksplisit + hanya host DB privat), CSV diunggah sementara ke container, foto diunduh (host Grab dikunci) dan ditulis ke volume lewat `storage` yang sama | Cepat, memakai jalur server CMS yang sama (`createCmsCatalog`, `createMediaAssets`); foto langsung di volume | Melonggarkan guard yang disengaja; risiko menimpa/duplikasi (importer hanya create, tidak update/hapus); CSV berisi data di container; unduhan dari domain pihak ketiga dari server produksi; wajib dry-run di staging dengan CSV identik lebih dulu; butuh persetujuan terpisah per eksekusi |
| C. Impor ke staging lalu salin ke produksi (pg_dump data + salin file volume) | Isi dan verifikasi di staging, lalu restore tabel konten + salin isi volume | Terverifikasi dulu | Salinan data memuat riwayat/audit/ID staging, kepemilikan objek, relasi `catalog_media_refs`/checksum harus sama persis; rawan tabrakan dengan data produksi; prosedur restore parsial kompleks |
| D. Impor dari mesin lokal lewat DB proxy publik | Jalankan importer lokal menuju DB produksi | Tidak perlu shell di container | Membuka DB ke internet; foto tertulis ke disk lokal, bukan volume (tidak akan tampil); paling berisiko, tidak direkomendasikan |

Rekomendasi PM: A bila volume kecil dan waktu cukup (39 produk dapat dikelola), atau B bila user ingin kecepatan, dengan dry-run di staging dan persetujuan per eksekusi. Pilihan B membutuhkan perubahan kode importer (bagian 6) dan dikerjakan sebagai item terpisah yang butuh persetujuan. Syarat umum semua opsi: harga/nama/deskripsi dari sumber terverifikasi; deskripsi dengan klaim bahan belum terverifikasi diimpor kosong (perilaku importer saat ini); allowlist host order untuk GoFood/GrabFood sudah terisi, ShopeeFood masih kosong (`src/server/catalog/order-links.mjs`) sehingga tautan ShopeeFood tidak tampil publik; alamat/jam buka tidak diisi tanpa verifikasi.

## 6. Perubahan kode yang MUNGKIN dibutuhkan (semua butuh persetujuan; tidak dikerjakan di tahap spec)

Prinsip: izinkan target `production`/`staging` hanya lewat daftar putih eksplisit dan hanya ketika env deploy valid; perilaku dev/test dan unit test lokal tetap sama; tidak ada dependency baru.

Backend:
1. `src/server/db/config.mjs`, `src/server/public/config.mjs`: dukung target baru (mis. `staging`, `production`) dengan nama DB/role terpola, host dari daftar yang diizinkan (host privat Railway yang tidak loopback), port tervalidasi, tanpa password placeholder. Loopback dev/test tidak berubah. Pertimbangkan TLS: koneksi privat Railway biasanya tanpa SSL; jika memakai proxy publik, kebutuhan `sslmode` bertentangan dengan penolakan query string saat ini, jadi atur lewat opsi `ssl` pool dan bukan query string.
2. `src/server/cms/request-policy.mjs` (`getCmsDatabaseConfig`) dan `src/server/cms/runtime.mjs`: sama seperti di atas untuk `CMS_DATABASE_URL`; jangan memuat `.env.cms.local` di non-lokal.
3. `src/server/auth/config.mjs`: izinkan origin HTTPS non-lokal dari satu env (`BETTER_AUTH_URL`) hanya pada target produksi/staging; tetap tolak path/query/hash/kredensial dan HTTP non-lokal; `useSecureCookies` otomatis dari https (sudah ada). Tinjau `src/server/auth/runtime.mjs` (fallback `.env.auth.local`).
4. `src/server/media/storage.mjs` (`storageRoot`): target non-lokal membaca `MEDIA_STORAGE_ROOT` (path absolut mount volume); pertahankan pemeriksaan `realpath === root`, `lstat`, hard link, mode 0o700 (cek izin user container pada volume); tanpa pindah ke path relatif. Perhatikan `scripts/lib/media-protection.mjs` dan `src/server/media/*` yang mungkin mengasumsikan `.media`.
5. `scripts/migrate-production-db.mjs` + `scripts/lib/production-migration-plan.mjs` (+ `package.json` script `db:migrate:production`) sesuai 5.6, dan keputusan penamaan role 5.3.1 (kemungkinan varian SQL atau cabang role).
6. `scripts/provision-production-account.mjs` + perbaikan kebijakan sandi bila disetujui (5.7).
7. `src/app/api/health/route.js` (baru): respons 200 statis `no-store` tanpa data internal; opsional pemeriksaan `SELECT 1` lewat role `_app` dengan timeout pendek (keputusan: tanpa DB agar Railway tidak me-restart saat DB sebentar lambat, atau dengan DB agar mendeteksi putus). Rute ini bukan bagian dari `authPaths`.
8. Importer (hanya jika Opsi B dipilih): `scripts/import-catalog-csv.mjs` + `scripts/lib/catalog-csv.mjs`, dengan guard produksi ketat.
9. Utilitas: skrip daftar `ENV` wajib (cek startup yang gagal tertutup bila env tak lengkap) -- opsional.

Frontend:
10. `next.config.mjs`: tambah `headers()` untuk semua rute: `Strict-Transport-Security` (hanya produksi), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`/`frame-ancestors`, dan CSP yang memperhitungkan Next, font Google (`next/font/google` self-host saat build), dan GA4 bila nanti dipasang. Rute media/CMS yang sudah menyetel header sendiri tidak boleh ditimpa dengan nilai lebih longgar.
11. `src/app/robots.js` dan `src/app/sitemap.js` (baru) serta kebijakan indeks per environment (bagian 8) -- mengubah `robots` di `src/app/(site)/layout.jsx` dan `src/features/public-site/components/PublishedContent.jsx` dari `noindex` tetap menjadi dikontrol env (staging selalu noindex). `metadataBase`/canonical dari `BETTER_AUTH_URL` atau env publik terpisah (jangan `NEXT_PUBLIC_*` untuk rahasia).
12. Tinjau `src/features/public-site/*` untuk teks/placeholder yang belum terverifikasi sebelum diindeks (alamat, harga, klaim).

QA:
13. Tambah tes unit untuk `getDatabaseConfig`/`getCmsDatabaseConfig`/`getAuthConfig`/`storageRoot` pada target baru (positif dan negatif, mis. host publik tak sah, non-https, path berbeda), tes runner migrasi produksi terhadap DB lokal sekali pakai, tes `/api/health`, tes header, tes `robots`/`sitemap`.

## 7. Dampak keamanan / RBAC

- RBAC server-side tidak berubah (Staff & Owner simpan langsung; hanya Owner hapus produk, kelola akun/sinkron merchant). Sinkron merchant tetap OFF; tidak ada panggilan live.
- Pemisahan hak DB dipertahankan: `web` hanya memegang `DATABASE_URL` (`_app`) dan `CMS_DATABASE_URL` (`_cms`); kredensial owner/migrator/admin hanya di operator/job migrasi, tidak pernah di service `web`, tidak di bundle klien (cek `scripts/check-public-bundle.mjs`).
- Secret: `BETTER_AUTH_SECRET` per environment, rotasi terdokumentasi (dampak: sesi tidak valid, kunci rate-limit berubah). Secret tidak di Git/log/test. Railway Variables dipakai; akses dashboard Railway dibatasi (2FA akun Railway wajib; keputusan user siapa saja yang punya akses).
- Cookie: `httpOnly`, `sameSite=lax`, `secure` otomatis karena origin HTTPS. Sesi maksimum 24 jam, idle 1 jam, diuji ulang di staging terhadap server (bukan hanya UI).
- CSRF: auth memeriksa `Origin === BETTER_AUTH_URL`; CMS memverifikasi `Origin` + `Sec-Fetch-Site`. Origin harus sama persis dengan domain publik final; test: permintaan dengan origin berbeda/host Railway internal ditolak.
- Rate limit: tersimpan di Postgres (tabel `cms_auth.request_limits`), HMAC dengan `BETTER_AUTH_SECRET`; tidak per-IP (B-12). Mitigasi tambahan di edge/Railway belum tersedia di kode dan ditandai sebagai risiko sisa; pertimbangkan perlindungan edge (mis. Cloudflare di depan domain) sebagai keputusan user.
- Proxy: `ipAddressHeaders: []` mencegah spoofing `X-Forwarded-For`; tidak boleh diubah tanpa review.
- Persistensi dan privasi media: file di volume `0o700`, disajikan hanya lewat `/media/[assetId]` dengan checksum dan header cache publik 3600 detik untuk media terbit; media admin `private, no-store`.
- GA4: tidak dipasang di spec ini; bila dipasang kemudian, hanya event niat pesan keluar tanpa PII dan CSP harus diperbarui.
- Audit dependensi: `npm audit --omit=dev --audit-level=high` ada di `security:check`; catatan SECURITY_AND_QA menyebut advisori dependensi pernah menjadi penghalang rilis, jadi hasil terbaru harus dijalankan ulang dan dilaporkan sebelum go-live.
- Secret scanning: pastikan `.env*`, `.media/`, `_export/` tidak ter-commit (`_export/` saat ini untracked di git status; jangan tambahkan tanpa tinjauan isinya).

## 8. SEO

- Saat ini seluruh situs `noindex,nofollow` (sengaja untuk pratinjau). Go-live produksi membutuhkan keputusan eksplisit: kapan `index,follow` aktif, dikendalikan env (`staging` selalu `noindex`).
- Hanya SEO bahasa Indonesia (ADR-038), `<html lang="id">`; tanpa `Restaurant`/`LocalBusiness` schema; hanya konten terverifikasi.
- `robots.txt`: staging `Disallow: /`; produksi mengizinkan publik, melarang `/admin`, `/api`. `sitemap.xml`: halaman publik terbit saja (bukan `/admin`, `/api`, `/media` mentah), canonical = domain produksi. Title/description memakai konten terbit; tidak ada alamat/harga/klaim yang belum diverifikasi.
- Redirect: domain `*.up.railway.app` di produksi tidak boleh terindeks; redirect/canonical ke domain utama (kebijakan di app atau Railway, ditentukan di tahap implementasi).
- Verifikasi: Lighthouse mobile >=90 (target QA, bukan janji), CWV baik, gambar kartu lewat optimizer lokal (`next.config.mjs` `images.localPatterns /media/**`, webp). Cache optimizer ada di `.next/cache` (efemeral, tidak kritis).

## 9. Backup, rollback, monitoring

- Backup Postgres: jadwal dump terenkripsi (`pg_dump` custom format) harian/mingguan ke penyimpanan di luar Railway (REQUIREMENTS menyebut backup mingguan satu-VPS sebagai risiko tinggi yang diterima; untuk Railway, simpan salinan di luar proyek). Fitur backup bawaan Railway (Postgres dan volume) perlu diverifikasi pada plan user sebelum diandalkan. Uji restore ke DB sementara sebelum go-live dan berkala (AC-18).
- Backup media: volume tidak otomatis ada di dump DB; rencana salinan berkala isi volume + manifest checksum (tabel `media_assets` menyimpan checksum untuk verifikasi pemulihan).
- Rollback aplikasi: redeploy ke deployment sebelumnya di Railway atau revert commit; DB tidak otomatis mundur. Rollback skema = restore backup (5.6). Jangan menjalankan migrasi baru bersamaan dengan rollback tanpa persetujuan.
- Rollback data konten: tidak ada hapus massal; hapus produk permanen (ADR-037) hanya Owner dan dicatat di `catalog_deletion_log`.
- Monitoring: healthcheck Railway, monitor uptime eksternal pada domain publik, notifikasi deploy gagal; metrik penggunaan volume/DB. Penyedia alert belum dipilih (pertanyaan terbuka).

## 10. Acceptance criteria

Kode/lokal (sebelum cloud):
- AC-1: Target baru (`staging`/`production`) hanya diterima untuk host/DB/role/origin yang cocok pola; semua input tak valid (host publik tak dikenal, HTTP non-lokal untuk auth, user admin `postgres`, password placeholder, query string tak diizinkan) ditolak; tes unit memuat kasus positif dan negatif; guard dev/test dan tes `test:db-config` tetap lulus tanpa perubahan perilaku.
- AC-2: `storageRoot` pada target non-lokal memakai `MEDIA_STORAGE_ROOT` absolut; upload, baca, hapus, dan integritas checksum lulus terhadap direktori sementara lokal; path traversal/symlink tetap ditolak.
- AC-3: `npm run build` selesai tanpa koneksi DB dan tanpa secret produksi (bukti: log build di staging dan lokal).
- AC-4: `/api/health` mengembalikan 200 tanpa informasi internal, `Cache-Control: no-store`, dan tidak menerima metode selain GET/HEAD.
- AC-5: Header keamanan hadir di respons halaman publik, `/admin`, API; CSP tidak memblokir fitur publik yang ada (uji E2E); `Strict-Transport-Security` hanya di produksi.
- AC-6: Runner migrasi produksi menolak: role yang salah, DB yang salah, DB berisi objek tak terduga, konfirmasi hilang, hash/jurnal tidak cocok; menerapkan 0000-0017 pada DB lokal kosong sekali-pakai dengan pra/pasca-cek lulus; idempotent pada state 18; tidak ada jalur reset konten.
- AC-7: Skema hasil runner produksi identik (diff dijelaskan nol atau hanya nama role) dengan DB dev pada 0017; matriks hak `_app` dan `_cms` terverifikasi oleh `verify*Protection`.

Staging:
- AC-8: Variabel wajib semua terisi; service `web` gagal start dengan pesan generik jika ada yang kurang atau tidak valid (tidak mencetak nilai).
- AC-9: Situs dapat diakses HTTPS; HTTP dialihkan; cookie sesi `Secure; HttpOnly; SameSite=Lax`.
- AC-10: Login, sesi 24 jam absolut + 1 jam idle (uji dengan menggeser waktu di DB uji), logout, ganti sandi, MFA Owner, penolakan Staff pada endpoint Owner-only, CSRF origin salah ditolak (403), rate limit login (429) berjalan pada staging.
- AC-11: Upload gambar via CMS tersimpan di volume, terbaca lewat `/media/[id]` dan optimizer gambar; setelah redeploy file tetap ada dan checksum cocok; media tidak terbit tidak dapat diakses publik.
- AC-12: Aksi simpan halaman/produk langsung tayang (ADR-036/037); hanya Owner yang dapat menghapus produk; tidak ada tombol/API sinkron merchant aktif; tautan order hanya untuk host allowlist.
- AC-13: Backup DB dibuat dan dipulihkan ke DB sementara dengan data konsisten; file volume dapat dipulihkan dan cocok checksum.
- AC-14: Staging `noindex` dan `robots.txt` melarang semua; tidak ada konten staging terindeks.
- AC-15: Suite rilis dijalankan terhadap build yang sama: lint, build, unit, integrasi, Playwright E2E, `security:check`, Lighthouse mobile (dilaporkan apa adanya). Semua hasil yang tidak dijalankan dilaporkan sebagai tidak dijalankan.

Produksi:
- AC-16: Seluruh AC-8 sampai AC-14 terulang pada produksi dengan secret dan DB berbeda dari staging (secret tidak dipakai ulang).
- AC-17: Migrasi produksi dijalankan hanya setelah persetujuan tertulis; pra-cek dicatat; backup sebelum-migrasi ada.
- AC-18: Owner pertama dibuat tanpa kredensial di log/Git/env service; MFA aktif; tidak ada akun default; skrip menolak bila Owner sudah ada.
- AC-19: Katalog terisi sesuai opsi 5.8 (39 produk, nama/harga cocok CSV sumber terverifikasi, foto sesuai produk, alt tidak kosong); tidak ada produk ganda; jumlah dan checksum foto cocok laporan dry-run staging; deskripsi dengan klaim belum terverifikasi kosong.
- AC-20: `robots.txt` dan `sitemap.xml` produksi sesuai bagian 8 dan indeks aktif hanya setelah user menyetujui konten; tidak ada `Restaurant`/`LocalBusiness`.
- AC-21: Rollback aplikasi diuji sekali di staging (redeploy versi sebelumnya) dan restore DB diuji.
- AC-22: Domain kustom + sertifikat valid; `BETTER_AUTH_URL` sama dengan origin domain publik; pengalihan dari domain Railway otomatis sesuai kebijakan.

## 11. Tugas per peran (setelah spec disetujui)

backend:
- `src/server/db/config.mjs`, `src/server/public/config.mjs`, `src/server/cms/request-policy.mjs`, `src/server/cms/runtime.mjs`, `src/server/auth/config.mjs`, `src/server/auth/runtime.mjs`, `src/server/media/storage.mjs` (target + host + origin + storage root, bagian 6 item 1-4).
- Runner migrasi + rencana pin: `scripts/migrate-production-db.mjs`, `scripts/lib/production-migration-plan.mjs`, (sesuai 5.3.1) varian SQL di `drizzle/` atau lokasi terpisah; `package.json` script `db:migrate:production`.
- Skrip provisioning DB (role/DB) produksi dan bootstrap Owner (`scripts/provision-production-account.mjs`, `src/server/auth/provision.mjs` bila perlu); prosedur pemulihan Owner.
- `src/app/api/health/route.js`.
- (Opsional) guard produksi importer `scripts/import-catalog-csv.mjs` (Opsi B).
- Dokumentasi runbook operator di `docs/` (oleh pihak berwenang; pm tidak menulis di luar `docs/specs/`).

frontend:
- `next.config.mjs` (`headers()`), `src/app/robots.js`, `src/app/sitemap.js`, `src/app/(site)/layout.jsx`, `src/features/public-site/components/PublishedContent.jsx` (robots per environment, canonical/metadataBase), tinjauan konten publik yang belum terverifikasi.

qa:
- Tes unit/integrasi untuk AC-1 s.d. AC-7 (`tests/unit/db-config.test.mjs` diperluas, tes baru untuk storage root, migrasi produksi, health, header, robots/sitemap), `scripts/security-check.mjs` diperluas (cek header, cookie, kebocoran env di bundle `scripts/check-public-bundle.mjs`).
- E2E Playwright terhadap URL staging (`tests/e2e`, konfigurasi `playwright.config.*` dengan base URL dari env), uji sesi/CSRF/rate limit/persistensi media/redeploy, Lighthouse mobile, audit `npm audit`.
- Menjalankan checklist go-live (12) dan melaporkan hasil sebenarnya.

## 12. Checklist go-live

- [ ] PR redesain ter-merge; commit/tag rilis ditentukan.
- [ ] ADR Railway dicatat; keputusan terbuka (bagian 14) dijawab user.
- [ ] Perubahan kode bagian 6 selesai dan lulus lint, build, unit, integrasi, E2E, security:check.
- [ ] Staging: AC-8 sampai AC-15 lulus; hasil dicatat.
- [ ] Persetujuan eksplisit developer untuk produksi dan untuk migrasi produksi (tertulis).
- [ ] Project/environment produksi dibuat; secret baru dihasilkan; 2FA akun Railway aktif.
- [ ] DB produksi: role dibuat; backup awal; pra-cek migrasi lulus; migrasi 0000-0017 sukses; pasca-cek dan diff skema lulus.
- [ ] Owner pertama dibuat; MFA aktif; kata sandi sementara diganti.
- [ ] Katalog 39 produk + foto terisi sesuai opsi yang dipilih dan diverifikasi manual terhadap sumber.
- [ ] Konten publik terverifikasi (tidak ada alamat/harga/klaim bahan/URL menu yang belum terverifikasi); tautan order sesuai allowlist.
- [ ] Domain kustom, HTTPS, `BETTER_AUTH_URL` cocok, header keamanan aktif.
- [ ] `robots.txt`/`sitemap.xml` sesuai keputusan indeks; Search Console (bila dipakai) diatur oleh user.
- [ ] Healthcheck, monitoring uptime, backup terjadwal, uji restore sukses.
- [ ] Rencana rollback (redeploy + restore) dipahami operator.
- [ ] Lighthouse mobile dan CWV dilaporkan apa adanya.

## 13. Asumsi

- Railway menyediakan jaringan privat antara `web` dan Postgres, mount volume untuk `web`, dan penerusan `PORT`; belum diverifikasi di akun user, dan fitur backup/limit plan juga belum diverifikasi.
- Satu replika `web` cukup untuk 1k-10k kunjungan/bulan; biaya total belum dihitung terhadap target IDR 250k/bulan (Railway berbasis pemakaian; tidak ada klaim biaya di spec ini).
- Nama role/DB/env di atas adalah usulan; nama final ditentukan backend setelah keputusan 5.3.1.
- `next build` tidak membutuhkan DB; harus dikonfirmasi (AC-3).
- Skrip PowerShell lokal (`setup-*.ps1`) tidak dapat dipakai untuk Railway; isinya tidak ditelusuri lebih jauh (pencarian kata kunci tidak menemukan pola yang diharapkan, kemungkinan encoding berbeda), sehingga matriks hak final diambil dari SQL `drizzle/0006-0016` oleh backend.

## 14. Pertanyaan terbuka / keputusan user

1. Penamaan role vs SQL migrasi (5.3.1): Opsi P, Q, atau R? (Rekomendasi: P.)
2. Penyimpanan media: volume Railway (rekomendasi) atau object storage (butuh adapter + dependency baru)?
3. Cara mengisi 39 produk + foto (5.8): A, B, C, atau D? (Rekomendasi: A atau B dengan dry-run staging.)
4. Domain produksi dan region; apakah staging dibatasi akses (basic auth/IP) atau cukup `noindex`?
5. Kapan indeks mesin pencari diaktifkan (bagian 8)? Sumber konten terverifikasi (alamat, jam buka, harga, URL menu) siapa dan kapan?
6. Akses operator ke DB: shell dalam jaringan privat (rekomendasi) atau TCP proxy publik sementara?
7. Penyedia email transaksional (untuk reset sandi dan verifikasi): dipilih sekarang atau go-live tanpa email dengan prosedur pemulihan operator?
8. Kebijakan kata sandi (minimum saat ini 6 karakter) dan kewajiban MFA untuk Owner di produksi?
9. Mitigasi rate limit per IP/edge (B-12): terima risiko, atau tambah perlindungan edge (mis. CDN/WAF)?
10. Penyimpanan backup di luar Railway dan jadwalnya; siapa pemegang kredensial Railway/operator?
11. ShopeeFood: host resmi allowlist masih kosong, tetap kosong saat go-live?
12. Upload video di produksi: tetap nonaktif (tanpa ffmpeg), atau dipasang ffmpeg di image (butuh review)?
13. Boleh dicatat ADR baru (hosting Railway, target `production`/`staging`, penyimpanan media) agar tidak bertentangan dengan asumsi VPS di REQUIREMENTS/DECISIONS?

## 15. Ringkasan

Blocker kode: B-1 (DB publik loopback), B-2 (CMS loopback/target), B-3 (auth origin localhost), B-4 (media target + disk efemeral), B-5 (role di SQL 0006-0016), B-6 (tidak ada runner migrasi produksi/DB kosong), B-7 (bootstrap Owner), B-8 (healthcheck), B-9 (email belum ada), B-10 (noindex menyeluruh dan header keamanan), B-11 (importer menolak produksi), B-12 (rate limit bukan per-IP).
Keputusan yang diperlukan dari user: penamaan role (P/Q/R), penyimpanan media, cara isi katalog (A/B/C/D), akses operator DB, domain/region/akses staging, kebijakan indeks SEO, email dan kebijakan sandi/MFA, mitigasi edge, backup eksternal, ADR Railway.
Tidak ada aksi cloud, migrasi, atau perubahan kode yang dilakukan; semua menunggu persetujuan.
