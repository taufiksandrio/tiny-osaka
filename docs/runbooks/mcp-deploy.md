# Runbook: Menayangkan fitur MCP v2 (migrasi 0019, klien OAuth, connector Claude)

Status: draf operator. Dokumen ini hanya panduan; belum ada langkah yang dijalankan ke staging atau production. Dasar: `docs/specs/mcp-owner-v2.md` (AC-47..53). Untuk cara masuk ke service `ops`, variabel Railway, dan provisioning role, lihat `docs/runbooks/railway-staging.md`.

Aturan untuk semua langkah:
- Kerjakan di STAGING dulu. Production hanya setelah staging lulus dan Anda menyetujui secara terpisah.
- Jangan menempel kata sandi, URL database, token, atau secret ke chat, issue, Git, atau screenshot.
- Tanda `<...>` adalah placeholder yang Anda isi sendiri. `<target>` berarti `staging` atau `production`.
- Bila hasil tidak sama dengan "Hasil yang diharapkan", BERHENTI, jangan lanjut, dan laporkan pesan galat (tanpa rahasia).

Urutan wajib: 1 Backup -> 2 Dry-run -> 3 Apply (persetujuan terpisah) -> 4 Deploy -> 5 Buat klien OAuth -> 6 Hubungkan connector Claude -> 7 Izinkan domain -> 8 (opsional) Aktifkan impor foto dari URL.

## 0. Yang dilakukan migrasi ini (agar tahu apa yang diperiksa)

- 0018 (MCP OAuth): tabel `oauth_clients`, `oauth_codes`, `oauth_tokens`, `mcp_audit` di schema `cms_auth`.
- 0019 (unggah foto): tabel `cms_auth.mcp_uploads` dan empat event audit baru. Aplikasi (role `*_app`) hanya boleh SELECT, INSERT, dan UPDATE lima kolom hasil; tidak ada DELETE. Role CMS (`*_cms`) tidak punya akses sama sekali. `mcp_audit` tetap hanya-tambah.
- Tidak ada data situs (menu, halaman, media) yang disentuh.
- Perubahan perilaku tool (tanpa migrasi): `page_save` (usang) kini melakukan MERGE parsial seperti `page_update`: `fields` digabung ke isi terkini, kunci yang tidak dikirim tetap ada (v1 mengganti seluruh isi). `expectedRevisionId`/`expectedVersion` yang berbeda dari kondisi terkini tetap ditolak `REVISION_CONFLICT`; kunci di luar templat ditolak `INVALID_CONTENT`.
- Dua kondisi awal yang diterima runner: (A) database kosong -> menerapkan 0000-0019; (B) database sudah di 0000-0017 -> menerapkan 0018-0019 saja. Kondisi lain (misalnya sudah di 0018 saja, 19 entri, atau hash berbeda) DITOLAK dan tidak diperbaiki otomatis.

## 1. Backup

Tindakan: buat cadangan database `<target>` (dan volume media bila ada perubahan lain). Di Railway: Dashboard -> `Postgres` -> tab Backups -> buat backup manual. Alternatif dari service `ops`: `pg_dump` bila tersedia (`which pg_dump`); jangan memasang paket di container produksi.
Hasil yang diharapkan: ada berkas/entri backup bertanggal hari ini. Untuk production, uji restore ke database sementara sebelum lanjut.
Bila berbeda: fitur backup tidak tersedia di plan (di staging trial Railway pernah begitu). Untuk staging catat sebagai risiko yang diterima; untuk production JANGAN lanjut sampai ada backup yang bisa di-restore.
Rollback langkah ini: tidak ada yang diubah.

## 2. Dry-run (hanya membaca, tidak menulis)

Tindakan (di `ops`, variabel `MIGRATION_DATABASE_URL` hanya di sana):
```
npm run db:remote-sql:check
npm run db:migrate:production -- --target <target>
```
Hasil yang diharapkan:
- `drizzle-remote matches the generated output.`
- `<target>: migrator identity, app/cms roles and PUBLIC isolation verified.`
- Salah satu: `dry-run OK. Database is empty; --apply would ... apply 0000-0019 ... in ONE transaction.` atau `dry-run OK. Database is at 0000-0017; --apply would apply 0018-0019 in ONE transaction.` Bila sudah selesai: `reviewed 0000-0019 already applied and verified; no changes made.`
Arti hasil berbeda: `Refusing migration: ...` berarti jurnal, hash, riwayat, atau objek database tidak sama dengan rencana yang ditinjau (misalnya database di status tengah 19 entri, atau tabel tak dikenal). Jangan memaksa; kirim pesan galatnya. `Differs: <berkas>` pada db:remote-sql:check berarti `drizzle-remote/` tidak sama dengan hasil transformasi `drizzle/`; jalankan `npm run db:remote-sql:build` di komputer pengembang dan tinjau perubahannya.
Rollback langkah ini: tidak ada yang diubah.

## 3. Apply (butuh persetujuan eksplisit terpisah dari Anda)

Jangan jalankan sebelum Anda menulis persetujuan "apply <target>" setelah membaca hasil dry-run dan memastikan backup langkah 1 ada.
Tindakan:
```
TINY_OSAKA_CONFIRM_PRODUCTION_MIGRATION=<target>-0019 npm run db:migrate:production -- --target <target> --apply
```
Hasil yang diharapkan: `<target>: applied 0000-0019; 31 public and 14 auth tables owned by tiny_osaka_<target>_owner.` (atau `applied 0018-0019; ...` bila dari kondisi B). Semua dalam SATU transaksi dan diverifikasi sebelum commit (tabel, grant, constraint `mcp_uploads`).
Lalu jalankan dry-run lagi (langkah 2). Harus mencetak `reviewed 0000-0019 already applied and verified; no changes made.`
Arti hasil berbeda: `Refusing to apply: set ...` berarti nilai konfirmasi salah (harus persis `<target>-0019`); tidak ada yang diubah. `Remote migration failed; transaction rolled back` berarti transaksi dibatalkan dan database tidak berubah; kirim tanda waktu kejadian, bukan secret.
Rollback: sebelum apply selesai, transaksi otomatis dibatalkan. Sesudah apply sukses, tidak ada DROP otomatis di remote: pulihkan dari backup langkah 1 (hubungi operator database). Kode lama tetap berjalan di atas skema baru karena tabel baru tidak dipakai kode lama.

## 4. Deploy aplikasi

Tindakan: deploy branch yang sudah di-merge ke `main` ke service `web` `<target>` (cara deploy sama seperti runbook staging). Pastikan `MCP_MEDIA_IMPORT_ENABLED` TIDAK diisi.
Hasil yang diharapkan: deploy sukses; `https://<domain>/.well-known/oauth-protected-resource` mengembalikan JSON (bukan 404); `https://<domain>/api/mcp` tanpa token mengembalikan 401 (itu benar: wajib login).
Bila berbeda: 404 pada `.well-known` berarti kode MCP belum ter-deploy; 500 berarti cek log service `web` (jangan salin secret) dan lakukan rollback.
Rollback: di Railway pilih deployment sebelumnya -> Redeploy. Skema tidak perlu diubah.

## 5. Buat klien OAuth di CMS

Tindakan: login sebagai Owner -> `https://<domain>/admin/mcp` ("Koneksi MCP") -> isi nama (mis. "Claude") dan Redirect URI (satu per baris) -> simpan.
Redirect URI untuk aplikasi Claude yang di-hosting (claude.ai web, Desktop, mobile, Cowork): `https://claude.ai/api/mcp/auth_callback` (sumber resmi di bawah, diakses 2026-10-21). Untuk Claude Code, dokumen resmi menyebut redirect loopback pada port acak (contoh `http://localhost:3118/callback`, `http://localhost/callback`, `http://127.0.0.1/callback`). Apakah server kita menerima loopback pada port apa pun belum diverifikasi di runbook ini; jangan tambahkan URI loopback tanpa konfirmasi tim.
Hasil yang diharapkan: klien muncul di daftar "Klien terdaftar" dengan `Client ID`. Catat Client ID (bukan rahasia; klien kita publik tanpa secret).
Bila berbeda: pesan validasi URI berarti URI harus https (loopback http hanya untuk lokal) dan maksimal 5.
Rollback: nonaktifkan klien di halaman yang sama; token yang sudah terbit untuk klien itu berhenti berlaku.

## 6. Hubungkan connector Claude

Sumber resmi: lihat tautan di bagian akhir. Langkah menurut Claude Help Center (diakses 2026-10-21):
- Paket Pro/Max: Customize -> Connectors -> "+ Add" -> "Add custom connector". Paket Team/Enterprise: Owner organisasi membuka Organization settings -> Connectors -> Add -> Custom -> Web; lalu anggota membuka Customize -> Connectors dan menekan "Connect".
- Isi nama connector dan URL server MCP: `https://<domain>/api/mcp`. Klik Continue.
- Di bagian "Authentication" pilih cara masuk (mis. "Sign in now"). Di bagian "OAuth client" ada tiga pilihan resmi: "Use Claude's published identity (Recommended)", "Register automatically", "Use your own OAuth client".
- Cara mengisi OAuth Client ID di layar "Use your own OAuth client": dokumen resmi hanya menyebut ada isian "OAuth client ID" dan "OAuth client secret" (secret opsional; bila dikosongkan Claude memakai client ID sebagai klien publik) dan redirect `https://claude.ai/api/mcp/auth_callback`. Nama persis kolom di layar untuk connector kustom BELUM diverifikasi. Rencana: pilih "Use your own OAuth client", isi Client ID dari langkah 5, kosongkan secret. Bila layar berbeda, laporkan tangkapan layar (tanpa secret).
- Apakah server kita mendukung dua pilihan lainnya (Claude's published identity / pendaftaran otomatis, mis. DCR atau CIMD) belum diverifikasi di runbook ini; jangan dipakai sebelum dites.
Hasil yang diharapkan: tombol Connect membuka halaman persetujuan CMS (`/admin/mcp/authorize`); setelah Owner menyetujui, connector berstatus terhubung dan daftar tool tampil.
Arti hasil berbeda: galat "redirect_uri" berarti URI di langkah 5 tidak persis `https://claude.ai/api/mcp/auth_callback`; "invalid client" berarti Client ID salah atau klien dinonaktifkan; halaman login terus berulang berarti Anda bukan akun Owner.
Rollback: Customize -> Connectors -> Remove (atau three dots -> Remove). Dokumen resmi: untuk mengubah connector, hapus lalu tambahkan ulang. Cabut juga akses di CMS (nonaktifkan klien).

## 7. Izinkan domain (agar Claude dapat mengunggah foto)

Tool `media_upload_request` memberi URL unggah langsung (`https://<domain>/api/mcp/upload/<token>`, 5 menit, sekali pakai). Agar sandbox Claude (code execution) dapat memanggilnya, domain situs harus diizinkan. Menurut Help Center "Create and edit files with Claude" (diakses 2026-10-21): Team/Enterprise Owner membuka Organization settings -> Capabilities -> pilih "Allow network egress to package managers and specific domains" -> tambahkan `<domain>`. Untuk paket individual, pengaturan berada di Settings -> Capabilities ("Allow network egress"); rincian daftar domain untuk paket individual belum diverifikasi.
PERINGATAN log akses: token upload ada di PATH URL, sehingga access log reverse proxy (Nginx/Caddy/Railway edge) merekamnya. Token berlaku singkat dan sekali pakai (5 menit untuk agen, 15 menit untuk halaman Owner), tetapi tetap atur reverse proxy: redaksi (mask) path `/api/mcp/upload/` dan `/admin/mcp/upload/` pada access log, atau kecualikan dari log, dan simpan log itu dengan retensi pendek (mis. <= 24 jam). Aplikasi sendiri tidak mencatat token ke log, audit, atau pesan galat.
Hasil yang diharapkan: Claude berhasil POST gambar dan `media_upload_status` menunjukkan `done`.
Catatan perilaku: bila foto sudah tersimpan tetapi pencatatan hasilnya gagal berulang, status menjadi `rejected` dengan `failureCode` `RECORD_FAILED` dan token TIDAK dibuka lagi (supaya tidak ada foto ganda). Periksa pustaka media sebelum meminta unggahan baru. Percobaan token salah dibatasi per hash 20 karakter pertama token yang diminta (service auth sengaja mengabaikan header IP, jadi tidak ada batas per alamat sumber) ditambah batas global longgar.
Bila berbeda: bila Claude tidak punya akses jaringan, ia memberi `userUploadUrl` (halaman `/admin/mcp/upload/<token>`, 15 menit, login Owner yang sama). Itu jalur cadangan yang sah; jangan melonggarkan ke "All domains".
Rollback: hapus domain dari daftar izin.

## 8. (Opsional, default MATI) Impor foto dari URL

Tool `media_import_url` membuat SERVER mengunduh gambar dari URL https publik. Hanya aktif jika variabel server `MCP_MEDIA_IMPORT_ENABLED` bernilai persis `true`; nilai lain atau tidak diisi = mati. Aktifkan hanya dengan persetujuan eksplisit Anda (menyangkut akses jaringan keluar, risiko SSRF, bandwidth VPS).
Catatan Drive/Dropbox: tautan berbagi Google Drive dan Dropbox TIDAK diubah otomatis (pola unduhan resmi belum terverifikasi, AC-38). Tool menolaknya dengan `SHARE_LINK_UNSUPPORTED`; berikan tautan unduhan langsung ke berkas gambar.
Catatan: batas impor aktif (maks 1 per Owner dan 2 global) dihitung PER PROSES. Bila service dijalankan dengan lebih dari satu instance/replika, batas global menjadi per instance, jadi beban bisa lebih besar dari yang dikira.
Verifikasi: setelah variabel diisi dan service restart, tool `media_import_url` muncul di daftar tool connector; saat variabel kosong, tool tidak muncul/ditolak.
Rollback: hapus variabel `MCP_MEDIA_IMPORT_ENABLED` dan restart. Aset yang sudah terimpor tetap ada di media.

## Rollback keseluruhan

1. Matikan akses: hapus connector di Claude dan nonaktifkan klien di `/admin/mcp`; hapus `MCP_MEDIA_IMPORT_ENABLED`.
2. Kode: Redeploy deployment sebelumnya (skema baru tidak mengganggu kode lama).
3. Skema 0019/0018 di remote: hanya lewat restore backup langkah 1 (tidak ada DROP otomatis). Konten yang sudah disimpan lewat tool tetap ada; pemulihan manual oleh Owner.

## Sumber resmi (diakses 2026-10-21)

- Claude Docs, Authentication for connectors (redirect URI, OAuth client ID/secret, rentang IP keluar Anthropic 160.79.104.0/21): https://claude.com/docs/connectors/building/authentication
- Claude Help Center, Get started with custom connectors using remote MCP (langkah menambah connector): https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Claude Help Center, Create and edit files with Claude (network egress dan daftar domain): https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude
