# Spec: Pemulihan riwayat migrasi Drizzle di database Railway STAGING

Status: DRAF, menunggu persetujuan user. Belum ada kode, migrasi, atau aksi cloud yang dijalankan. Dokumen ini hanya rencana.

Dasar (AGENTS.md): tidak ada migrasi/aksi cloud tanpa persetujuan eksplisit; runner migrasi tidak pernah reset/repair/hapus; rahasia hanya di env server; deploy hanya setelah persetujuan developer. ADR-036/037/038/040 tidak terpengaruh. Hasil Grep `docs/DECISIONS.md`: tidak ada ADR yang mengatur penulisan metadata migrasi di luar runner resmi. ADR-039 (baris ~1591) hanya menyatakan migrasi produksi butuh ADR, backup, dan persetujuan terpisah, dan "hash lama TIDAK boleh ditulis ulang". Dokumen runbook (`docs/runbooks/mcp-deploy.md`) menyatakan rollback skema remote hanya lewat restore backup, tanpa DROP otomatis. Lihat bagian 9 untuk konflik/keputusan yang perlu persetujuan.

---

## 1. Masalah & tujuan

Database `tiny_osaka_staging` di Railway berisi bentuk hasil migrasi resmi 0000-0017 (31 tabel `public` + 9 tabel `cms_auth`, semua dimiliki `tiny_osaka_staging_owner`), tetapi schema `drizzle` (tabel `__drizzle_migrations`) TIDAK ada. `scripts/migrate-production-db.mjs` menolak karena `validateRemoteMigrationState` (`scripts/lib/production-migration-plan.mjs:57-61`) menganggap DB tanpa riwayat harus kosong. Akibatnya migrasi 0018 (OAuth MCP) dan 0019 (mcp_uploads) tidak bisa diterapkan lewat runner resmi.

Ada data yang HARUS DIJAGA (terverifikasi read-only oleh user): `pages` 8 baris, `media_assets` 31, `cms_auth.users` 1. Asal-usul state ini tidak diketahui; keberadaan backup tidak diketahui.

Tujuan: memulihkan `drizzle.__drizzle_migrations` (18 entri, 0000-0017) tanpa menyentuh tabel/data aplikasi, lalu memakai runner resmi untuk dry-run dan `--apply` 0018-0019 dalam satu transaksi.

## 2. Keputusan user yang sudah ada (opsi 1)

Pulihkan riwayat dengan hash dan `created_at` dari `drizzle-remote/meta/_journal.json` (via `remoteMigrations` di `production-migration-plan.mjs`), schema dan tabel dimiliki `*_owner`, struktur sama dengan yang dibuat `migrate-production-db.mjs` baris 113-114. Lalu runner resmi: dry-run (menjalankan `verifyBase`) kemudian `--apply` dengan `TINY_OSAKA_CONFIRM_PRODUCTION_MIGRATION=staging-0019`.

## 3. Scope

1. Skrip sekali-pakai yang direview untuk membuat schema `drizzle` + tabel `__drizzle_migrations` dan mengisi 18 baris riwayat, hanya untuk target `staging`.
2. Verifikasi struktur DB terhadap bentuk 0000-0017 sebelum menulis apa pun, dan verifikasi bahwa data tidak berubah sesudahnya.
3. Prosedur operator: backup, kredensial migrator, restore riwayat, dry-run runner, apply 0018-0019, verifikasi, rollback.
4. Unit test untuk logika validasi murni skrip.

## 4. Out of scope

- Mengubah `scripts/migrate-production-db.mjs`, `production-migration-plan.mjs`, `drizzle/`, `drizzle-remote/`, atau hash di `remoteMigrations`. Runner resmi tidak dilonggarkan (tidak ada mode "adopsi" di runner).
- Target `production` (skrip menolak). Produksi tetap butuh ADR, backup, dan persetujuan terpisah.
- Reset, repair, atau penghapusan tabel/data/role; perubahan tabel `public`/`cms_auth`; perubahan hak role app/cms.
- Memperbaiki penyebab hilangnya riwayat (tidak diketahui) dan menyelidiki asal-usul 8 halaman/31 media/1 user.
- Memperbarui `docs/runbooks/railway-staging.md` yang basi (masih menyebut 0000-0017 / `staging-0017`; kini runner 0000-0019 / `staging-0019`). Dicatat sebagai tindak lanjut terpisah, butuh persetujuan.
- Aksi merchant, perubahan kode aplikasi, frontend.

## 5. Pendekatan

### 5.1 Skrip sekali-pakai

- File baru `scripts/restore-staging-migration-history.mjs` (tanpa entri di `package.json`, dijalankan langsung dengan `node`), logika murni di `scripts/lib/restore-migration-history-plan.mjs`.
- Dry-run adalah default (hanya baca, cetak rencana). Menulis hanya dengan `--apply` DAN `TINY_OSAKA_CONFIRM_HISTORY_RESTORE=staging-0017` (nilai persis; salah = tolak sebelum koneksi).
- Hanya `--target staging`; `production` ditolak. Memakai `resolveTarget` dan `connectRemoteOwner` yang ada (koneksi sebagai `*_migrator` lewat `MIGRATION_DATABASE_URL`, lalu `SET ROLE tiny_osaka_staging_owner`, sehingga schema/tabel/sequence/pkey dimiliki owner). Memakai advisory lock yang sama (`76210983`) agar tidak bentrok dengan runner.
- Memakai `remoteMigrations` (18 entri pertama) sebagai satu-satunya sumber hash dan `created_at`; sebelum apa pun memanggil `validateRemoteMigrationFiles` terhadap `drizzle-remote` dan memastikan salinan = hasil transform seperti runner (jangan menulis hash dari tempat lain).
- Penolakan (tanpa mengubah apa pun): (a) schema `drizzle` sudah ada (kondisi apa pun, termasuk kosong); (b) struktur `public`/`cms_auth` tidak cocok 0000-0017; (c) objek tak terduga; (d) kepemilikan bukan `*_owner`; (e) peran/isolasi PUBLIC app/cms menyimpang (pra-cek seperti `precheckRoles` runner); (f) `cms_auth.oauth_clients` atau `cms_auth.mcp_uploads` sudah ada (berarti bukan state 0017).
- Pengecekan struktur "cocok 0000-0017" (usulan, harus sama ketatnya dengan runner): daftar tabel `public` = `tablesForState(18)`, semua `kind='r'` dan owner `*_owner`; 9 tabel `cms_auth` persis; plus verifier yang sudah ada dipanggil dengan opsi bentuk 0017: `verifyCatalogProtection(client, owner, 18)`, `verifyPageProtection`, `verifyMediaProtection({posterRead:true})`, `verifyPublicReadProtection({media:true, preDrop:false, orderLinks:true})`, `verifyAuthProtection({mcp:false})`, `verifyCmsProtection`, `verifyPublishingProtection({identityRestrict:true})`, `verifyLanguageColumnsRemoved`. ASUMSI A-3: verifier ini menerima bentuk 0017 dengan opsi tersebut (belum dibuktikan; backend harus membuktikan lewat dry-run/test, dan jika ada yang gagal pada DB yang sebenarnya bentuk 0017, STOP dan laporkan, jangan melonggarkan verifier).
- Penulisan dalam SATU transaksi: `BEGIN` -> `CREATE SCHEMA "drizzle"` -> `CREATE TABLE "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)` (identik baris 113-114 runner) -> `INSERT` 18 baris berurutan (`hash`, `created_at` = `folderMillis`) -> verifikasi memakai `validateRemoteMigrationState` (harus mengembalikan 18, termasuk owner schema, nama relasi `__drizzle_migrations`, `_id_seq`, `_pkey`) -> verifikasi hitung baris data tidak berubah -> `COMMIT`; gagal = `ROLLBACK`.
- Tidak menyentuh tabel/data: tidak ada `INSERT/UPDATE/DELETE/ALTER/DROP` pada `public`/`cms_auth`. Hitung baris dibaca sebelum dan sesudah untuk tabel yang dijaga (`pages`, `media_assets`, `cms_auth.users`) dan seluruh tabel lain; selisih apa pun = `ROLLBACK`.
- Tidak mencetak kredensial, URL, atau error mentah (pola pesan sama seperti runner).
- Idempoten secara aman: dijalankan lagi sesudah sukses akan ditolak oleh aturan (a) dan menyarankan runner resmi.

### 5.2 Mengapa bukan jalur lain (alternatif, sudah ditolak user atau tidak dipilih)

| Alternatif | Alasan tidak dipilih |
|------------|----------------------|
| Menambahkan mode "adopsi" ke runner resmi | Melonggarkan guard "tanpa riwayat DB harus kosong" untuk semua target; perubahan permanen pada pengaman produksi |
| `psql` manual oleh admin `postgres` | Tidak direview/diuji, tidak ada verifikasi struktur, rawan salah owner |
| Drop + migrasi ulang 0000-0019 dari kosong | Menghapus 8 halaman/31 media/1 user; ditolak oleh syarat menjaga data |

## 6. Backup (WAJIB sebelum langkah apa pun yang menulis)

Status fakta: tidak diketahui apakah backup lama ada. Runbook Langkah 20 mencatat plan trial Railway tidak mendukung backup Postgres maupun volume (butuh Pro); belum diverifikasi apakah plan sekarang berubah. `pg_dump` di container `ops` belum dicek keberadaannya (jangan memasang paket di container).

Urutan opsi (operator memilih yang pertama yang terverifikasi tersedia; tanda ASUMSI sampai dibuktikan):

1. Backup bawaan Railway (Dashboard -> `Postgres` -> Backups) bila plan mendukung dan tombol tersedia. ASUMSI B-1: mungkin tidak tersedia. Hasil yang diharapkan: ada entri backup bertanggal; arti hasil berbeda: tombol terkunci/butuh Pro = opsi ini tidak tersedia, lanjut opsi 2.
2. `pg_dump -Fc` dari `ops` bila `which pg_dump` menemukan biner. ASUMSI B-2. Syarat: versi `pg_dump` >= versi server (cek `SHOW server_version`); output di `/tmp` hanya sementara dan harus disalin keluar Railway (container efemeral). Belum ada mekanisme salin keluar yang terverifikasi (lihat pertanyaan Q-3).
3. `pg_dump -Fc` dari laptop lewat TCP proxy publik Railway yang dibuka SEMENTARA. Menyalahi aturan "TCP proxy publik dimatikan" (deploy-railway.md 5.1) kecuali ada persetujuan khusus; harus ditutup lagi sesudahnya. ASUMSI B-3: memakai kredensial admin; butuh persetujuan terpisah.
4. Cadangan minimum (fallback, BUKAN pengganti penuh): ekspor baca-saja tiga tabel yang dijaga (`pages`, `media_assets`, `cms_auth.users`) ke JSON/CSV di luar Railway lewat skrip baca-saja. Tidak memulihkan skema/relasi/hak; hanya melindungi data inti. Tetap perlu persetujuan user untuk menerima backup parsial.

Catatan: berkas media ada di volume service `web`, bukan di DB; migrasi ini tidak menyentuh volume. Backup volume dicatat sebagai tidak tersedia pada trial (risiko diterima sebelumnya) kecuali dibuktikan lain.

Gerbang: skrip restore dan `--apply` runner TIDAK boleh dijalankan sebelum operator menulis bukti backup (jenis, waktu, lokasi, ukuran/jumlah baris tabel, lulus cek integritas: `pg_restore --list` untuk dump, atau hitung baris untuk ekspor). Tanpa backup yang terverifikasi, keputusan melanjutkan ada di user (risiko dinyatakan eksplisit); PM tidak dapat menyetujuinya.

## 7. Kredensial migrator

Fakta: password role `tiny_osaka_staging_migrator` tidak diketahui; `MIGRATION_DATABASE_URL` belum ada di service `ops`; file `/tmp/staging-db.env` (dibuat oleh `provision-railway-db.mjs`, mode 0600, berisi `DATABASE_URL`, `CMS_DATABASE_URL`, `MIGRATION_DATABASE_URL`) belum dicek.

Langkah dan keputusan:

1. Cek keberadaan file (read-only) di `ops`: `ls -l /tmp/staging-db.env` dan `grep -c '^MIGRATION_DATABASE_URL=' /tmp/staging-db.env` (jangan mencetak isinya). Container efemeral: file kemungkinan hilang bila `ops` pernah restart/redeploy (ASUMSI K-1). Periksa juga manajer kata sandi user dan Variables environment staging (runbook Langkah 11 menyuruh menyimpannya).
2. Jika URL ditemukan: pasang sebagai `MIGRATION_DATABASE_URL` hanya di service `ops` (bukan `web`), deploy perubahan variabel, verifikasi `env | grep -c '^MIGRATION_DATABASE_URL='` = `1`. Username harus `tiny_osaka_staging_migrator`, host `*.railway.internal` (dipaksa guard `railway-db.mjs`).
3. Jika hilang: satu-satunya jalan adalah mengatur ulang password lewat admin: `ALTER ROLE tiny_osaka_staging_migrator PASSWORD '<baru>'` memakai `RAILWAY_ADMIN_DATABASE_URL`. Konsekuensi: (a) hanya mengubah role migrator; `web` memakai role app/cms sehingga tidak terganggu; (b) password lama (tak dikenal) tidak lagi berlaku; (c) password baru dibuat acak di sisi operator (mis. 32 byte hex), tidak dicetak ke log/chat, disimpan di manajer kata sandi dan Variables `ops`; (d) `ALTER ROLE` tidak boleh mengubah atribut lain (NOLOGIN, membership SET-only pada owner, conn limit). Ini PERUBAHAN TERPISAH yang butuh persetujuan eksplisit user (keputusan D-2) dan tidak termasuk skrip restore. Cara mengeksekusinya (psql/skrip) ditentukan pada saat persetujuan; spec ini tidak menyediakan kode untuk itu (Q-4).
4. Sesudah selesai, hapus `MIGRATION_DATABASE_URL` dan `RAILWAY_ADMIN_DATABASE_URL` dari `ops` (runbook Langkah ~384) atau hapus service `ops`.

## 8. Urutan langkah operator (setelah spec disetujui dan skrip selesai direview)

Setiap langkah: aksi -> hasil yang diharapkan -> arti hasil berbeda. Semua di shell `ops` kecuali dinyatakan lain.

| # | Aksi | Hasil yang diharapkan | Jika berbeda |
|---|------|----------------------|--------------|
| 1 | Sisi developer: `npm run db:remote-sql:check`, `npm run lint`, test unit baru lulus; skrip direview user | Semua lulus | Gagal = jangan lanjut; perbaiki di sisi backend |
| 2 | Cek `/tmp/staging-db.env` / kredensial (bagian 7) | Ada satu `MIGRATION_DATABASE_URL` migrator | Tidak ada = ke 7.3, butuh persetujuan D-2 |
| 3 | Backup (bagian 6) dan catat bukti | Bukti backup terverifikasi | Tidak ada backup = STOP, minta keputusan user |
| 4 | Catat hitungan baris awal: `pages`=8, `media_assets`=31, `cms_auth.users`=1 (lewat dry-run skrip) | Sama dengan fakta user | Angka berbeda = state berubah sejak pengecekan; STOP, laporkan |
| 5 | `node scripts/restore-staging-migration-history.mjs --target staging` (dry-run) | Pesan peran/isolasi terverifikasi, "schema drizzle tidak ada", struktur 0000-0017 cocok, dan "dry-run OK: akan menulis 18 baris riwayat" | Pesan "Refusing": baca pesannya; struktur tidak cocok = DB bukan bentuk 0017, JANGAN paksa; schema sudah ada = riwayat tidak lagi hilang, pakai runner resmi |
| 6 | `TINY_OSAKA_CONFIRM_HISTORY_RESTORE=staging-0017 node scripts/restore-staging-migration-history.mjs --target staging --apply` | "restored 18 history rows"; hitungan data tidak berubah | Gagal = transaksi dibatalkan, tidak ada perubahan; laporkan pesan, jangan ulang berkali-kali |
| 7 | `npm run db:migrate:production -- --target staging` (dry-run runner) | `dry-run OK. Database is at 0000-0017; --apply would apply 0018-0019 in ONE transaction.` (menjalankan `verifyBase`) | "Refusing" = riwayat/struktur tidak cocok; STOP, laporkan |
| 8 | `TINY_OSAKA_CONFIRM_PRODUCTION_MIGRATION=staging-0019 npm run db:migrate:production -- --target staging --apply` | `applied 0018-0019; 31 public and 14 auth tables owned by tiny_osaka_staging_owner.` | Gagal = transaksi dibatalkan, riwayat tetap 18 baris; laporkan pesan |
| 9 | Ulang tanpa `--apply` | `reviewed 0000-0019 already applied and verified; no changes made.` | Pesan lain = verifikasi akhir gagal; STOP |
| 10 | Verifikasi data: `pages`=8, `media_assets`=31, `cms_auth.users`=1; login Owner staging; halaman publik staging terbuka | Sama seperti awal; aplikasi normal | Berbeda = invoke rollback (bagian 10) |
| 11 | Bersihkan kredensial migrator/admin dari `ops` (bagian 7.4) | Variabel tidak ada | Sisa = ancaman keamanan, hapus segera |

## 9. Konflik dan keputusan yang butuh persetujuan user

- Tidak ada ADR yang melarang menyentuh metadata migrasi, tetapi AGENTS.md menyatakan runner "tidak pernah reset/repair/hapus" dan ADR-039 mensyaratkan hash lama tidak ditulis ulang. Skrip ini menulis metadata di LUAR runner resmi; ini pengecualian sekali-pakai untuk staging saja dan DIANGGAP PERUBAHAN yang butuh persetujuan eksplisit user (D-1). Mitigasi: hash hanya dari `remoteMigrations` yang terkunci, tidak ada hash baru, struktur diverifikasi dulu, hanya staging, dry-run default.
- Risiko kebenaran: menulis riwayat berarti MENYATAKAN bahwa DB adalah 0017. Jika DB hanya mirip (mis. beda halus pada fungsi/hak), migrasi 0018-0019 dan migrasi berikutnya berjalan di atas dasar yang salah. Karena itu pengecekan struktur diwajibkan (5.1), dan opsional (D-3) perbandingan `pg_dump --schema-only` DB staging terhadap DB dari migrasi resmi 0000-0017 yang bersih (mis. dari DB test lokal) dengan diff yang dijelaskan.
- D-2: setuju mengatur ulang password migrator via admin jika kredensial hilang (aksi cloud terpisah).
- D-4: backup mana yang diterima, termasuk apakah backup parsial (opsi 4) cukup atau akses TCP proxy sementara (opsi 3) diizinkan.

## 10. Rencana rollback

- Sebelum `COMMIT` skrip restore atau runner: otomatis `ROLLBACK` (satu transaksi), DB kembali persis seperti sebelumnya.
- Sesudah restore riwayat sukses tetapi sebelum 0018-0019 (langkah 6-7 gagal): riwayat bersifat aditif. Kembali ke keadaan semula = admin `postgres` menjalankan `DROP SCHEMA drizzle CASCADE` (hanya setelah verifikasi bahwa schema itu berisi tabel riwayat saja). Tidak menyentuh data aplikasi. Butuh persetujuan karena aksi admin destruktif pada metadata.
- Sesudah apply 0018-0019 sukses: tidak ada DROP otomatis (`docs/runbooks/mcp-deploy.md`). Kode lama tetap berjalan karena tabel baru tidak dipakainya. Jika perlu mundur total: restore dari backup langkah 3 (butuh persetujuan; hanya bila data aplikasi rusak). Rollback parsial 0018-0019 = menghapus tabel `cms_auth.oauth_*`, `mcp_audit`, `mcp_uploads` dan dua baris riwayat; tidak diotomatisasi, butuh persetujuan terpisah.
- Jika data berubah tak terduga: STOP, jangan menulis lagi, pulihkan dari backup yang terverifikasi.

## 11. Risiko

| ID | Risiko | Mitigasi |
|----|--------|----------|
| R-1 | Tidak ada backup yang bisa diverifikasi (trial tanpa backup; `pg_dump` mungkin tidak ada) | Gerbang backup; opsi 1-4; keputusan user D-4 |
| R-2 | Riwayat dinyatakan 0017 padahal struktur sedikit berbeda | Verifier lengkap + opsional diff schema-only (D-3) |
| R-3 | Asal-usul state tidak diketahui; mungkin ada proses lain menulis ke DB | Kunci advisory, hitung baris sebelum/sesudah, jendela operasi singkat |
| R-4 | Kebocoran kredensial (password baru/URL) di log, chat, atau variabel `web` | Tidak dicetak; hanya di `ops`; hapus sesudahnya; `check-railway-env.mjs` menolak `MIGRATION_DATABASE_URL` di `web` |
| R-5 | Salah target (production) | Skrip menolak selain staging; konfirmasi persis `staging-0017` |
| R-6 | Dokumen runbook basi menyesatkan operator berikutnya | Tindak lanjut terpisah (di luar scope) |

## 12. Acceptance criteria

- AC-1: Tanpa `--apply` skrip hanya membaca; tidak ada perubahan pada DB (dibuktikan test unit dan dry-run nyata).
- AC-2: `--apply` tanpa `TINY_OSAKA_CONFIRM_HISTORY_RESTORE=staging-0017` persis ditolak sebelum koneksi DB dibuat.
- AC-3: `--target production` atau target selain `staging` ditolak.
- AC-4: Skrip menolak (tanpa menulis) bila schema `drizzle` sudah ada, bila daftar tabel/owner/kind tidak sama dengan state 18, bila ada objek tak terduga, bila `oauth_clients`/`mcp_uploads` ada, atau bila verifier struktur gagal.
- AC-5: Setelah `--apply` sukses, `drizzle.__drizzle_migrations` berisi tepat 18 baris, hash dan `created_at` sama dengan `remoteMigrations[0..17]`, schema `drizzle` dan tabelnya/sequence/pkey dimiliki `tiny_osaka_staging_owner`, dan `validateRemoteMigrationState` mengembalikan 18.
- AC-6: Seluruh penulisan dalam satu transaksi; kegagalan di titik mana pun menghasilkan `ROLLBACK` dan DB tanpa schema `drizzle`.
- AC-7: Tidak ada perubahan pada tabel `public`/`cms_auth`; hitungan baris `pages`=8, `media_assets`=31, `cms_auth.users`=1 (dan semua tabel lain) sama sebelum dan sesudah; selisih memicu `ROLLBACK`.
- AC-8: Skrip tidak mencetak kredensial, URL koneksi, atau error mentah.
- AC-9: Tidak ada file yang berubah di `drizzle/`, `drizzle-remote/`, `scripts/migrate-production-db.mjs`, `scripts/lib/production-migration-plan.mjs`, `package.json`, atau `src/`.
- AC-10: Runner resmi tanpa `--apply` mencetak dry-run OK untuk state 0000-0017 (menjalankan `verifyBase`); dengan `--apply` + `staging-0019` menerapkan 0018-0019 dalam satu transaksi dan menjalankan `verifyFinal`; menjalankannya lagi mencetak `already applied and verified`.
- AC-11: Sesudah seluruh prosedur, `pages`=8, `media_assets`=31, `cms_auth.users`=1 tetap; login Owner staging dan halaman publik staging berfungsi (dicek operator, bukan oleh agen).
- AC-12: Bukti backup terverifikasi dicatat sebelum langkah penulisan pertama; tanpa itu operator tidak melanjutkan tanpa keputusan tertulis user.
- AC-13: `npm run lint` dan test unit untuk modul validasi baru lulus (hasil perintah nyata dilaporkan).

## 13. Dampak keamanan/RBAC, SEO, merchant sync

- Keamanan: aksi database operator di luar RBAC aplikasi; memakai role migrator minimal + `SET ROLE` owner (guard yang sudah ada). Rahasia hanya di `ops`, tidak di `web`, tidak di Git/log/test. Perubahan password migrator (jika perlu) adalah aksi admin terpisah dan butuh persetujuan.
- SEO: tidak ada.
- Merchant sync: tidak ada; tidak ada panggilan endpoint merchant.
- Data pribadi: 1 baris `cms_auth.users` tersentuh hanya sebagai hitungan; isinya tidak dibaca atau dicetak.

## 14. Tugas per peran

backend (satu-satunya peran yang perlu bekerja):
- Buat `scripts/restore-staging-migration-history.mjs` dan `scripts/lib/restore-migration-history-plan.mjs` (validasi murni: target, konfirmasi, state objek, hitungan baris; tanpa I/O).
- Buat `tests/unit/restore-migration-history-plan.test.mjs` (mengikuti gaya `tests/unit/production-migration-plan.test.mjs`): target ditolak, konfirmasi salah, schema ada, tabel hilang/lebih, owner salah, relasi tak terduga, oauth/mcp ada, hitungan baris berubah, hash dari `remoteMigrations`.
- Impor, jangan ubah: `scripts/lib/railway-db.mjs`, `production-migration-plan.mjs`, `dev-migration-plan.mjs` (`tablesForState`), `*-protection.mjs`, `apply-reviewed-migration.mjs`.
- Jalankan `npm run lint`, test unit baru, `npm run db:remote-sql:check`; laporkan hasil nyata. TIDAK menjalankan skrip terhadap Railway; operator/user yang menjalankan.

frontend: tidak perlu. 

qa: hanya jika diminta user (review skrip, uji coba pada DB lokal yang meniru state 0017 tanpa schema `drizzle`, bukan Railway).

## 15. File yang akan dibuat/diubah

Dibuat:
- `scripts/restore-staging-migration-history.mjs`
- `scripts/lib/restore-migration-history-plan.mjs`
- `tests/unit/restore-migration-history-plan.test.mjs`

Tidak diubah: `scripts/migrate-production-db.mjs`, `scripts/lib/production-migration-plan.mjs`, `drizzle/`, `drizzle-remote/`, `package.json`, `src/`, `docs/DECISIONS.md`.
Opsional (butuh persetujuan terpisah): entri ADR di `docs/DECISIONS.md` untuk pengecualian D-1; pembaruan `docs/runbooks/railway-staging.md`.

## 16. Asumsi dan pertanyaan terbuka

Asumsi (belum terverifikasi):
- A-1: Bentuk DB benar-benar sama dengan hasil migrasi resmi 0000-0017 (klaim user dari pengecekan jumlah tabel/owner; verifier lengkap akan membuktikan).
- A-2: Migrator punya hak `SET ROLE` ke owner dan owner boleh `CREATE SCHEMA` di DB (dijamin guard `connectRemoteOwner`; provisioning asli sama).
- A-3: Verifier `*-protection` menerima bentuk 0017 dengan opsi yang dipakai di 5.1.
- B-1/B-2/B-3: ketersediaan backup Railway, `pg_dump` di `ops`, dan akses TCP proxy (lihat bagian 6).
- K-1: `/tmp/staging-db.env` kemungkinan hilang.
- Tidak ada proses lain yang menulis ke DB staging selama operasi.

Pertanyaan terbuka:
- Q-1 (D-1): Setujukah skrip sekali-pakai ini sebagai pengecualian terbatas (staging saja) terhadap "metadata migrasi hanya lewat runner"? Perlu ADR kecil?
- Q-2 (D-3): Perlu perbandingan skema-saja dengan DB migrasi bersih sebagai bukti tambahan sebelum menulis riwayat?
- Q-3 (D-4): Opsi backup mana yang dipakai; bagaimana dump dikeluarkan dari container `ops`; apakah plan Railway sudah Pro?
- Q-4 (D-2): Jika kredensial migrator hilang, setujukah `ALTER ROLE ... PASSWORD`, dan siapa/bagaimana mengeksekusinya (ops dengan admin URL)?
- Q-5: Apakah data staging (8 halaman, 31 media, 1 user) boleh dibuang bila sebenarnya hanya data uji? (Jika ya, jalur "drop + migrasi ulang dari kosong" jauh lebih sederhana dan tidak butuh pengecualian runner. Spec ini mengikuti keputusan user: data dijaga.)
- Q-6: Apakah berkas media 31 aset ada di volume `web` dan tetap konsisten dengan `media_assets`? (Tidak diubah oleh prosedur ini.)
