# Spec: MCP Owner (server MCP untuk Owner Tiny Osaka)

Status: DRAFT, menunggu persetujuan user. Belum ada kode, dependency, atau migrasi yang diubah.
Penulis: PM. Tanggal: 2026-10-21. Branch kerja yang diusulkan: `feat/mcp-owner` (dibuat setelah persetujuan).

> PERHATIAN: permintaan menyebut "deskripsi pasted content", tetapi tidak ada konten tempelan yang diterima oleh PM. Spec ini disusun dari butir tugas pada permintaan (token, PKCE, endpoint OAuth, role validation, tool menu/page/media, tabel client/code/token di `cms_auth`) dan dari kode yang ada. Semua hal di luar itu ditandai ASUMSI (A-n) atau PERTANYAAN (Q-n). Mohon cocokkan dengan deskripsi asli sebelum menyetujui.

## 1. Overview

Fitur ini menambahkan satu endpoint MCP (Model Context Protocol) di aplikasi Next.js yang ada, sehingga klien MCP (asisten AI milik Owner) dapat membaca dan mengubah konten CMS atas nama Owner: menu (katalog kartu, ADR-037), halaman situs (ADR-036), dan metadata pustaka media. Akses memakai OAuth 2.1 Authorization Code + PKCE (S256); Owner menyetujui klien lewat halaman persetujuan di `/admin` yang dilindungi sesi CMS yang sudah ada.

Fitur ini adalah kanal tambahan untuk operasi yang sudah ada, bukan jalur baru di sekitar aturan bisnis. Setiap tool memanggil layanan CMS yang sama (`src/server/cms/*`) sehingga validasi, RBAC berbasis keanggotaan DB, penguncian, deteksi konflik versi, dan perilaku "simpan langsung tayang" (ADR-036/037) tidak diduplikasi. Tidak ada sinkronisasi merchant, tidak ada pemanggilan endpoint platform, dan tidak ada perubahan pada situs publik selain konten yang memang disimpan Owner.

## 2. Kesesuaian dengan keputusan yang sudah disetujui (hasil pengecekan)

| Sumber | Pengaruh pada spec ini |
|---|---|
| AGENTS.md: server-side RBAC, sesi maks 24 jam / idle 1 jam, MFA Owner opsional | Token MCP diperlakukan sebagai kredensial setara sesi; TTL dibatasi (lihat 4.3). Q-1 meminta konfirmasi tafsir. |
| AGENTS.md: tanpa dependency baru tanpa bukti | `@modelcontextprotocol/sdk` dan (mungkin) plugin OAuth hanya boleh dipasang setelah gerbang verifikasi di bagian 7 dan persetujuan eksplisit. |
| AGENTS.md: tanpa checkout, inventori, sinkronisasi merchant otomatis | Tidak ada tool sync/merchant. Out of scope. |
| ADR-036/037: Owner dan Staff boleh simpan halaman/katalog; hanya Owner hapus produk; hapus permanen tanpa dialog | Fitur ini Owner-only (Q-2). Tool hapus produk TIDAK masuk v1 (Q-3) karena permanen dan tanpa konfirmasi. |
| ADR-037 B-2: allowlist host link order kosong | Field link order (`grabfoodUrl`, `gofoodUrl`, `shopeefoodUrl`) TIDAK diekspos di tool v1 agar host sembarang tidak tersimpan lewat kanal baru. |
| REQUIREMENTS: "login aplikasi merchant tidak berarti hak API"; tanpa public CMS registration | Registrasi klien OAuth tidak boleh terbuka untuk publik (Q-4). |
| Header keamanan (`src/server/security/headers.mjs`): CSP enforce, `form-action 'self'`, `frame-ancestors 'none'` | Tidak ada pelonggaran CSP yang direncanakan; risiko redirect form diuji (R-2). |

Tidak ditemukan konflik langsung yang memaksa STOP, dengan syarat Q-1 sampai Q-4 dijawab user. Jika user menginginkan Staff juga memakai MCP, token berumur panjang, atau registrasi klien dinamis publik, itu melonggarkan invariant dan harus berupa ADR baru, bukan tafsiran diam-diam.

## 3. Acceptance Criteria

Server dan otorisasi
- AC-1: `POST /api/mcp` tanpa header `Authorization: Bearer` mengembalikan 401 dengan header `WWW-Authenticate` yang menunjuk ke metadata protected resource; tidak ada pemanggilan DB CMS sebelum token tervalidasi.
- AC-2: Cookie sesi CMS tidak pernah menjadi kredensial untuk `/api/mcp`; permintaan hanya dengan cookie ditolak 401.
- AC-3: Metadata `GET /.well-known/oauth-protected-resource` dan `GET /.well-known/oauth-authorization-server` mengembalikan JSON valid yang berisi hanya endpoint yang benar-benar ada, `code_challenge_methods_supported: ["S256"]`, dan `token_endpoint_auth_methods_supported: ["none"]`.
- AC-4: Endpoint authorize menolak (tanpa redirect ke URI tak tepercaya) permintaan tanpa `code_challenge`, dengan `code_challenge_method` selain `S256`, dengan `redirect_uri` yang tidak cocok persis dengan yang terdaftar, atau dengan `client_id` tak dikenal/nonaktif.
- AC-5: Authorization code sekali pakai, berlaku maksimal 60 detik, terikat ke `client_id`, `redirect_uri`, `code_challenge`, `resource`, dan user. Penukaran kedua, verifier salah, `redirect_uri` berbeda, atau code kedaluwarsa menghasilkan `invalid_grant` dan (untuk penukaran ulang) mencabut token turunan code itu.
- AC-6: Hanya user dengan keanggotaan `cms_auth.roles` aktif dengan role `owner` yang dapat menyetujui klien. Staff atau akun nonaktif melihat penolakan dan tidak ada code diterbitkan.
- AC-7: Pada SETIAP panggilan tool, server membaca ulang keanggotaan Owner aktif dari DB. Akun yang dinonaktifkan atau diturunkan role-nya langsung gagal 401/403 pada panggilan berikutnya tanpa menunggu token kedaluwarsa.
- AC-8: Access token berlaku maksimal 15 menit (A-3); refresh token dirotasi pada setiap pemakaian; pemakaian ulang refresh token lama mencabut seluruh keluarga token dan dicatat. Total umur keluarga token maksimal 24 jam sejak persetujuan dan idle maksimal 1 jam (A-3, Q-1).
- AC-9: Owner dapat melihat daftar klien yang disetujui dan mencabutnya di CMS; setelah dicabut, access token yang masih berlaku ditolak pada panggilan berikutnya.
- AC-10: Token, code, dan verifier tidak pernah ditulis ke log, audit, respons error, atau bundle klien; di DB hanya hash (SHA-256 atau setara yang dipilih BE) yang tersimpan (kecuali plugin terverifikasi menyimpan berbeda; lihat Q-5).

Tool
- AC-11: `tools/list` memuat 10 tool di bagian 5 (termasuk `menu_delete`); tidak ada sinkronisasi merchant, unggah media, atau pengelolaan akun.
- AC-12: Setiap input tool divalidasi ketat (bidang tak dikenal ditolak, setara `exactInput`/`parseProductInput`); kegagalan mengembalikan kode galat yang sama dengan API CMS (mis. `INVALID_PRICE`, `REVISION_CONFLICT`, `PRODUCT_CONFLICT`) tanpa membocorkan stack trace atau detail DB.
- AC-13: `menu_create`/`menu_update`/`page_save` yang sukses langsung memperbarui situs publik (perilaku ADR-036/037) dan memanggil invalidasi cache yang sama dengan rute HTTP yang ada (`revalidatePath` pada rute halaman; BE memastikan padanan untuk rute katalog). Tool yang gagal tidak mengubah salinan publik sebelumnya.
- AC-14: `page_save` dan `menu_update` dengan `expectedRevisionId`/`expectedVersion` yang usang mengembalikan konflik 409-setara dan tidak menulis apa pun.
- AC-15: Aktor pada riwayat/audit konten (workflow events) adalah user Owner yang nyata, bukan akun layanan.
- AC-16: Tool media hanya mengembalikan metadata (`assetDto`), tidak pernah byte berkas atau path penyimpanan.

Keamanan dan operasi
- AC-17: Setiap panggilan tool dan setiap peristiwa OAuth (authorize, code issued, token issued/refresh/revoke, reuse terdeteksi, penolakan) menulis satu baris audit append-only; runtime tidak dapat UPDATE/DELETE/SELECT tabel audit tersebut.
- AC-18: Rate limit berlaku pada endpoint authorize, token, dan `/api/mcp`; melebihi batas mengembalikan 429 dengan `Retry-After` dan dicatat.
- AC-19: Header `Origin` pada `/api/mcp`, bila ada, harus sama dengan origin situs; selain itu 403 (perlindungan DNS rebinding/CSRF browser).
- AC-20: Respons MCP dan OAuth memakai `Cache-Control: no-store`; `/api/*` dan `/.well-known/oauth-*` membawa `X-Robots-Tag: noindex, nofollow`.
- AC-21: Tidak ada perubahan pada CSP publik/admin selain yang terbukti perlu dan disetujui; tes `headers` tetap lulus.
- AC-22: Tidak ada panggilan jaringan keluar ke platform merchant dari kode fitur ini (diuji dengan tes yang memastikan tidak ada import/klien HTTP merchant).
- AC-23: Lint, build, unit, integration, E2E, dan pemeriksaan keamanan lulus; hasil `npm audit` penuh dilaporkan apa adanya (sudah ada 9 temuan sebelum fitur ini; dependency baru tidak boleh menambah temuan tanpa dilaporkan).

## 4. AUTH

### 4.1 Prinsip
- OAuth 2.1 Authorization Code + PKCE S256 saja. Tidak ada implicit, password grant, client secret, atau `plain`.
- Klien publik (`token_endpoint_auth_method: none`). Redirect URI dicocokkan persis; hanya `https:` atau loopback (`http://127.0.0.1`/`localhost`/`[::1]`, port bebas) untuk klien desktop (A-4).
- Audience: parameter `resource` (RFC 8707) harus sama dengan URL `/api/mcp` situs; token terikat ke resource itu (A-5, verifikasi terhadap revisi spesifikasi otorisasi MCP saat implementasi).
- Scope (A-6): `mcp:read` (list/get) dan `mcp:write` (create/update/save). Persetujuan Owner menampilkan scope secara jelas.

### 4.2 Endpoint (path usulan, final di BE)
| Endpoint | Metode | Fungsi |
|---|---|---|
| `/.well-known/oauth-protected-resource` | GET | Metadata resource (RFC 9728) |
| `/.well-known/oauth-authorization-server` | GET | Metadata server otorisasi (RFC 8414) |
| `/api/mcp/oauth/authorize` | GET | Validasi parameter, arahkan Owner ke halaman persetujuan `/admin/mcp/authorize` (login CMS bila belum) |
| `/api/mcp/oauth/authorize` | POST | Keputusan setuju/tolak; Owner-only; Origin + CSRF seperti `verifyCmsOrigin`; menerbitkan code |
| `/api/mcp/oauth/token` | POST | `authorization_code` dan `refresh_token`; verifikasi PKCE; rotasi refresh |
| `/api/mcp/oauth/revoke` | POST | Cabut token (RFC 7009) |
| `/api/mcp` | POST (+GET/DELETE sesuai transport) | Endpoint MCP; Bearer wajib |

Registrasi klien: tidak ada endpoint registrasi publik. Klien didaftarkan Owner dari CMS (Q-4). Jika klien MCP target mensyaratkan Dynamic Client Registration, itu keputusan terpisah.

### 4.3 Token dan sesi
- Token buram (opaque) acak 256-bit; disimpan sebagai hash. (Tidak memakai JWT kecuali plugin terverifikasi mewajibkan; lihat Q-5.)
- A-3 (usulan): access 15 menit; refresh dirotasi, idle 1 jam, absolut 24 jam dari persetujuan. Angka ini mengikuti invariant sesi AGENTS.md secara konservatif. Q-1: apakah invariant itu memang berlaku untuk token OAuth?
- Pencabutan: logout bukan pencabutan; token dicabut oleh Owner (CMS), saat akun nonaktif/diturunkan (dicek tiap panggilan), saat reset kata sandi/ubah kata sandi (BE perlu hook; `revokeSessionsOnPasswordReset` milik Better Auth hanya mencabut sesi, bukan token ini), dan saat deteksi reuse refresh.
- MFA Owner (opsional, sudah ada): persetujuan memakai sesi CMS yang sudah memenuhi MFA bila diaktifkan. Token tidak melewati MFA.

### 4.4 Validasi role (server-side, setiap panggilan)
Urutan: validasi Bearer (hash, belum kedaluwarsa/dicabut, resource cocok, scope cukup) -> baca `cms_auth.roles` (`enabled` dan `role = 'owner'`) -> jalankan layanan CMS. Implementasi memakai `createCmsPages/createCmsCatalog/createCmsMedia` dengan fungsi `authenticate` khusus MCP yang mengembalikan `{ subject, role }` dari token, sehingga pengecekan keanggotaan di dalam transaksi (`run` di `catalog.mjs`, `media.mjs`, `pages.mjs`) tetap berlaku. Perlu mengekspor konteks dari `src/server/cms/runtime.mjs` (saat ini privat; perubahan kecil, dikerjakan BE).

## 5. TOOLS

Semua tool: input objek ketat, tanpa bidang tambahan; output JSON; galat mengikuti kode CMS yang ada. Teks konten berbahasa Indonesia (ADR-034/038). Tool tidak boleh mengarang data produk; Owner/klien yang menyediakan nilai.

### Menu (katalog kartu, `src/server/cms/catalog.mjs`)
| Tool | Scope | Input | Output | Dasar |
|---|---|---|---|---|
| `menu_list` | read | `{}` | `{ products: [...] , role }` (bentuk persis mengikuti `readCards` di `src/server/catalog/products.mjs`; BE konfirmasi) | `catalog.list` |
| `menu_create` | write | `{ name (<=120), description? (<=1000), price (integer IDR >= 0), imageAssetId?, imageAlt? }` | `{ product }` | `catalog.create` + `parseProductInput` |
| `menu_update` | write | `{ slug, expectedVersion, name, description?, price, imageAssetId?, imageAlt? }` | `{ product }` | `catalog.update`; slug immutable |
| `menu_delete` | write | `{ slug, confirmName }` | `{ success: true }` | `catalog.delete` per ADR-037; permanent |

Catatan: `imageAlt` wajib bila ada gambar (ADR-037). `imageAssetId` harus aset yang sudah ada di pustaka media. Tidak ada kategori, varian, modifier, stok. Link order tidak diekspos (Q-6). **`menu_delete` dengan `confirmName`:** hapus permanen per ADR-037; wajib ketik ulang nama persis untuk cegah AI injection (contoh: klien kirim `{ slug: "salad", confirmName: "Salad" }`, server validasi `confirmName == product.name` sebelum hapus; ketidakcocokan = error 400 `CONFIRM_NAME_MISMATCH`).

### Page (`src/server/cms/pages.mjs`, `current-pages.mjs`)
| Tool | Scope | Input | Output | Dasar |
|---|---|---|---|---|
| `page_list` | read | `{}` | daftar halaman tetap: `key`, `updatedAt`, id publikasi | `pages.list` |
| `page_get` | read | `{ pageKey }` | `{ pageKey, id, version, fields, mediaRefs, mediaAssets, updatedAt }` | `pages.current` |
| `page_save` | write | `{ pageKey, expectedRevisionId (uuid\|null), expectedVersion, fields, mediaOperations[<=24] }` | hasil `readCurrentPage` setelah simpan | `pages.saveCurrent` |

Catatan: `pageKey` harus salah satu template tetap (`getPageDefinition`); `fields` mengikuti template halaman terkait; tidak ada layout bebas atau token desain. `page_get` harus dipanggil dulu untuk memperoleh `expectedRevisionId`/`expectedVersion`. Menyimpan halaman tidak menyinkronkan merchant.

### Media (`src/server/cms/media.mjs`)
| Tool | Scope | Input | Output | Dasar |
|---|---|---|---|---|
| `media_list` | read | `{ offset? (0..100000) }` | `{ rows: [assetDto], nextOffset, videoReady }` (48 per halaman) | `media.list` |
| `media_get` | read | `{ id (uuid) }` | `assetDto` (metadata saja) | `media.file` tanpa byte |
| `media_register_youtube` | write | `{ videoId, posterId }` | `assetDto` | `media.youtube` |

`media_upload` (unggah berkas) tidak masuk v1 (Q-7): isi gambar 10.000.000 byte dalam base64/JSON bertabrakan dengan batas body 80.000 byte `readCmsInput`, dan butuh desain pemeriksaan isi berkas tersendiri. Kemampuan referensi revisi lama (`media.references/reference`) tidak diekspos; media halaman lewat `mediaOperations` pada `page_save`, media produk lewat `imageAssetId`/`imageAlt`.

## 6. MIGRATIONS

Migrasi berikutnya: `drizzle/0018_mcp_oauth.sql` (0017 adalah yang terakhir). Skema Drizzle ditambah di `src/server/db/auth-schema.mjs`. Hanya dijalankan di DB test/dev lokal setelah pra-cek (dump, tinjau SQL); tidak ada migrasi produksi tanpa persetujuan terpisah (AGENTS.md).

Bentuk tabel bergantung pada hasil gerbang dependency (bagian 7). Dua jalur:
- Jalur A (plugin Better Auth terverifikasi layak): nama dan kolom tabel mengikuti skema plugin; PM/BE hanya menambah grant, indeks, dan tabel audit. Tidak ada tabel client/code/token kustom.
- Jalur B (implementasi kustom, butuh persetujuan eksplisit karena menyentuh kripto/otorisasi): rancangan di bawah.

Rancangan jalur B (schema `cms_auth`, semua dengan grant minimum untuk role aplikasi auth; runtime CMS tidak punya akses):
| Tabel | Kolom utama | Constraint penting |
|---|---|---|
| `oauth_clients` | `id`, `client_id` unik, `name`, `redirect_uris text[]`, `auth_method` (hanya `none`), `created_by` FK users, `disabled_at`, `created_at` | `CHECK (auth_method='none')`; URI tervalidasi aplikasi |
| `oauth_codes` | `code_hash` PK, `client_id` FK, `user_id` FK, `redirect_uri`, `code_challenge`, `challenge_method`, `scope`, `resource`, `expires_at`, `used_at`, `created_at` | `CHECK (challenge_method='S256')`; hapus baris kedaluwarsa oleh pembersih |
| `oauth_tokens` | `id`, `token_hash` unik, `kind` (access\|refresh), `family_id`, `client_id` FK, `user_id` FK, `scope`, `resource`, `expires_at`, `family_expires_at`, `last_used_at`, `revoked_at`, `replaced_by` | indeks `(family_id)`, `(user_id)`; `ON DELETE CASCADE` dari user |
| `mcp_audit` | `id`, `at`, `user_id`, `client_id`, `event`, `tool`, `target`, `outcome`, `code`, `request_id` | append-only: tanpa grant UPDATE/DELETE/SELECT untuk runtime (meniru `cms_auth.audit`) |

Rate limit memakai ulang `cms_auth.request_limits` (kunci HMAC), tanpa tabel baru. Rollback: `DROP` tabel baru (tidak ada data konten yang berubah); hanya DB test/dev. Konten yang disimpan lewat tool tetap berupa snapshot biasa dan tidak memerlukan rollback skema.

## 7. DEPENDENCIES (gerbang verifikasi, BELUM terverifikasi)

Kondisi terbaca: `better-auth` dan `@better-auth/drizzle-adapter` terpasang tepat 1.7.10 (`package.json`), `next` 16.4.1, `drizzle-orm` 0.45.4, Node >=22.16 <23. `@modelcontextprotocol/sdk` TIDAK ada di `package.json`. `zod` juga tidak ada di `package.json` (DEPENDENCIES.md hanya mencantumkannya sebagai kandidat). Isi `node_modules` tidak dapat diperiksa oleh PM (akses ditolak), jadi tidak ada klaim tentang plugin yang ada di paket terpasang.

Gerbang yang harus diselesaikan BE (read-only, `npm view`, dokumentasi resmi) sebelum permintaan instalasi:
1. Better Auth 1.7.10: apakah ada plugin/paket OAuth provider atau MCP yang resmi, memiliki versi cocok dengan 1.7.10 (peer range), berlisensi OSS, bukan beta/deprecated, mendukung PKCE S256 saja, klien publik, rotasi refresh, pencabutan, serta dapat dipakai dengan sesi CMS yang ada tanpa melemahkan kebijakan 24 jam/1 jam, `disableSignUp`, dan `authPaths` allowlist di `src/server/auth/service.mjs` (saat ini rute `/api/auth/*` yang tidak ada di allowlist dijawab 404, sehingga plugin baru tidak otomatis terjangkau).
2. `@modelcontextprotocol/sdk`: versi stabil terbaru, lisensi, peer dependency (termasuk Zod dan versinya), dukungan Node 22 dan transport Streamable HTTP yang dapat dipasang di Route Handler Next.js 16 (stateless), ukuran/RAM pada VPS 2 GB.
3. Revisi spesifikasi otorisasi MCP yang berlaku saat implementasi (persyaratan metadata, resource indicator, registrasi klien).
4. `npm audit` sebelum dan sesudah; laporkan penambahan temuan transitif. Instalasi memakai `--save-exact --ignore-scripts` dengan versi terkunci; tanpa `audit fix`/override.
5. Hasilnya dicatat sebagai pembaruan DEPENDENCIES.md/ADR baru (hanya user/agen berizin yang mengubah dokumen itu) dan DIMINTAKAN persetujuan user sebelum instalasi.

Jika tidak ada plugin layak: opsi (a) implementasi kustom minimal jalur B (butuh persetujuan karena kripto/otorisasi buatan sendiri, review keamanan ekstra), atau (b) tunda fitur. Keputusan ada pada user; PM tidak merekomendasikan salah satunya sebelum gerbang 1-2 selesai.

## 8. SECURITY

- Audit: lihat AC-17. Baris mencatat user, klien, tool, target (slug/pageKey/id aset), hasil, kode galat, request id. Tidak mencatat isi field, token, atau PII. Bukti kepemilikan konten tetap lewat workflow events dengan aktor Owner nyata (AC-15); `mcp_audit` menandai kanal MCP.
- Rate limit (A-7, angka usulan, dapat disetel): authorize 20/menit per user; token 20/menit per `client_id`; `/api/mcp` 60/menit per user dan tulis 20/menit per user; kegagalan Bearer beruntun dibatasi per hash token/prefix. Memakai pola `consume` HMAC di `service.mjs` (IP tidak tersedia karena `ipAddressHeaders: []`; BE perlu mengekspos `consume` atau menyalin polanya).
- CSRF/Origin: endpoint POST persetujuan memakai `verifyCmsOrigin`. `/api/mcp` memakai Bearer (bukan cookie) dan memvalidasi `Origin` (AC-19).
- CSP: tidak ada perubahan yang direncanakan. Halaman persetujuan memakai CSP admin yang ada (`frame-ancestors 'none'`, `form-action 'self'`). R-2: redirect setelah submit form ke URI loopback klien dapat diblokir oleh `form-action 'self'` di sebagian browser; verifikasi di E2E dan pilih penanganan tanpa melonggarkan CSP (mis. keputusan via `fetch` lalu navigasi dari klien). Pelonggaran CSP apa pun harus diusulkan terpisah.
- Pembatasan ukuran: body JSON maks 80.000 byte (selaras `readCmsInput`); `tools/call` dengan batas waktu; konkurensi dibatasi pool CMS (`max: 2`).
- Redirect: tanpa open redirect; `state` dikembalikan apa adanya; parameter tak dikenal diabaikan/ditolak.
- Rahasia: server-only; tidak ada `NEXT_PUBLIC_`; token tidak di URL selain parameter `code` yang sekali pakai.
- Prompt injection: konten yang dibaca tool (teks halaman/menu) adalah data tidak tepercaya bagi klien AI; tool tidak boleh menjalankan aksi hapus/merchant, sehingga dampak injeksi dibatasi pada ubah konten yang dapat dipulihkan lewat versi (catatan: tidak ada riwayat revisi yang diekspos; pemulihan ke teks lama memerlukan penyimpanan ulang manual, jadi `menu_update`/`page_save` tetap berdampak langsung ke situs publik). Q-8 menanyakan perlunya tombol "mode baca saja" (hanya scope `mcp:read`).
- SEO: situs publik tidak terpengaruh kecuali konten yang disimpan Owner. Metadata, canonical, sitemap tidak diubah. Endpoint baru noindex (AC-20) dan tidak masuk sitemap. Tidak ada structured data baru.
- Merchant sync: tidak ada. Tidak ada panggilan endpoint live (AC-22).

## 9. TEST PLAN

Unit (`tests/unit`)
- PKCE S256 (verifier valid/invalid, panjang, charset), tolak `plain`.
- Pembuatan/hash token, TTL, rotasi, deteksi reuse, pembersihan kedaluwarsa.
- Validator redirect URI (https, loopback, pencocokan persis, skema berbahaya).
- Skema input tiap tool (bidang ekstra ditolak, batas panjang, harga integer).
- `menu_delete`: validasi `confirmName` cocok/tidak cocok, error `CONFIRM_NAME_MISMATCH`.
- Logika scope dan resource; builder metadata OAuth.
- Tes headers: CSP tidak berubah; `/.well-known/oauth-*` noindex.

Integration (`tests/integration`, DB test lokal dengan role terpisah; tidak menyentuh dev/prod)
- Alur penuh authorize -> token -> `tools/call` untuk setiap tool terhadap DB test.
- Code replay, verifier salah, redirect_uri berbeda, code kedaluwarsa, client nonaktif.
- Refresh rotasi dan reuse (cabut keluarga); batas absolut 24 jam dan idle 1 jam dengan jam yang dikendalikan.
- Owner dinonaktifkan/diturunkan -> panggilan berikutnya ditolak (AC-7); Staff tidak dapat menyetujui klien; cookie saja ditolak.
- Konflik versi (`REVISION_CONFLICT`, `PRODUCT_CONFLICT`), validasi gambar+alt, tidak ada penulisan pada kegagalan.
- `menu_delete` dengan `confirmName` cocok: berhasil hapus; `confirmName` salah/kosong: error 400 `CONFIRM_NAME_MISMATCH`; hapus permanen verified (baris tidak ada di DB).
- Audit: baris tertulis, runtime tidak bisa UPDATE/DELETE/SELECT; tidak ada token/isi field di audit.
- Rate limit 429 + `Retry-After`; Origin salah 403.
- Aktor workflow events = Owner nyata; termasuk audit `menu_delete` event.

E2E (Playwright, `tests/e2e`; hanya lokal/test; tidak ada staging/produksi)
- Login Owner -> halaman persetujuan -> setuju -> klien uji menukar code; tolak -> `access_denied`.
- Klien MCP uji (SDK client bila lolos gerbang bagian 7) memanggil `menu_create`, `page_save`, lalu halaman publik menampilkan perubahan (pakai data uji sintetis; bukan data fakta Tiny Osaka).
- Halaman daftar klien: cabut -> panggilan berikutnya gagal.
- Verifikasi R-2 (redirect loopback vs `form-action`) di Chromium; tidak ada pelanggaran CSP di konsol.
- Aksesibilitas dasar halaman persetujuan (label, fokus, kontras) dan teks Indonesia.

Pemeriksaan rilis: lint, build, `npm audit` (laporkan hasil penuh), seluruh suite di atas. Tidak ada klaim lulus tanpa eksekusi nyata. Lighthouse publik tidak terpengaruh.

## 10. TUGAS PER PERAN

### backend
- Gerbang dependency bagian 7 (read-only) dan laporan ke user sebelum instalasi.
- `src/server/db/auth-schema.mjs`, `drizzle/0018_mcp_oauth.sql` (+ meta Drizzle), grant minimum; pra-cek migrasi di DB test lokal.
- Modul baru `src/server/mcp/` (usulan): `oauth.mjs` (authorize/token/revoke, PKCE), `tokens.mjs`, `clients.mjs`, `auth.mjs` (Bearer + validasi Owner), `tools.mjs` (daftar tool + skema), `server.mjs` (transport), `audit.mjs`, `limits.mjs`.
- Ekspor konteks layanan di `src/server/cms/runtime.mjs` agar `authenticate` khusus MCP dapat dipakai; pastikan invalidasi cache setara rute HTTP (`src/app/api/cms/pages/by-key/[pageKey]/route.js`, `src/app/api/cms/catalog/**`).
- Rute: `src/app/api/mcp/route.js`, `src/app/api/mcp/oauth/{authorize,token,revoke}/route.js`, `src/app/.well-known/**` (atau rewrite; path final menyesuaikan Next 16.4.1).
- `src/server/security/headers.mjs`: aturan noindex untuk `/.well-known/oauth-*` (tanpa mengubah CSP); `src/server/auth/service.mjs`: hook pencabutan token saat ubah/reset kata sandi dan nonaktif akun; ekspos `consume` untuk rate limit.
- Tes unit dan integration di `tests/unit` dan `tests/integration`.

### frontend
- Halaman persetujuan `src/app/admin/mcp/authorize/page.jsx` (server component yang memakai `requireAdmin("owner")` dari `src/server/auth/access.mjs`) + komponen di `src/features/cms/mcp/`: nama klien, scope, tombol Setuju/Tolak, teks Indonesia.
- Halaman Owner "Koneksi MCP" (daftar klien, daftarkan klien, cabut) di `src/app/admin/mcp/page.jsx`; tambah entri hanya-Owner di `src/features/cms/layout/AdminNav.jsx`. Komponen shadcn yang ada dipakai ulang; tanpa dependency UI baru. Permintaan interaktif CMS memakai Axios + hook sesuai konvensi.
- Penanganan hasil keputusan yang kompatibel dengan CSP (R-2) bersama BE.

### qa
- Jalankan seluruh test plan bagian 9 di DB test lokal; uji negatif keamanan (AC-1..10, 17..22) dan regresi CMS yang ada (`cms-catalog-db` berurutan, catatan PR-5).
- Verifikasi tidak ada perubahan CSP/headers selain noindex; verifikasi tidak ada panggilan live ke merchant.
- Laporkan perintah dan hasil aktual, temuan, dan risiko residual; tidak ada deploy.

## 11. Asumsi

- A-1: "MCP Owner" = akses MCP khusus Owner; Staff tidak punya akses MCP.
- A-2: "menu" pada permintaan = katalog kartu `/admin/catalog` (ADR-037); "page" = halaman tetap ADR-036; "media" = pustaka media.
- A-3: TTL access 15 menit, refresh idle 1 jam, absolut 24 jam.
- A-4: Klien berupa klien publik (PKCE) dengan redirect https atau loopback.
- A-5: Pengikatan audience via `resource` mengikuti spesifikasi otorisasi MCP yang berlaku saat implementasi (belum diverifikasi PM).
- A-6: Dua scope (`mcp:read`, `mcp:write`).
- A-7: Angka rate limit di bagian 8 adalah titik awal, bukan hasil pengukuran.
- A-8: Fitur hanya untuk dev/test lokal sampai ada persetujuan terpisah; belum ada domain/produksi; `BETTER_AUTH_URL` remote butuh HTTPS bernama DNS (aturan `config.mjs`).

## 12. Pertanyaan terbuka

- Q-1: Apakah invariant "sesi maks 24 jam, idle 1 jam" berlaku untuk token OAuth MCP (spec ini mengasumsikan ya)? Jika user ingin token lebih panjang, perlu ADR.
- Q-2: Konfirmasi Owner-only (A-1). Apakah Staff perlu akses MCP baca saja?
- Q-3: ✅ RESOLVED: Ya, `menu_delete` dengan `confirmName` safety. Owner ketik ulang nama persis; klien AI tidak bisa hapus jika nama salah. Permanen per ADR-037.
- Q-4: Siapa yang mendaftarkan klien OAuth: Owner lewat CMS (usulan), atau klien MCP target mensyaratkan Dynamic Client Registration/metadata dokumen klien? Klien MCP mana yang akan dipakai (ini menentukan kebutuhan registrasi dan format redirect URI)?
- Q-5: Apakah Better Auth 1.7.10 punya plugin OAuth/MCP yang layak pakai (jalur A), atau pindah ke jalur B / tunda? Belum dapat dijawab sebelum gerbang bagian 7.
- Q-6: Perlukah field link order diekspos lewat `menu_*` setelah allowlist host diisi user (ADR-037 B-2)?
- Q-7: Perlukah unggah media lewat MCP? Jika ya, perlu desain batas ukuran/format terpisah.
- Q-8: Perlukah mode baca saja per koneksi?
- Q-9: Apakah klien dapat berjalan di perangkat Owner saja (loopback) atau juga klien web jarak jauh (https redirect)? Berpengaruh pada validasi redirect URI dan domain produksi yang belum ada.
- Q-10: Isi "pasted content" yang tidak diterima PM: ada persyaratan lain (nama tool, nama tabel, path) yang harus menggantikan usulan di spec ini?

Risiko: R-1 kripto/otorisasi kustom bila tidak ada plugin layak; R-2 `form-action 'self'` vs redirect loopback; R-3 `npm audit` penuh sudah gagal sebelum fitur ini (9 temuan) dan dependency baru dapat menambah temuan; R-4 perubahan via AI langsung tayang dan tidak ada riwayat revisi yang dapat dibuka untuk pemulihan cepat.

## 13. Di luar scope (out of scope)

Tool hapus halaman/media, sinkronisasi atau panggilan merchant, unggah berkas media, link order, pengelolaan akun/role/MFA, penjadwalan, dashboard analitik, Dynamic Client Registration publik, akses Staff, structured data `Restaurant`/`LocalBusiness`, perubahan desain/token/layout, deploy atau migrasi produksi. (`menu_delete` MASUK scope v1 dengan `confirmName` safety.)

## 14. Rollback

Nonaktifkan/hapus rute `/api/mcp*` dan `/.well-known/oauth-*`, kembalikan perubahan kode, dan (hanya DB test/dev) hapus tabel baru. Konten yang sudah disimpan lewat tool tetap berupa snapshot normal dan tidak dibatalkan otomatis; pemulihan teks memerlukan penyimpanan ulang oleh Owner.
