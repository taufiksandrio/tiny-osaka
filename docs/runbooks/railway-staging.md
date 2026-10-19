# Runbook: Menyiapkan STAGING Tiny Osaka di Railway

Status: draf operator. Dokumen ini hanya panduan; tidak ada aksi cloud yang sudah dijalankan. Dasar: `docs/specs/deploy-railway.md`, `railway.json`, `scripts/check-railway-env.mjs`, `scripts/provision-railway-db.mjs`, `scripts/migrate-production-db.mjs`, `scripts/provision-production-account.mjs`, `scripts/lib/railway-db.mjs`, `.env.example`.

Nama menu Railway bisa berbeda dari tulisan di sini (tampilan sering berubah). Bila menu tidak ketemu, pakai tombol pencarian/palet perintah (tekan `Ctrl+K` di dashboard) atau lihat petunjuk "Jika beda".

Aturan umum untuk semua langkah:
- Jangan pernah menempel kata sandi, URL database, atau secret ke chat, issue, Git, atau screenshot.
- Tanda `<...>` adalah placeholder yang Anda isi sendiri.
- Bila hasil tidak sama dengan "Hasil yang diharapkan", ikuti kotak BERHENTI dan laporkan (kirim pesan galat tanpa rahasia).

---

## A. Masalah ayam-telur dan solusinya

Masalah: service `web` memakai start command `npm run start:railway`, yang menjalankan `scripts/check-railway-env.mjs` dulu. Skrip itu keluar (exit 1) bila variabel belum lengkap, volume belum terpasang, atau bila ada kredensial operator di service `web`. Padahal variabel `DATABASE_URL` dan `CMS_DATABASE_URL` baru ada setelah `db:provision:railway` dijalankan, dan skrip itu harus jalan dari dalam jaringan privat Railway (host `*.railway.internal`).

Hasil analisis kode:
- `railway run` hanya menjalankan perintah di komputer Anda dengan variabel Railway. Host `postgres.railway.internal` tidak bisa dijangkau dari luar Railway, jadi `railway run` TIDAK bisa dipakai untuk provisioning/migrasi. TCP proxy publik tidak dipakai (keputusan Anda).
- `railway ssh` masuk ke container yang sedang HIDUP. Service `web` tidak hidup (crash, fail-closed) sehingga tidak bisa di-ssh. Gerbang start sengaja tidak boleh dilonggarkan.
- Skrip provision (`provision-railway-db.mjs`) menerima `RAILWAY_ADMIN_DATABASE_URL`, dan `check-railway-env.mjs` melarang variabel itu ada di `web`. Jadi skrip harus jalan di service lain.

Solusi yang dipilih: service terpisah bernama `ops` di environment staging yang sama.
- Sumber: repo yang sama (supaya `scripts/`, `drizzle-remote/`, `node_modules` ada).
- Start command: `sleep infinity` (proses menahan container tetap hidup, tidak menjalankan aplikasi).
- Tanpa domain publik, tanpa healthcheck.
- Hanya `ops` yang memegang `RAILWAY_ADMIN_DATABASE_URL` dan `MIGRATION_DATABASE_URL`. `web` tidak pernah.
- Dari laptop: `railway ssh` ke `ops` lalu menjalankan skrip di dalamnya (berada di jaringan privat, jadi host `.railway.internal` valid).
- Setelah selesai, `ops` dihapus (atau minimal variabel adminnya dihapus).

### BLOCKER B-OPS (perlu perubahan kode kecil, belum dikerjakan)

`railway.json` di repo berlaku untuk SEMUA service yang dibangun dari repo ini, dan pengaturan di file mengalahkan pengaturan di dashboard (Railway "config as code"). Akibatnya service `ops` juga akan memakai `npm run start:railway` + healthcheck `/api/health`, lalu crash. Dashboard saja tidak cukup.

Perubahan kecil yang dibutuhkan (oleh agen backend, setelah Anda setujui, lalu di-merge ke `main`): tambah file `railway.ops.json` di root repo:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "deploy": {
    "startCommand": "sleep infinity",
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

(tanpa `healthcheckPath`). Service `ops` lalu diarahkan ke file ini lewat Settings, kolom "Config as Code / Railway Config File" = `/railway.ops.json` (Langkah 7). File ini bukan bagian runbook; jangan dibuat manual di runbook ini.

Fallback bila perubahan kode ditolak (lebih manual, bukan rekomendasi): service `ops` dibuat dari Docker image `node:22-bookworm` (bukan dari repo) dengan start command `sleep infinity`; di dalam shell-nya `git clone` repo lalu `npm ci --omit=dev`. Ini butuh repo bisa di-clone dari container (repo publik atau token GitHub, yang berarti ada rahasia tambahan) dan `git` terpasang. Jangan pakai fallback ini tanpa persetujuan eksplisit, dan jangan menempel token di chat.

PENTING: Langkah 7 sampai seterusnya BERGANTUNG pada B-OPS. Selesaikan Langkah 1 sampai 6 dulu, lalu pastikan `railway.ops.json` sudah ada di `main`.

---

## B. Biaya (catat, jangan diasumsikan)

Sisa trial Anda sekitar $4,98 / 29 hari. Railway menagih berdasarkan pemakaian. Yang makan biaya terus-menerus di staging:
- Service `web` (selalu hidup).
- Service Postgres (selalu hidup).
- Volume media (biaya per GB per bulan; ukuran volume diatur, mulai dari kecil).
- Service `ops` (hidup terus karena `sleep infinity`) -> HAPUS segera setelah Langkah 20.

Cara memantau: dashboard project -> kartu/menu "Usage" (atau avatar -> Usage / Billing). Cek angka "Estimated cost" setelah Langkah 8 dan lagi besok. Tarif tidak dikutip di sini karena harus diverifikasi di halaman Pricing/akun Anda. Bila sisa kredit menipis, hentikan: lihat bagian Rollback.

Opsional hemat: di environment `production`, service web yang gagal start tidak menghabiskan banyak (restart dibatasi 5 kali), tetapi bila ingin bersih: klik service -> tab Deployments -> menu `...` pada deployment aktif -> "Remove" / "Stop". Jangan hapus service production tanpa rencana.

---

## C. Langkah-langkah

### Langkah 1. Pasang Railway CLI dan login (di laptop Anda)

Prasyarat: Node.js 22 (sudah dipakai project ini).

Di PowerShell:
```
npm install -g @railway/cli
railway --version
railway login
```
- `railway login` membuka browser; setujui. Fallback bila browser tidak terbuka: `railway login --browserless` (menampilkan kode untuk dimasukkan manual).
- Fallback pemasangan bila npm gagal: `scoop install railway` (butuh Scoop) atau unduh dari halaman instalasi resmi Railway CLI di docs.railway.com.

Hasil yang diharapkan: `railway --version` menampilkan nomor versi; `railway whoami` menampilkan email Anda.

Verifikasi:
```
railway whoami
railway ssh --help
```
Perintah kedua harus menampilkan bantuan. Bila `ssh` tidak dikenal, versi CLI terlalu lama: jalankan ulang `npm install -g @railway/cli@latest`.

> BERHENTI dan laporkan jika `railway ssh --help` tetap tidak ada setelah update, atau login gagal.

### Langkah 2. Perbaiki integrasi GitHub ("Auto deploy unavailable / Could not load branches")

Lokasi di dashboard: project `tiny-osaka` -> klik service `web` -> tab Settings -> bagian "Source" (Source Repo / Connect Repo / Branch).

Penyebab umum: aplikasi GitHub "Railway" belum diberi akses ke repositori ini. Perbaikan:
1. Di GitHub: avatar -> Settings -> Applications -> tab "Installed GitHub Apps" -> "Railway" -> Configure. Di "Repository access" pilih repo `tiny-osaka` (atau "All repositories"), klik Save.
2. Kembali ke dashboard, muat ulang halaman, buka Settings -> Source. Bila perlu klik "Disconnect" lalu "Connect Repo" dan pilih ulang repo `taufiksandrio/tiny-osaka`.
3. Pilih branch `main`.
4. Jika beda: di dashboard avatar -> Account Settings -> Integrations -> GitHub -> "Reconnect"/"Configure".

Hasil yang diharapkan: daftar branch muncul dan `main` bisa dipilih.

Fallback bila tetap gagal (deploy manual lewat CLI): jangan jalankan `railway up` dari folder kerja Anda, karena ada folder `_export/` yang belum di-ignore Git dan bisa ikut terunggah. Pakai salinan bersih:
```
git clone https://github.com/taufiksandrio/tiny-osaka.git C:\temp\tiny-osaka-deploy
cd C:\temp\tiny-osaka-deploy
git checkout main
railway link
railway up --service web --environment staging
```
(Dilakukan setelah Langkah 3. `railway up` mengunggah isi folder; pastikan hanya kode, tidak ada `.env*`.) Jika memakai fallback ini, setiap deploy ulang harus diulang manual, dan service `ops` memakai `railway up --service ops --environment staging` dengan cara yang sama. Hapus `C:\temp\tiny-osaka-deploy` setelah selesai.

> BERHENTI dan laporkan jika branch `main` tidak bisa dipilih dan fallback `railway up` juga gagal.

### Langkah 3. Buat environment `staging`

Lokasi: dashboard project -> pojok kiri atas, dropdown environment (bertuliskan `production`) -> "New Environment".
1. Pilih "Duplicate Environment" -> sumber `production`, nama: `staging`. (Jika tidak ada pilihan duplicate: pilih "Empty Environment", lalu tambah service dari repo lewat tombol "+ New" -> "GitHub Repo" -> `tiny-osaka`, beri nama `web`.)
2. Setelah jadi, pastikan Anda berada di environment `staging` (lihat dropdown).

Hasil yang diharapkan: environment `staging` ada, berisi satu service `web` (hasil salinan). Deployment pertamanya kemungkinan GAGAL/crash karena variabel belum ada. Itu NORMAL (gerbang fail-closed bekerja).

Verifikasi: buka service `web` (di staging) -> tab Variables. Pastikan TIDAK ada variabel hasil salinan yang aneh (terutama tidak ada `MIGRATION_DATABASE_URL`, `RAILWAY_ADMIN_DATABASE_URL`, `TINY_OSAKA_BOOTSTRAP_OWNER_PASSWORD`). Hapus jika ada.

> BERHENTI dan laporkan jika environment production ikut berubah atau variabel production tersalin dengan nilai rahasia yang tidak Anda kenal.

### Langkah 4. Tambah Postgres di staging

Lokasi: pastikan environment `staging` terpilih -> tombol "+ New" (atau klik kanan di kanvas) -> "Database" -> "Add PostgreSQL".

Hasil yang diharapkan: kartu service bernama `Postgres` muncul dan statusnya hijau (Active) dalam 1-2 menit.

Verifikasi: klik `Postgres` -> tab Variables. Pastikan ada `DATABASE_URL` dan `DATABASE_PUBLIC_URL`. Anda hanya memakai `DATABASE_URL` (jalur privat). Jangan klik/aktifkan TCP Proxy / Public Networking pada Postgres: tab Settings -> Networking harus TANPA "TCP Proxy". Jika beda: bila ada proxy aktif, hapus.

Catat nama persis service (misalnya `Postgres`); nama ini dipakai di rujukan `${{Postgres.DATABASE_URL}}` pada Langkah 7.

> BERHENTI dan laporkan jika kartu Postgres tidak pernah aktif atau minta upgrade plan.

### Langkah 5. Pasang volume media di service `web`

Lokasi: kanvas staging -> klik kanan service `web` -> "Attach Volume" (atau "+ New" -> "Volume" lalu pilih `web`; atau `Ctrl+K` -> "New Volume").
- Mount path: `/data/media`
- Ukuran: pakai minimum/default yang diizinkan plan (cukup untuk uji; 39 foto kecil). Ukuran bisa diubah nanti.

Hasil yang diharapkan: ada kartu volume yang tersambung ke `web`, mount path `/data/media`.

Catatan: volume membuat service `web` satu replika dan ada jeda singkat tiap deploy. Ini sudah sesuai `railway.json` (`numReplicas: 1`).

> BERHENTI dan laporkan jika plan trial menolak volume.

### Langkah 6. Pastikan `railway.ops.json` sudah di `main` (B-OPS)

Tanpa file ini, jangan lanjut ke Langkah 7. Cek di GitHub: repo -> branch `main` -> file `railway.ops.json` ada.

> BERHENTI. Jika file belum ada, minta PM/orchestrator mengerjakan perubahan kode kecil pada Bagian A, lalu lanjut setelah ter-merge.

### Langkah 7. Buat service `ops` (shell operator, tanpa domain)

Lokasi:
1. Environment `staging` -> "+ New" -> "GitHub Repo" -> `tiny-osaka`. Setelah muncul kartu baru, klik -> Settings -> Service Name: ubah menjadi `ops`.
2. Settings -> Source: branch `main`.
3. Settings -> bagian "Config as Code" (Jika beda: cari "Railway Config File" / "Config Path"): isi `/railway.ops.json`.
4. Settings -> Networking: JANGAN klik "Generate Domain" dan jangan tambah domain. Biarkan kosong.
5. Settings -> Deploy: pastikan "Custom Start Command" yang tampil/terbaca adalah `sleep infinity` (nilai dari file), dan tidak ada Healthcheck Path.
6. Tab Variables -> "Raw Editor" -> tempel (ganti `Postgres` bila nama service Anda berbeda):
```
RAILWAY_ADMIN_DATABASE_URL=${{Postgres.DATABASE_URL}}
```
7. Simpan ("Update Variables"), lalu klik "Deploy".

Jangan set `DATABASE_URL`, `CMS_DATABASE_URL`, atau `PUBLIC_DATABASE_TARGET` di `ops`.

Hasil yang diharapkan: build selesai, deployment `ops` berstatus Active/Running dan tetap hidup (bukan Crashed) setelah 2 menit. Log menampilkan build (`next build`), bukan pesan "Refusing to start".

Verifikasi: tab Deployments -> klik deployment -> View Logs: tidak ada "Refusing to start" (itu berarti config file salah dipakai).

> BERHENTI dan laporkan jika `ops` crash dengan pesan "Refusing to start" (config file `/railway.ops.json` tidak terbaca) atau build gagal.

### Langkah 8. Hubungkan CLI ke project dan masuk ke `ops`

Di PowerShell (folder bebas, mis. folder kosong; jangan di dalam folder yang berisi `.env`):
```
railway link
```
Pilih workspace, project `tiny-osaka`, environment `staging`, service `ops` (pakai panah dan Enter). Lalu:
```
railway status
railway ssh --service ops --environment staging
```
Jika beda: bila `--service` tidak dikenal, jalankan `railway ssh` saja setelah `railway link` ke service `ops`.

Di dalam shell container, jalankan:
```
bash
pwd
ls scripts/provision-railway-db.mjs scripts/migrate-production-db.mjs drizzle-remote/meta/_journal.json
node --version
env | grep -c RAILWAY_ADMIN_DATABASE_URL
```
Hasil yang diharapkan: `ls` menampilkan ketiga file (tidak "No such file"), Node versi 22.x, hitungan `1`. Jika direktori kerja bukan berisi `scripts/` (mis. bukan `/app`), jalankan `cd /app`; bila tetap tidak ada, cari dengan `ls /` dan laporkan.

Jangan jalankan `env` tanpa filter: akan menampilkan URL admin ke layar.

Verifikasi koneksi privat (tanpa menampilkan kata sandi):
```
node -e "const u=new URL(process.env.RAILWAY_ADMIN_DATABASE_URL);console.log(u.hostname,u.port,u.pathname)"
```
Harus mencetak sesuatu seperti `postgres.railway.internal 5432 /railway` (nama bisa sedikit beda tapi harus berakhiran `.railway.internal`).

> BERHENTI dan laporkan jika `railway ssh` tidak bisa tersambung, atau hostname tidak berakhiran `.railway.internal`, atau port bukan 5432 (skrip menolak).

### Langkah 9. Provisioning database: dry-run

Masih di shell `ops`:
```
cd /app
npm run db:provision:railway -- --target staging --credentials-file /tmp/staging-db.env
```
Hasil yang diharapkan: `staging: dry-run OK. --apply would create roles ... database tiny_osaka_staging ...`. Tidak ada yang berubah.

> BERHENTI dan laporkan jika muncul "Railway database provisioning failed" (periksa: URL admin, host `.railway.internal`, atau objek sudah ada). Kemungkinan lain: server Postgres Railway mewajibkan SSL dan skrip tidak mengaktifkan SSL (skrip memakai koneksi tanpa SSL). Jika galat menyebut SSL, itu blocker kode kecil (opsi `ssl` pada `pg.Client` di `scripts/provision-railway-db.mjs` dan `scripts/lib/railway-db.mjs`); laporkan, jangan memaksa memakai proxy publik.

### Langkah 10. Provisioning database: apply

```
npm run db:provision:railway -- --target staging --credentials-file /tmp/staging-db.env --apply
```
Hasil yang diharapkan: `staging: roles and database created. Credentials were written to the given file (mode 0600)...`. File `/tmp/staging-db.env` berisi tiga baris: `DATABASE_URL`, `CMS_DATABASE_URL`, `MIGRATION_DATABASE_URL`. Kata sandi tidak dicetak.

Verifikasi: `ls -l /tmp/staging-db.env` harus `-rw-------`.

Bila gagal di tengah, skrip membersihkan objek yang dibuatnya sendiri dan menghapus file. Jalankan ulang setelah memperbaiki penyebab. Skrip menolak bila database/role sudah ada (tidak memperbaiki apa pun).

> BERHENTI dan laporkan jika gagal dua kali, atau jika skrip menolak karena "Existing objects found" padahal ini DB baru.

### Langkah 11. Pindahkan kredensial ke Variables (tanpa menaruh MIGRATION di web)

Tampilkan hanya yang dibutuhkan, satu per satu, di terminal yang tidak sedang direkam/dibagikan:
```
grep -E '^(DATABASE_URL|CMS_DATABASE_URL)=' /tmp/staging-db.env
```
a. Dashboard -> service `web` (staging) -> Variables -> Raw Editor -> tempel kedua baris tadi (`DATABASE_URL=...` dan `CMS_DATABASE_URL=...`). Simpan, tetapi JANGAN deploy dulu (tahap Langkah 14). Jika dashboard memunculkan "Deploy" otomatis, biarkan.

b. Ambil baris migrator:
```
grep -E '^MIGRATION_DATABASE_URL=' /tmp/staging-db.env
```
Dashboard -> service `ops` -> Variables -> Raw Editor -> tambahkan baris itu (di bawah `RAILWAY_ADMIN_DATABASE_URL`). Simpan. Variabel ini TIDAK boleh masuk ke `web`. Menyimpan akan memicu redeploy `ops` bila Anda klik Deploy; tunda sampai file dihapus (Langkah 12).

Hasil yang diharapkan: `web` Variables berisi `DATABASE_URL` dan `CMS_DATABASE_URL` yang host-nya berakhiran `.railway.internal` dan pengguna `tiny_osaka_staging_app` / `tiny_osaka_staging_cms`; `ops` Variables berisi `MIGRATION_DATABASE_URL` dengan pengguna `tiny_osaka_staging_migrator`.

Verifikasi visual: periksa nama pengguna di tiap URL (bagian antara `//` dan `:`). Salah tempel (mis. migrator di web) harus diperbaiki sekarang; `check-railway-env.mjs` akan menolak start bila `MIGRATION_DATABASE_URL` ada di `web`.

### Langkah 12. Hapus file kredensial

Setelah Anda yakin kedua Variables tersimpan (muat ulang halaman Variables dulu), di shell `ops`:
```
shred -u /tmp/staging-db.env 2>/dev/null || rm -f /tmp/staging-db.env
ls /tmp/staging-db.env
```
Hasil yang diharapkan: `ls` menampilkan "No such file or directory".

Lalu bersihkan layar terminal (`clear`, lalu `exit` dari shell ssh, lalu `cls` di PowerShell). Pada Windows Terminal, riwayat gulir bisa dibersihkan dengan menutup tab.

Jika file belum hilang atau Anda tidak yakin Variables tersimpan: jangan hapus dulu; isi file adalah satu-satunya salinan kata sandi.

### Langkah 13. Terapkan perubahan `ops` (memuat MIGRATION_DATABASE_URL)

Dashboard -> service `ops` -> klik "Deploy" pada perubahan variabel yang tertunda. Tunggu Active. Lalu masuk lagi:
```
railway ssh --service ops --environment staging
bash
cd /app
env | grep -c '^MIGRATION_DATABASE_URL='
```
Hasil yang diharapkan: hitungan `1`.

### Langkah 14. Migrasi: dry-run lalu apply

Di shell `ops`:
```
npm run db:migrate:production -- --target staging
```
Hasil yang diharapkan: `staging: migrator identity, app/cms roles and PUBLIC isolation verified.` lalu `staging: dry-run OK. Database is empty; --apply would create the drizzle metadata and apply 0000-0017 in ONE transaction.`

Database baru dan kosong, jadi backup sebelum migrasi tidak berisi data. (Untuk produksi nanti, backup wajib; lihat spec bagian 5.6.) Setelah dry-run bersih:
```
TINY_OSAKA_CONFIRM_PRODUCTION_MIGRATION=staging-0017 npm run db:migrate:production -- --target staging --apply
```
Hasil yang diharapkan: `staging: applied 0000-0017; 31 public and 9 auth tables owned by tiny_osaka_staging_owner.`

Verifikasi idempoten (jalankan lagi tanpa `--apply`):
```
npm run db:migrate:production -- --target staging
```
Harus mencetak `reviewed 0000-0017 already applied and verified; no changes made.`

Migrasi berjalan dalam SATU transaksi; bila gagal, otomatis dibatalkan.

> BERHENTI dan laporkan jika dry-run menolak (pesan "Refusing migration"), `drizzle-remote` tidak sama dengan hasil transform (`db:remote-sql:check` di sisi developer), atau apply gagal. Jangan mengulang `--apply` berkali-kali tanpa membaca pesan.

### Langkah 15. Variabel service `web`

Buat secret acak di laptop (PowerShell, folder bebas):
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Salin hasilnya langsung ke dashboard (jangan simpan di file; jangan dibagikan; berbeda untuk produksi nanti).

Dashboard -> service `web` (staging) -> Settings -> Networking -> "Generate Domain" (domain `*.up.railway.app`; bila diminta port, biarkan otomatis/ikuti port yang disediakan Railway). Lalu Variables -> Raw Editor, tambahkan (di samping `DATABASE_URL` dan `CMS_DATABASE_URL` yang sudah ada):
```
PUBLIC_DATABASE_TARGET=staging
PUBLIC_CONTENT_SOURCE=published
BETTER_AUTH_SECRET=<hasil node tadi>
BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
MEDIA_STORAGE_ROOT=/data/media
```
Jika `${{RAILWAY_PUBLIC_DOMAIN}}` tidak terbaca (kolom tampak kosong): ketik domain persisnya: `BETTER_AUTH_URL=https://<nama>.up.railway.app` (tanpa garis miring di akhir, tanpa path).

Indexing (SEO): `SITE_URL` (origin HTTPS tanpa path, hanya dibutuhkan production) dan `ALLOW_INDEXING` TIDAK diset di staging. Tanpa keduanya, staging menyajikan `Disallow: /`, `noindex,nofollow`, tanpa canonical, dan sitemap kosong (default tertutup). Di production, indexing baru terbuka bila `PUBLIC_DATABASE_TARGET=production`, `ALLOW_INDEXING=true` (persis), dan `SITE_URL` valid (mis. `https://domain-final.example`); `SITE_URL` tidak valid membuat semuanya tertutup.

Jangan set: `NODE_ENV`, `PORT`, `ALLOW_INDEXING`, `FFMPEG_PATH`, `FFPROBE_PATH` (upload video tetap nonaktif), `DATABASE_HOST_ALLOWLIST`, `MIGRATION_DATABASE_URL`, `RAILWAY_ADMIN_DATABASE_URL`, `TINY_OSAKA_*`.

Hasil yang diharapkan: web Variables berisi tepat 7 variabel di atas (ditambah variabel `RAILWAY_*` bawaan yang otomatis, itu normal).

### Langkah 16. Deploy `web` dan cek

Klik "Deploy" pada perubahan tertunda (atau service `web` -> Deployments -> Redeploy). Tunggu hingga Active.

Hasil yang diharapkan di log: `Server configuration OK for target staging.` lalu `next start` berjalan. Healthcheck `/api/health` lolos (status deployment hijau).

Verifikasi di PowerShell (ganti domain):
```
curl.exe -i https://<nama>.up.railway.app/api/health
curl.exe -I https://<nama>.up.railway.app/
```
Harapan: `/api/health` -> `200` dengan `{"status":"ok"}` dan `cache-control: no-store`. Halaman utama -> `200` (atau halaman kosong tanpa produk, normal karena belum ada konten). Di browser, buka halaman, lihat sumber halaman: ada `<meta name="robots" content="noindex, nofollow">` (staging tetap noindex).

Pesan "Refusing to start: invalid or missing server configuration: <NAMA>" menyebut variabel mana yang salah (nilai tidak dicetak):
- `DATABASE_URL` / `CMS_DATABASE_URL`: salah tempel atau host bukan `.railway.internal` atau port bukan 5432.
- `BETTER_AUTH_SECRET/BETTER_AUTH_URL`: secret kurang dari 32 karakter, atau URL bukan HTTPS DNS tanpa path.
- `MEDIA_STORAGE_ROOT`: volume belum terpasang di `/data/media` atau path berbeda.
- `... (must not be set on web)`: hapus variabel itu dari `web`.

> BERHENTI dan laporkan jika deployment Crashed setelah memperbaiki nama variabel di atas, atau jika `/api/health` bukan 200. Jika log menunjukkan izin ditolak pada `/data/media` saat upload nanti: tambahkan variabel `RAILWAY_RUN_UID=0` di `web` (dugaan penyebab: pemilik volume root; belum diverifikasi), lalu redeploy dan laporkan.

### Langkah 17. Bootstrap Owner pertama

Rencanakan email dan kata sandi Owner (kata sandi minimal 12 karakter untuk skrip ini; hindari tanda `"` dan `\`). Periksa ejaan email dua kali; pernah terjadi salah satu huruf pada uji nyata.

Cara masuk ke shell `ops`: `railway ssh --service ops --environment staging` (atau Console di dashboard, tetapi bisa lambat/lag), lalu `bash`, lalu `cd /app`. Shell ini TIDAK punya `psql`, tetapi punya `node` dan paket `pg` di `/app`, sehingga pemeriksaan DB memakai satu-baris `node -e '...'` (di dalam tanda kutip tunggal, tulis tanda kutip literal sebagai `\x27`).

Mengetik kata sandi langsung di shell jarak jauh rawan salah (lag, dan input tersembunyi menyembunyikan salah ketik). Cara yang lebih aman: susun seluruh perintah di Notepad lokal, lalu tempel sekali saja, diawali `unset HISTFILE`. Setelah selesai, kosongkan Notepad tanpa menyimpan lalu jalankan `clear`. Jangan pernah menempel perintah atau kata sandi ke chat/Git.
```
unset HISTFILE
TINY_OSAKA_BOOTSTRAP_OWNER_EMAIL='<email-owner>' TINY_OSAKA_BOOTSTRAP_OWNER_PASSWORD='<kata-sandi-owner>' TINY_OSAKA_BOOTSTRAP_OWNER_NAME='Owner' npm run owner:bootstrap -- --target staging
clear
```
Hasil yang diharapkan: `First Owner created. Sign in at /admin/login, change the password and enable MFA. Email ownership is not verified.`

Skrip menolak jika Owner sudah ada (tidak menimpa). Jalankan hanya sekali. Skrip mencetak SATU pesan gagal generik untuk SEMUA kegagalan, termasuk "Owner sudah ada". Jika percobaan pertama sebenarnya sudah membuat Owner (mis. dengan salah ketik email/kata sandi), percobaan ulang pasti gagal. Cek jumlah Owner:
```
node -e 'const{Pool}=require("pg");const p=new Pool({connectionString:process.env.RAILWAY_ADMIN_DATABASE_URL});p.query("select role, count(*)::int n from cms_auth.roles group by role").then(r=>{console.log(r.rows);p.end()})'
```
Hasil yang diharapkan: satu baris `role: owner` dengan `n: 1` bila Owner sudah ada; hasil kosong berarti belum ada Owner (periksa kata sandi dan migrasi). Kueri role ini boleh pada database default karena role berlaku se-cluster.

Catatan penting: `RAILWAY_ADMIN_DATABASE_URL` menunjuk ke database default `railway`, BUKAN `tiny_osaka_staging`. Untuk kueri tabel aplikasi, ganti path-nya: `const u=new URL(process.env.RAILWAY_ADMIN_DATABASE_URL);u.pathname="/tiny_osaka_staging";` lalu pakai `u.toString()` sebagai `connectionString`. Galat `42P01` (relation does not exist) berarti penggantian path ini terlupa.

Pemulihan jika Owner terlanjur dibuat dengan data salah (jalankan dengan koneksi ke `tiny_osaka_staging` seperti di atas, tulis perintah di Notepad lokal):
- Reset kata sandi Owner: hitung hash dengan `hashPassword` dari `better-auth/crypto`, lalu `UPDATE cms_auth.accounts SET password = <hash>` untuk akun kredensial milik Owner tersebut.
- Ubah email: `UPDATE cms_auth.users SET email = '<email-benar>'` untuk pengguna Owner. Kolom `accounts.account_id` tidak menyimpan email, jadi tidak perlu diubah.

> BERHENTI dan laporkan jika muncul "Owner bootstrap failed" setelah memeriksa panjang kata sandi, bahwa migrasi (Langkah 14) sudah selesai, dan bahwa Owner belum ada (cek jumlah Owner di atas).

### Langkah 18. Tutup akses operator: hapus kredensial dari `ops`, hapus `ops`

Setelah Langkah 17 dan verifikasi login (Langkah 19) berhasil, hapus service `ops`:
Dashboard -> service `ops` -> Settings -> bagian bawah (Danger) -> "Delete Service". Ini menghapus `RAILWAY_ADMIN_DATABASE_URL` dan `MIGRATION_DATABASE_URL` dari project.

Jika Anda masih butuh `ops` (mis. menunggu uji), minimal hapus variabel `RAILWAY_ADMIN_DATABASE_URL` dan `MIGRATION_DATABASE_URL` dari Variables-nya. `ops` dapat dibuat lagi kapan pun (Langkah 7, 11b); kredensial migrator harus diambil dari Variables staging yang Anda simpan di tempat aman (manajer kata sandi) jika kelak perlu migrasi lagi.

Dashboard tidak langsung menghapus: penghapusan `ops` muncul sebagai draf ("Removed", "Apply 1 change"). Klik "Details" dulu dan pastikan itu satu-satunya perubahan, lalu klik tombol Deploy di kanvas untuk menerapkannya.

Hasil yang diharapkan: kanvas staging hanya berisi `web`, `Postgres`, volume.

### Langkah 19. Uji fungsional staging

1. Buka `https://<nama>.up.railway.app/admin/login`. Masuk dengan email/sandi Owner Langkah 17.
   Hasil: masuk ke CMS tanpa galat. Pada DevTools -> Application -> Cookies, cookie sesi harus `HttpOnly`, `Secure`, `SameSite=Lax`.
2. Ganti kata sandi sementara dan aktifkan MFA Owner: belum tersedia (catat sebagai pekerjaan lanjutan). CMS belum punya halaman akun, jadi keduanya tidak bisa dilakukan lewat UI. Kata sandi hanya bisa diganti lewat one-liner reset (lihat Langkah 17) dari service `ops` sementara.
3. Upload media: di CMS buka katalog/halaman yang punya unggah gambar, unggah 1 gambar kecil (JPEG/PNG/WebP). Kartu pustaka media hanya menampilkan 8 karakter pertama ID pada judul; ID UUID lengkap ada di teks kecil di bawah gambar.
   Hasil: gambar tampil di pustaka media CMS. Route publik `/media/<id>` butuh UUID LENGKAP dan hanya melayani media yang dipakai konten TERBIT, sehingga gambar baru yang belum dipakai menghasilkan 404 di sana (normal). Untuk menguji volume, buka route admin `/api/cms/media/<UUID-lengkap>` saat masih login.
4. Redeploy mempertahankan media: service `web` -> Deployments -> menu `...` pada deployment aktif -> Redeploy. Setelah Active, buka lagi `/api/cms/media/<UUID-lengkap>` tadi.
   Hasil: gambar masih ada dan sama. Jika hilang: volume tidak terpasang pada path `MEDIA_STORAGE_ROOT`.
5. Simpan konten: edit satu halaman/produk uji dan simpan; perubahan langsung tampil di situs publik (aturan simpan-langsung-tayang).
6. Login salah 5 kali untuk email uji tidak mengunci Owner? Jangan uji ke akun Owner (rate limit per email: 5 percobaan/15 menit). Lewati kecuali ada akun uji.

> BERHENTI dan laporkan jika login/unggah gagal; sertakan pesan galat dan potongan log `web` tanpa rahasia.

### Langkah 20. Backup

Kode tidak punya pencadangan otomatis; jangan mengandalkannya.
1. Dashboard -> `Postgres` -> tab "Backups" (jika beda: Settings atau menu `...`). Catat apakah fitur backup tersedia di plan trial Anda dan buat backup manual bila bisa. Jika tidak tersedia, catat sebagai risiko staging.
2. Volume `web` -> tab "Backups" (atau pada kartu volume). Hal yang sama.
3. Pencadangan DB dari `ops`: cek `which pg_dump`; bila tidak ada, jangan memasang paket di container produksi; pakai fitur Railway atau tunda sampai ada keputusan backup (spec bagian 9, backup di luar Railway).
4. Uji restore: belum diwajibkan untuk staging, tetapi WAJIB sebelum produksi (AC-13, AC-21 di spec).

Hasil nyata staging: pada plan trial Railway, backup untuk Postgres maupun volume memerlukan Pro (tidak bisa membuat backup, tidak ada jadwal, tidak ada PITR). Ini risiko staging yang diterima. Untuk produksi perlu keputusan (upgrade ke Pro, atau backup di luar Railway) ditambah uji restore sebelum go-live.

### Langkah 21. Catat hasil

Tuliskan (di catatan Anda, bukan Git) tanggal, domain staging, hasil tiap titik verifikasi, dan sisa kredit trial.

---

## D. Rollback / hapus environment

Rollback aman karena produksi tidak disentuh.

- Salah variabel di `web` (bukan fatal): perbaiki di Variables, Redeploy.
- Provisioning DB gagal sebagian: skrip membersihkan sendiri. Bila ragu: hapus service `Postgres` (Settings -> Danger -> Delete Service) dan tambah ulang (Langkah 4), lalu ulang Langkah 9-14. Variabel `DATABASE_URL`/`CMS_DATABASE_URL`/`MIGRATION_DATABASE_URL` lama harus diperbarui.
- Migrasi gagal: transaksi dibatalkan otomatis. DB tetap kosong; ulangi setelah memperbaiki penyebab.
- Menghapus seluruh staging (kredit habis atau mulai dari nol): dashboard -> dropdown environment -> pilih `staging` -> Settings (ikon gigi environment) -> "Delete Environment" -> ketik nama untuk konfirmasi. Ini menghapus service `web`, `ops`, `Postgres`, volume (DATA HILANG). Environment `production` tidak terpengaruh. Bersihkan juga: `railway unlink` di laptop dan hapus `C:\temp\tiny-osaka-deploy` bila dibuat.
- Kebocoran rahasia (kata sandi terlihat di chat/log): anggap bocor. Karena staging belum berisi data nyata, cara tercepat: hapus environment lalu ulangi dari Langkah 3, dengan secret baru.
- Production: tidak diubah oleh runbook ini. Satu-satunya efek samping mungkin deployment `web` production yang crash; itu sudah ada sebelumnya.

---

## E. Checklist akhir staging

- [ ] Environment `staging` ada; production tidak berubah.
- [ ] Postgres tanpa TCP Proxy/public networking.
- [ ] `ops` tanpa domain publik, dan sudah dihapus (atau variabel adminnya dihapus).
- [ ] `web` Variables hanya 7 variabel yang disepakati; tidak ada `MIGRATION_DATABASE_URL`, `RAILWAY_ADMIN_DATABASE_URL`, `TINY_OSAKA_*`.
- [ ] `/tmp/staging-db.env` sudah dihapus dan terminal dibersihkan.
- [ ] Log `web`: "Server configuration OK for target staging."
- [ ] `curl.exe -i https://<domain>/api/health` -> 200, `no-store`.
- [ ] Migrasi 0000-0017 diterapkan; dry-run kedua mencetak "already applied".
- [ ] Login Owner berhasil; cookie `Secure; HttpOnly; SameSite=Lax`; kata sandi diganti; MFA aktif.
- [ ] Upload media berhasil; setelah Redeploy gambar masih ada.
- [ ] Halaman publik `noindex,nofollow`.
- [ ] Backup DB dan volume: status tersedia/tidak tersedia dicatat; uji restore dijadwalkan sebelum produksi.
- [ ] Sisa kredit trial dicatat; Usage dipantau.
- [ ] Hal di luar staging yang belum selesai (dari spec): QA penuh (lint/build/unit/integrasi/E2E/security), `robots.txt`/`sitemap.xml`, header keamanan, email reset sandi (tidak dipakai), domain kustom, isi 39 produk. Produksi hanya setelah persetujuan eksplisit.

---

## F. Ringkasan

- Blocker: B-OPS (tambah `railway.ops.json` agar service `ops` tidak memakai start command `railway.json`). Risiko tambahan yang belum terbukti: koneksi Postgres Railway mungkin mewajibkan SSL sementara skrip memakai koneksi tanpa SSL (Langkah 9); `railway ssh` harus tersedia di CLI Anda (Langkah 1 dan 8).
- Jumlah langkah: 21 langkah bernomor (inti 1-19), ditambah bagian Rollback dan Checklist akhir.
