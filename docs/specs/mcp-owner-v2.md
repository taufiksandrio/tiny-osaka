# Spec: MCP Owner v2 (bug fix, otomatisasi, unggah foto)

Status: APPROVED. Jawaban user terhadap 6 open questions tercatat di bawah. Implementasi dimulai 2026-10-21.
Penulis: PM. Tanggal: 2026-10-21. Branch kerja: `feat/mcp-owner-v2` (dibuat setelah persetujuan).
Dasar: `docs/specs/mcp-owner.md` (v1, sudah di main, PR #40). Bagian v1 yang tidak disebut di sini tetap berlaku.

## 1. Overview dan tujuan

v2 memperluas v1 agar pengalaman Owner menjadi "menulis di Claude, semua otomatis": (1) memperbaiki bug `menu_update` yang menghapus deskripsi, (2) mengurangi input wajib pada tool, (3) menambah unggah/impor foto lewat MCP untuk semua aplikasi Claude dan perangkat, (4) menyiapkan (tanpa menjalankan) migrasi staging/production dan runbook deploy MCP, (5) tes dan verifikasi nyata.

Kondisi kode yang terbaca (read-only):
- `src/server/mcp/tools.mjs`: 10 tool v1; `menu_update` mewajibkan `name`, `price`, `expectedVersion`; `page_save` mewajibkan `expectedRevisionId`, `expectedVersion`, `fields` penuh.
- Akar bug: `parseProductInput` (`src/server/catalog/product-input.mjs`) mengisi `description` kosong bila tidak dikirim, dan `updateProduct` (`src/server/catalog/products.mjs`) menimpa nama/deskripsi/harga dengan input. Gambar dan link order sudah aman (kunci absen = pertahankan).
- Slug otomatis sudah ada (`slugify` + `slugCandidate` di `createProduct`); tidak perlu logika baru.
- `src/server/cms/catalog.mjs`: `update` membuka transaksi sendiri dan mengambil kunci `lockCatalogWrites`; tool MCP saat ini tidak bisa membaca-lalu-menulis dalam satu transaksi tanpa titik masuk baru (lihat Q-A).
- Pipeline unggah: `createCmsMedia.upload(headers, body, mime)` (`src/server/cms/media.mjs`), kebijakan `src/server/media/policy.mjs` (JPG/PNG/WebP, 10.000.000 byte, sisi 4096 px), rute cookie `src/server/media/http.mjs` (maks 2 unggahan serentak).
- `sharp` 0.35.5, `zod` 4.6.7, `@modelcontextprotocol/sdk` 1.32.1 sudah terpasang. Tidak ada dependency baru yang direncanakan; jika BE memerlukannya (mis. klien HTTP dengan IP terpin), wajib minta persetujuan terpisah.
- Migrasi: `drizzle/0018_mcp_oauth.sql` sudah diterapkan di dev/test dan TIDAK diubah. Jalur remote (`REMOTE_MIGRATION_LIMIT = 18` di `scripts/lib/remote-migration-sql.mjs`) baru mencakup 0000-0017; 0018 belum pernah ada di `drizzle-remote/`. Jadi remote harus menerapkan 0018 dan 0019 sekaligus.

## 2. Kesesuaian dengan keputusan yang disetujui

| Sumber | Hasil cek |
|---|---|
| AGENTS.md: server-side RBAC, Owner-only MCP | Selaras. Semua jalur unggah memeriksa ulang keanggotaan Owner dari DB. |
| AGENTS.md: "upload validation", kebijakan media | Selaras. Semua jalur memakai `createCmsMedia.upload`; tidak ada pipeline kedua. |
| AGENTS.md: tanpa merchant sync, tanpa edit gambar di CMS | Selaras. Thumbnail MCP adalah turunan baca-saja untuk verifikasi, tidak disimpan dan tidak mengubah aset (bukan retouch). |
| AGENTS.md: tanpa klaim/URL/alamat tak terverifikasi | Link order tetap TIDAK diekspos (v1 Q-6 belum berubah). `media_import_url` tidak mengisi konten faktual. |
| v1 Q-7 (unggah media di luar v1) | v2 secara eksplisit membukanya; perlu persetujuan user pada spec ini. |
| v1 AC-16 (tool media hanya metadata, tanpa byte) | DIAMANDEMEN: `media_get`/`media_list` boleh mengembalikan thumbnail kecil (Q-9). Byte asli dan `storageKey` tetap tidak pernah dikembalikan. |
| v1 AC-11 (daftar 10 tool) dan penamaan `page_save` | DIAMANDEMEN: tool bertambah dan `page_save` diganti `page_update` (Q-C). |
| Akses jaringan keluar server | BARU. Tidak ada di keputusan mana pun; `media_import_url` membuat server mengakses internet. TIDAK boleh diimplementasikan tanpa persetujuan eksplisit user (Q-8, bagian 9). |

Tidak ada konflik yang memaksa STOP. Satu butir (jaringan keluar) adalah gerbang persetujuan, bukan konflik.

## 2.5. Pertanyaan terbuka dan jawaban user (APPROVED)

| # | Pertanyaan | Jawaban user | Rationale |
|---|-----------|------|-----------|
| Q-8 | Setuju `media_import_url` (server akses internet)? | **YA** | SSRF mitigation ketat (IP private tolak, DNS rebinding, timeout 15s, 10MB stream). Fitur tidak diimplementasi tanpa approval ini. |
| Q-A | Boleh tambah entry di `catalog.mjs`/`current-pages.mjs` untuk merge transaksi? | **YA** | Internal entry point, API HTTP tidak berubah (sesuai constraint). Memungkinkan read-then-write dalam satu TX. |
| Q-B | `createdAt` di `assetDto` atau proyeksi khusus? | **Proyeksi khusus** | Minimize blast radius. MCP punya kebutuhan spesifik (thumbnail + createdAt). |
| Q-C | `page_save` dihapus atau alias `page_update`? | **Alias** | Backward compatible. Existing clients tetap pakai `page_save`, baru clients pakai `page_update` dengan fields parsial. |
| Q-D | Status staging/production: sudah 0017 atau kosong? | **Kosong sampai 0017** | Safe assumption. 0018+0019 apply bersamaan di production. |
| Q-9 | Thumbnail di `media_list`: bentuk? | **Hanya 10-20 teratas** | Balance: cukup buat Claude verify visual, tidak heavy. Urut terbaru. |

## 3. Q dan acceptance criteria

Semua AC bisa dites. Galat memakai kode CMS yang ada (`describeFailure`); tidak ada stack trace/detail DB.

### Q-1: Bug `menu_update` menghapus deskripsi (PRIORITAS, dikerjakan dan dirilis lebih dulu)
- AC-1: `menu_update` yang tidak mengirim `description` mempertahankan deskripsi tersimpan; yang mengirim `""` secara eksplisit mengosongkannya; yang mengirim string menggantinya.
- AC-2: Hal yang sama untuk `name` dan `price`: kunci absen = pertahankan nilai lama. Gambar (`imageAssetId`/`imageAlt`) dan tiga link order tidak berubah bila tidak dikirim.
- AC-3: Pembacaan kartu terkini dan penulisan terjadi dalam SATU transaksi di bawah kunci katalog yang sama (tidak ada celah baca-lalu-tulis antar dua transaksi). Dua `menu_update` serentak pada slug sama: tidak ada yang kehilangan field yang tidak dikirimnya.
- AC-4: Perilaku API CMS HTTP (`/api/cms/catalog/**`), `parseProductInput`, dan `updateProduct` tidak berubah; seluruh tes CMS katalog yang ada tetap lulus tanpa edit.
- AC-5: Tes regresi: kartu dengan nama, deskripsi, gambar+alt, dan link order terisi -> `menu_update` hanya `{ slug, price }` -> nama, deskripsi, gambar, alt, link order identik dengan sebelumnya; hanya harga dan `version` berubah.
- AC-6: Tidak ada perubahan sama sekali (semua nilai sama) tetap mengembalikan kartu tanpa membuat revisi baru (perilaku `sameImage/sameLinks` yang ada).

### Q-2: Otomatisasi menu
- AC-7: `menu_create` hanya mewajibkan `name` dan `price`. Slug dibuat otomatis dengan `slugify` yang ada (termasuk penanganan tabrakan `-2`, `-3`) dan dikembalikan di hasil.
- AC-8: `menu_create`/`menu_update` dengan `imageAssetId` tanpa `imageAlt` menetapkan alt = nama menu (nama hasil merge pada update). Dengan `imageAlt` eksplisit, nilai itu dipakai. `imageAlt` tanpa gambar tetap ditolak `IMAGE_REQUIRED`; `imageAssetId: null` menghapus gambar seperti perilaku saat ini.
- AC-9: `menu_update` hanya mewajibkan `slug` ditambah minimal satu field yang diubah; `slug` saja tanpa perubahan ditolak `INVALID_INPUT`.
- AC-10: `expectedVersion` opsional. Bila absen, versi diambil dari kartu terkini di dalam kunci transaksi. Bila dikirim dan berbeda dari versi terkini, hasilnya `PRODUCT_CONFLICT` (409) dan tidak ada penulisan.
- AC-11: Slug tidak ditemukan -> `NOT_FOUND`. Input dengan bidang tak dikenal (mis. `category`, `variants`, link order) tetap ditolak ketat.

### Q-3: Otomatisasi halaman (`page_update`)
- AC-12: Tool `page_update({ pageKey, fields?, mediaOperations? })` menggabungkan `fields` parsial ke `fields` terkini (hanya kunci yang dikirim yang berubah; kunci lain dipertahankan). `expectedRevisionId` dan `expectedVersion` diambil otomatis di dalam kunci halaman yang sama dengan penyimpanan (`saveCurrentPage`).
- AC-13: `expectedRevisionId`/`expectedVersion` opsional; bila dikirim dan berbeda dari kondisi terkini -> `REVISION_CONFLICT` (409), tidak ada penulisan.
- AC-14: Kunci `fields` di luar templat halaman ditolak dengan kode validasi halaman yang ada; templat tetap, tanpa layout bebas.
- AC-15: Pemasangan foto halaman lewat `mediaOperations` (`mediaSave`/`mediaRemove`) tetap didukung; bila `alt` tidak diberikan, alt = judul halaman (`fields.title` hasil merge). Bila judul kosong -> `INVALID_INPUT` dengan field yang jelas, tidak mengarang alt.
- AC-16: Halaman yang belum pernah dibuat (versi 0, revisi null) bisa diisi lewat `page_update` tanpa langkah `page_get`.
- AC-17: Keputusan alias (Q-C): `page_save` v1 dipertahankan atau dihapus sesuai jawaban user; apa pun hasilnya, `tools/list` konsisten dengan skema.

### Q-4: Deskripsi tool
- AC-18: Deskripsi setiap tool memuat tiga bagian jelas: "Wajib", "Otomatis/opsional", dan "Contoh singkat" (data uji, bukan data Tiny Osaka). Tes memastikan setiap tool punya ketiga bagian dan menyebut nama field yang sesuai skema.

### Q-5: Unggah foto (`media_upload_request`, `media_upload_status`)
- AC-19: `media_upload_request({ target?, mime?, byteSize? })` (scope `mcp:write`) membuat satu baris `cms_auth.mcp_uploads` dan mengembalikan `{ uploadId, expiresAt, agentUploadUrl, userUploadUrl }`. `mime` (jika ada) harus salah satu `image/jpeg|png|webp`; `byteSize` (jika ada) 1..10.000.000; `target` berbentuk `menu:<slug>` atau `page:<pageKey>` dan hanya informatif (tidak otomatis memasang foto).
- AC-20: Token agent dan token user acak 256-bit, di DB hanya hash; token tidak masuk log, audit, atau pesan galat. Satu permintaan = satu unggahan: begitu salah satu jalur sukses, jalur lainnya tidak lagi bisa dipakai.
- AC-21: `agentUploadUrl` = `POST /api/mcp/upload/<token>`, berlaku 5 menit, sekali pakai, TANPA cookie dan TANPA header Authorization; body biner (Content-Type `image/jpeg|png|webp`) atau multipart satu berkas. Cookie sesi yang ikut terkirim diabaikan.
- AC-22: `userUploadUrl` = halaman `/admin/mcp/upload/<token>`, berlaku 15 menit, mewajibkan sesi CMS Owner yang sama dengan pemilik permintaan. Staff, Owner lain, atau tanpa login (redirect ke login lalu kembali) tidak bisa mengunggah, dan token tidak dikonsumsi oleh percobaan yang ditolak.
- AC-23: Kedua jalur memanggil `createCmsMedia.upload` yang sama (kebijakan JPG/PNG/WebP, <=10 MB, <=4096 px, penyimpanan volume Railway). Tidak ada validasi/penyimpanan paralel.
- AC-24: Pada SETIAP unggahan, keanggotaan Owner aktif dibaca ulang dari DB; Owner yang dinonaktifkan/diturunkan membuat unggahan gagal dan baris ditandai `rejected`.
- AC-25: Penolakan: token kedaluwarsa, sudah dipakai, tidak dikenal, atau `mime`/`byteSize` melenceng dari yang dideklarasikan (jika dideklarasikan), berkas bukan gambar, melebihi batas -> kode galat stabil, status `rejected` untuk kegagalan isi berkas (token terkonsumsi), sedangkan galat sementara 5xx (penyimpanan) tidak mengonsumsi token (asumsi A-4).
- AC-26: Konsumsi token atomik: dua unggahan serentak dengan token yang sama menghasilkan tepat satu aset; yang lain ditolak (tes konkurensi).
- AC-27: `media_upload_status({ uploadId })` (scope `mcp:read`) mengembalikan `{ status: pending|done|expired|rejected, assetId }` (`assetId` hanya bila `done`). Hanya pemilik (user dan klien OAuth yang sama) yang bisa melihat; selain itu `NOT_FOUND`. `expired` diturunkan dari waktu bila belum ada hasil.
- AC-28: Halaman `/admin/mcp/upload/<token>` ramah seluler: `<input type="file" accept="image/*">` (kamera/galeri), label dan pesan berbahasa Indonesia, target sentuh >=44 px, pratinjau ukuran/nama, status berhasil/gagal, tanpa JS berlebih; dikirim lewat rute dengan pemeriksaan Origin/CSRF CMS (`verifyCmsOrigin`) dan tanpa pelonggaran CSP.
- AC-29: Respons dan halaman upload membawa `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`; tidak masuk sitemap/robots publik.
- AC-30: Rate limit: maks 10 permintaan upload/impor per menit per Owner (HMAC `cms_auth.request_limits`, angka dapat disetel); melebihi -> 429 + `Retry-After`, tercatat. Percobaan token salah juga dibatasi per hash prefiks/sumber agar token tidak bisa ditebak.
- AC-31: Instruksi di deskripsi tool: bila Claude punya akses berkas dan jaringan, unggah ke `agentUploadUrl`; bila tidak, berikan `userUploadUrl` kepada Owner dan tanyakan lalu panggil `media_upload_status`; sebelum memasang, verifikasi (lewat thumbnail `media_get`) bahwa foto cocok dengan menu/halaman.
- AC-32: Audit (`mcp_audit`): `upload_requested`, `upload_completed`, `upload_rejected`, `media_imported`; mencatat user, klien, target, hasil, kode; tidak mencatat token, URL penuh, atau isi berkas.

### Q-6: Impor foto dari URL (`media_import_url`), butuh persetujuan (Q-8)
- AC-33: Hanya `https:` port 443 (port eksplisit selain 443 ditolak); tanpa userinfo; host harus nama DNS (literal IP dalam bentuk desimal/heksa/oktal/IPv6 ditolak); akhiran `.local`, `.internal`, `.localhost` ditolak.
- AC-34: Server me-resolve DNS sendiri (A dan AAAA) dan menolak bila SATU saja hasil berada di loopback, private (RFC 1918), link-local (termasuk 169.254.169.254), CGNAT 100.64.0.0/10, multicast, unspecified/reserved, ULA IPv6 (fc00::/7), link-local IPv6, IPv4-mapped/embedded IPv6 yang memetakan ke rentang tersebut, dan alamat metadata cloud.
- AC-35: Koneksi diikat (pin) ke IP yang sudah divalidasi (SNI/Host asli dipertahankan, verifikasi sertifikat tetap aktif) sehingga tidak ada resolusi kedua (cegah DNS rebinding).
- AC-36: Redirect maks 3; setiap hop divalidasi ulang penuh (skema, port, DNS, IP). Redirect ke `http:`, IP private, atau lebih dari 3 hop ditolak.
- AC-37: Timeout total 15 detik; aliran dipotong tegas pada 10.000.000 byte (Content-Length yang melebihi ditolak lebih awal, dan pemotongan tetap berlaku bila header bohong); tanpa kompresi (`Accept-Encoding: identity`); Content-Type harus `image/*` dan isi divalidasi `sharp`/kebijakan media yang ada; hanya JPG/PNG/WebP diterima.
- AC-38: Tautan berbagi Google Drive dan Dropbox diubah ke tautan unduhan langsung hanya untuk pola host yang dikenali (pola persisnya diverifikasi BE saat implementasi, tidak ditebak di spec); hasil ubahan tetap melewati AC-33..37. Halaman HTML (mis. peringatan Drive) ditolak sebagai bukan gambar.
- AC-39: Hasil impor lewat `createCmsMedia.upload` yang sama (AC-23), mengembalikan `assetDto` (+ thumbnail bila diminta). Audit `media_imported` hanya mencatat host (bukan path/query/URL penuh); URL penuh tidak masuk log, galat, atau DB.
- AC-40: Rate limit sama dengan AC-30 (dihitung bersama); maks 1 impor aktif per Owner dan global kecil (mis. 2) untuk melindungi VPS.
- AC-41: Fitur dapat dimatikan lewat satu variabel lingkungan server-only (default MATI di produksi sampai disetujui), tanpa memengaruhi tool lain.

### Q-7: Metadata media dan thumbnail
- AC-42: `media_list` dan `media_get` menyertakan `createdAt` (ISO); `media_list` tetap terurut terbaru lebih dulu.
- AC-43: `media_get` mengembalikan thumbnail (<=512 px sisi terpanjang, target <60 KB, JPEG/WebP) sebagai konten gambar MCP di samping JSON metadata, untuk aset gambar. Video/YouTube: tanpa thumbnail (atau poster bila ada; lihat Q-9). `storageKey`, path, dan byte asli tidak pernah muncul di output.
- AC-44: Thumbnail dibuat sesuai permintaan (tidak disimpan), dengan batas konkurensi; kegagalan membuat thumbnail tidak menggagalkan metadata (thumbnail dihilangkan, galat tercatat tanpa detail).
- AC-45: `media_list` tidak mengirim thumbnail 48 sekaligus (respons terlalu besar); keputusan bentuknya ada di Q-9.

### Q-8: Persetujuan jaringan keluar
- AC-46: Tidak ada kode `media_import_url` yang digabung ke main sebelum user menjawab "ya" untuk Q-8. Bila "tidak", tool tidak dibuat dan AC-33..41 dikeluarkan dari scope; sisanya tidak terpengaruh.

### Q-9: Migrasi 0019 dan persiapan production (SIAPKAN, JANGAN JALANKAN)
- AC-47: `drizzle/0019_mcp_uploads.sql` (+ `drizzle/meta`) membuat `cms_auth.mcp_uploads` dan memperluas CHECK `mcp_audit_event` dengan empat event baru; 0018 tidak diubah (hash tetap).
- AC-48: Grant minimum hanya untuk role aplikasi auth (tidak ada untuk role CMS terisolasi), tanpa `DELETE`/`SELECT` yang tidak perlu dan dengan `REVOKE` dari PUBLIC; `mcp_audit` tetap append-only.
- AC-49: Varian remote (Opsi P) di `drizzle-remote/` untuk 0018 dan 0019 mendukung role `tiny_osaka_staging_*`/`tiny_osaka_production_*` selain test/dev (0018 asli melempar galat untuk owner selain test/dev, jadi varian remote WAJIB dibuat); `npm run db:remote-sql:check` lulus; hash dipin di `scripts/lib/production-migration-plan.mjs`.
- AC-50: `REMOTE_MIGRATION_LIMIT` naik dari 18 ke 20; `production-migration-plan.mjs` (validasi jurnal 20 entri, status basis data: kosong -> 20 atau 18 -> 20; status lain ditolak seperti sekarang) dan `confirmationFor` (`<target>-0019`) diperbarui; `scripts/migrate-production-db.mjs` `verifyFinal` memakai `verifyAuthProtection(client, owner, { mcp: true })` dan tabel upload; `scripts/lib/auth-protection.mjs` memverifikasi tabel/grant/constraint `mcp_uploads`.
- AC-51: Rencana migrasi dev/test (`scripts/lib/dev-migration-plan.mjs`, `migrate-dev-db.mjs`, `migrate-test-db.mjs`) menerima status 20 entri; tes plan diperbarui.
- AC-52: `docs/runbooks/mcp-deploy.md` ada dan memuat urutan: backup -> dry-run -> apply (persetujuan terpisah) -> deploy -> buat klien OAuth -> hubungkan connector Claude -> izinkan domain, lengkap dengan cara verifikasi dan rollback tiap langkah. Redirect URI connector dan cara memasukkan OAuth Client ID di pengaturan connector HANYA diisi dari dokumentasi resmi Anthropic yang diverifikasi saat itu (tautan sumber dicantumkan); bila tidak bisa diverifikasi, ditulis "belum diverifikasi" dan bukan tebakan.
- AC-53: Tidak ada migrasi dijalankan ke staging/production oleh agen manapun; pra-cek migrasi ke DB test/dev lokal diperbolehkan setelah dump dan tinjauan SQL.

### Q-10: Tes dan verifikasi
- AC-54: Hasil NYATA dari: `npm run lint`, `npm run build`, `npm run test:mcp-unit`, `npm run test:mcp-db`, tes CMS yang terdampak (katalog, halaman, media; `cms-catalog-db` berurutan), `npm run db:remote-sql:check`, `npm run security:check`. Setiap kegagalan atau perintah yang tidak bisa dijalankan dilaporkan apa adanya. `npm audit` dilaporkan penuh.
- AC-55: Tes baru di bagian 7 ada dan lulus; tidak ada klaim lulus tanpa eksekusi.

## 4. File dan modul (usulan, final di BE/FE)

Backend
- Ubah: `src/server/mcp/tools.mjs` (skema opsional, `menu_update`, `page_update`, tool media baru, deskripsi), `src/server/cms/catalog.mjs` dan `src/server/cms/pages.mjs`/`current-pages.mjs` (hanya titik masuk TAMBAHAN untuk merge dalam transaksi; perilaku rute HTTP tidak berubah; Q-A), `src/server/cms/media.mjs` (createdAt/thumbnail sebagai tambahan non-merusak; Q-B), `src/server/mcp/audit.mjs` (event baru), `src/server/mcp/limits.mjs`, `src/server/mcp/runtime.mjs`/`compose.mjs`, `src/server/db/auth-schema.mjs`, `src/server/security/headers.mjs` (noindex/no-store/Referrer-Policy untuk rute upload; tanpa ubah CSP).
- Baru: `src/server/mcp/uploads.mjs` (permintaan, token, konsumsi atomik, status), `src/server/mcp/import-url.mjs` + `src/server/mcp/net-guard.mjs` (SSRF; hanya bila Q-8 disetujui), `src/server/mcp/thumbnails.mjs`, `src/server/mcp/merge.mjs` (merge menu/halaman).
- Rute baru: `src/app/api/mcp/upload/[token]/route.js` (agent, tanpa cookie), rute unggah sesi Owner untuk halaman (path final di BE, mis. di bawah `src/app/api/mcp/upload-session/`).
- Migrasi: `drizzle/0019_mcp_uploads.sql`, `drizzle-remote/0018_*.sql` dan `0019_*.sql` (hasil `scripts/build-remote-migrations.mjs`), `scripts/lib/remote-migration-sql.mjs`, `scripts/lib/production-migration-plan.mjs`, `scripts/lib/dev-migration-plan.mjs`, `scripts/lib/auth-protection.mjs`, `scripts/migrate-production-db.mjs`, `scripts/migrate-dev-db.mjs`, `scripts/migrate-test-db.mjs`.

Frontend
- Baru: `src/app/admin/mcp/upload/[token]/page.jsx` (server component; `requireAdmin("owner")` dari `src/server/auth/access.mjs`) + `src/features/cms/mcp/UploadForm.jsx` (Axios + hook sesuai konvensi CMS interaktif; komponen shadcn yang ada).

Docs
- Baru: `docs/runbooks/mcp-deploy.md`. (Pembaruan DECISIONS/ROADMAP/DEPENDENCIES hanya oleh pihak berizin; PM tidak mengubahnya.)

## 5. Tabel `cms_auth.mcp_uploads` (rancangan, 0019)

| Kolom | Catatan |
|---|---|
| `id` uuid PK | = `uploadId` |
| `user_id` FK users (cascade), `client_id` FK oauth_clients | pemilik dan klien OAuth |
| `agent_token_hash`, `user_token_hash` unik | SHA-256; token mentah tidak disimpan |
| `agent_expires_at`, `user_expires_at` | CHECK <= created + 5 menit / + 15 menit |
| `target` text null (<=200) | `menu:<slug>` atau `page:<pageKey>`; informatif |
| `mime` null, `byte_size` null | deklarasi opsional; CHECK mime dalam tiga tipe, size 1..10.000.000 |
| `status` | CHECK `pending|done|rejected` (`expired` diturunkan; A-5) |
| `used_at`, `used_via` (`agent|user`), `asset_id` uuid null (tanpa FK lintas peran/skema), `reject_code` text null | diisi saat selesai |
| `created_at` | indeks `(user_id, created_at)`, `(agent_expires_at)` untuk pembersihan |

Konsumsi: satu `UPDATE ... WHERE used_at IS NULL AND <expiry> > now() RETURNING` atomik. Pembersihan baris kedaluwarsa oleh pembersih yang sudah ada atau tambahan kecil (BE). Rollback: `DROP TABLE` + kembalikan CHECK event (hanya dev/test; remote lewat rencana rollback runbook).

## 6. Keamanan dan compliance

- Dipertahankan dari v1: OAuth 2.1 + PKCE, Owner-only, cek keanggotaan Owner dari DB pada setiap panggilan, token hash, audit append-only, rate limit, `Origin` check pada `/api/mcp`, `no-store`, noindex, tanpa merchant sync, tanpa link order, tanpa perubahan CSP.
- Tambahan unggah: token upload = kemampuan sekali pakai berumur pendek; URL muncul di percakapan Claude sehingga dibatasi 5/15 menit, sekali pakai, dan jalur user tetap butuh login Owner. Risiko token bocor di transkrip diterima karena pendek-sekali-pakai dan hanya bisa menambah SATU gambar tervalidasi ke pustaka (tidak bisa mengubah konten tayang).
- Perubahan konten berdampak langsung ke situs publik (ADR-036/037). Mitigasi prompt-injection: instruksi verifikasi foto (AC-31) dan tool tetap tanpa hapus halaman/merchant; `menu_delete` v1 tetap dengan `confirmName`.
- SSRF (AC-33..41), batas ukuran/waktu/konkurensi, tanpa penyimpanan URL penuh. Hanya host di audit.
- Tidak ada rahasia di klien bundle; variabel baru (flag impor, dll.) server-only.
- SEO: tidak ada perubahan metadata/canonical/sitemap/structured data; rute baru noindex dan di luar sitemap. Foto yang dipasang lewat tool tetap wajib alt (AC-8, AC-15).
- Merchant sync: tidak ada; tidak ada pemanggilan endpoint platform. Satu-satunya akses jaringan keluar baru adalah `media_import_url` dan hanya ke host publik hasil validasi.
- Compliance: unggah foto memakai kebijakan media yang ada; hak cipta/izin pemakaian foto yang diimpor dari internet tanggung jawab Owner (deskripsi tool mengingatkan, tidak ada klaim).

## 7. Tes dan verifikasi

Unit (`tests/unit/mcp.test.mjs` dan berkas baru di `tests/unit`)
- Merge menu: absen/`""`/nilai; nama dan harga absen; alt default = nama; `slug` saja ditolak; skema opsional.
- Merge halaman: parsial, kunci tak dikenal, alt default = judul, judul kosong.
- Token upload: panjang/entropi, hash, TTL 5/15 menit, status turunan `expired`.
- SSRF: tabel IPv4/IPv6 yang ditolak (loopback, RFC1918, link-local, 169.254.169.254, CGNAT, multicast, ULA, IPv4-mapped, literal desimal/heksa/oktal, `.internal`), URL dengan port/userinfo/skema salah, konversi Drive/Dropbox, pemotongan 10 MB, tolak `text/html`.
- Deskripsi tool memuat bagian Wajib/Otomatis/Contoh.

Integration (`tests/integration/mcp.test.mjs`, DB test lokal; `npm run test:mcp-db`)
- REGRESI DESKRIPSI (AC-5) dan serentak (AC-3); `PRODUCT_CONFLICT` pada `expectedVersion` berbeda.
- `page_update` merge parsial, `REVISION_CONFLICT`, halaman baru, foto + alt default.
- End-to-end `menu_create` + `media_upload_request` -> unggah agent -> `media_upload_status` done -> `menu_update` `imageAssetId` (alt = nama) -> kartu publik memuat gambar.
- Upload: token kedaluwarsa (jam terkontrol), pakai 2x, serentak 2x (satu aset), user beda, Staff, Owner dinonaktifkan, mime/byteSize tidak cocok, bukan gambar (mis. teks berekstensi .jpg), terlalu besar, dimensi >4096; cookie diabaikan di jalur agent; token di jalur user tanpa login.
- SSRF dengan server HTTPS uji lokal dan resolver yang dapat diganti (tanpa internet nyata): hostname ke IP private, redirect ke IP private, redirect >3, DNS rebinding (jawaban pertama publik, kedua private), timeout 15 dtk, aliran >10 MB, `text/html`, audit hanya host.
- Rate limit 429 + `Retry-After`; audit empat event baru; runtime tidak bisa UPDATE/DELETE `mcp_audit`; grant `mcp_uploads` minimum.
- Thumbnail: <=512 px, <60 KB, tidak ada `storageKey`/path pada output.

E2E (Playwright, lokal/test)
- Halaman upload di viewport seluler: login Owner -> pilih berkas (fixture sintetis) -> sukses; token kedaluwarsa dan terpakai menampilkan pesan Indonesia; Staff ditolak; tanpa pelanggaran CSP di konsol; label/fokus/kontras dasar.

Terdampak (harus tetap lulus): tes CMS katalog/halaman/media, `headers`, `auth`, `cms-catalog-db`, `db:remote-sql:check`, `security:check`, lint, build.

## 8. Migrasi production (siapkan, tidak dijalankan)

- Skenario A: DB remote kosong -> apply 0000-0019 (20 entri). Skenario B: DB remote sudah di 0017 (18 entri) -> apply 0018+0019 (state 18 -> 20). Status lain ditolak seperti runner sekarang (tanpa perbaikan otomatis). Perlu dipastikan ke user kondisi nyata staging/production (Q-D).
- Urutan: backup -> dry-run (rencana/hash/jurnal, tanpa tulis) -> apply dengan konfirmasi `<target>-0019` dan persetujuan eksplisit terpisah -> `verifyFinal` -> deploy -> klien OAuth -> connector -> izinkan domain (runbook).
- Rollback: sebelum apply = batalkan PR; sesudah apply = restore dari backup (tidak ada `DROP` otomatis di remote); kode v2 dapat dinonaktifkan tanpa menyentuh skema karena tabel baru tidak dipakai kode lama.
- Dokumentasi Anthropic (referensi, BELUM diverifikasi, jangan diisi dari ingatan): redirect URI connector; cara memasukkan OAuth Client ID di pengaturan connector (apakah bisa tanpa Dynamic Client Registration); pengaturan "izinkan domain" untuk akses jaringan Cowork/Code. BE/runbook mengambilnya dari halaman resmi dengan URL dan tanggal akses.

## 9. Risiko dan catatan

- R-1 (GERBANG PERSETUJUAN): `media_import_url` membuat server mengakses internet. Risiko SSRF, penyalahgunaan sebagai proxy, beban bandwidth/RAM VPS, dan hak cipta. Mitigasi AC-33..41 dan flag default mati. Butuh jawaban eksplisit user (Q-8).
- R-2: Token upload tampil di percakapan Claude; dibatasi waktu/sekali pakai (bagian 6).
- R-3: Merge dalam tool memerlukan titik masuk transaksi tambahan di layanan CMS; salah implementasi bisa membuka celah race. Ditutup tes AC-3.
- R-4: Claude chat web/HP tidak bisa mengirim berkas; hanya jalur `userUploadUrl` yang berfungsi di sana. Perilaku tiap aplikasi Claude (akses jaringan/berkas) tidak diasumsikan; diuji manual oleh Owner setelah deploy.
- R-5: Thumbnail menambah ukuran respons dan CPU `sharp`; dibatasi (AC-44, AC-45).
- R-6: `npm audit` penuh sudah punya temuan sebelum v2 (v1 mencatat 9); dilaporkan apa adanya.
- R-7: Remote 0018 belum pernah diterapkan; varian Opsi P baru perlu review hash menyeluruh.
- Rekomendasi urutan rilis: Q-1 (bug) dapat dirilis sendiri lebih dulu bila user mau, karena tidak bergantung pada migrasi.

## 10. Tugas per peran

### backend
1. Q-1/Q-2/Q-3: merge menu dan halaman dalam transaksi + kunci yang sama (titik masuk tambahan di `src/server/cms/catalog.mjs`, `current-pages.mjs`/`pages.mjs`), skema opsional di `tools.mjs`, alt default, deskripsi tool (Q-4).
2. 0019 + varian remote 0018/0019, grant, perbarui skrip rencana dan `verifyAuthProtection` (Q-9). Pra-cek hanya di DB test/dev lokal setelah dump.
3. Unggah: `uploads.mjs`, rute agent, rute sesi Owner, tool `media_upload_request`/`media_upload_status`, audit, rate limit, konsumsi atomik.
4. Impor URL + net-guard (hanya setelah Q-8 disetujui; bila perlu dependency/pustaka klien HTTP baru, minta persetujuan dulu).
5. `createdAt` + thumbnail pada `media_list`/`media_get`.
6. Tulis `docs/runbooks/mcp-deploy.md` (isi dokumen Anthropic hanya setelah diverifikasi).
7. Tes unit dan integration bagian 7.

### frontend
- Halaman `/admin/mcp/upload/[token]` dan `UploadForm` (seluler, Indonesia, aksesibel); dukung error token kedaluwarsa/terpakai/bukan pemilik; tanpa dependency UI baru.

### qa
- Jalankan seluruh daftar AC-54 dan tes bagian 7 di DB test lokal; uji negatif keamanan (upload, SSRF, RBAC); regresi CMS; laporkan perintah dan hasil aktual, temuan, risiko residual. Tidak ada staging/produksi/internet nyata.

## 11. Asumsi

- A-1: Hanya Owner (v1 A-1) dan hanya klien OAuth yang sudah disetujui yang boleh membuat permintaan upload.
- A-2: `mime`/`byteSize` pada request bersifat deklarasi opsional; yang menentukan adalah validasi isi berkas.
- A-3: Format `target` hanya informatif; foto tidak otomatis terpasang.
- A-4: Kegagalan isi berkas (bukan gambar, terlalu besar) mengonsumsi token; galat sementara 5xx tidak.
- A-5: `expired` tidak disimpan, diturunkan dari waktu.
- A-6: Satu baris punya dua token (agent dan user) dengan masa berlaku berbeda; jalur pertama yang sukses menutup yang lain.
- A-7: Angka rate limit 10/menit dan batas konkurensi impor adalah titik awal.
- A-8: Tidak ada dependency baru; `sharp`, `zod`, SDK MCP yang terpasang dipakai.

## 12. Pertanyaan terbuka

- Q-8 (WAJIB dijawab): Setujukah `media_import_url` (akses internet keluar dari server, dengan pagar SSRF di atas dan flag default mati di produksi)? Jika tidak, fitur dicabut dari v2.
- Q-A: Setujukah titik masuk TAMBAHAN di `src/server/cms/catalog.mjs` dan `current-pages.mjs` (tanpa mengubah perilaku rute HTTP) agar merge terjadi di dalam transaksi yang sama? Alternatif (membaca lewat `list`/`current` lalu menulis di transaksi lain) tidak memenuhi AC-3.
- Q-B: Menambah `createdAt` ke `assetDto` (juga tampil di API CMS, tambahan non-merusak) atau proyeksi khusus MCP?
- Q-C: `page_save` v1 dihapus (diganti `page_update`) atau dipertahankan sebagai alias?
- Q-D: Apakah staging/production sudah pernah dimigrasi sampai 0017, atau masih kosong? (menentukan skenario A atau B).
- Q-9: Bentuk thumbnail di `media_list`: tanpa thumbnail, atau hanya N (mis. 6) teratas dengan parameter `thumbnails: true`? Thumbnail video/poster YouTube?
- Q-E: Apakah klien Claude yang dituju mendukung konten gambar pada hasil tool dan akses jaringan keluar untuk `agentUploadUrl`? Tidak bisa dipastikan PM; diuji Owner setelah deploy.

## 13. Di luar scope

Widget unggah dalam chat (MCP Apps), link order, hapus halaman/media, merchant sync, edit/retouch gambar, penyimpanan thumbnail, unggah video, akses Staff, Dynamic Client Registration, structured data, migrasi/deploy ke staging atau production oleh agen.

## 14. Rollback

Q-1..Q-3, Q-7 dan tool: revert kode (tidak ada perubahan skema). Upload/impor: nonaktifkan tool dan rute upload; matikan flag impor. Skema 0019: hanya DB dev/test dengan `DROP TABLE cms_auth.mcp_uploads` dan kembalikan CHECK event; di remote lewat restore backup. Aset yang sudah terunggah dan konten yang sudah disimpan lewat tool tetap ada; pemulihan manual oleh Owner.

Menunggu persetujuan user. Setelah disetujui: backend -> frontend -> qa sesuai CLAUDE.md.
