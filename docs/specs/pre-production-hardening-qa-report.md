# QA Rilis PR-5 (pre-production hardening): hasil nyata

Tanggal: 2026-10-20. Branch: `feat/hardening-pr5-release-qa` (dari main 6bf029a). Status: **LULUS dengan catatan.** Semua suite wajib hijau. Ada 4 temuan audit moderate (dev-only, tidak diperbaiki, lihat bagian Audit). Tidak ada commit/push, staging/produksi, migrasi, atau perubahan kode aplikasi. `_export/` dan `backup_dev.sql` tidak disentuh. Lighthouse: dilewati atas keputusan user.

Semua perintah dijalankan sekuensial, satu per satu, tanpa run bertumpuk. Run `test:cms-catalog-db` pertama (20 Okt 09:28) macet karena run sebelumnya yang belum selesai; setelah proses tersebut hilang (komputer restart), run ulang lulus.

## Hasil perintah

| Perintah | Hasil | Catatan |
|---|---|---|
| `npm run lint` (max-warnings 0) | PASS, exit 0 | 0 warning |
| `npm run build` | PASS, exit 0 | ~26 detik |
| `node --test tests/unit/*.test.mjs` | PASS, 209/209 | |
| test:workflow-unit | PASS, 9/9 | |
| test:security-headers-unit | PASS, 7/7 | |
| test:db-config | PASS, 7/7 | |
| test:catalog-cards-unit | PASS, 45/45 | |
| test:db-connection | PASS, 4/4 | |
| test:catalog-regression | PASS, 90/90 | |
| test:publication-db | PASS, 15/15 | |
| test:pages-db | PASS, 19/19 | |
| test:media-db | PASS, 17/17 | |
| test:public-db | PASS, 5/5 | |
| test:auth-db | PASS, 21/21 | |
| test:cms-catalog-db | PASS, 27/27 (run ulang, 11,5 detik) | Run pertama 20 Okt 09:28 gagal `55P03` lock timeout karena run tumpang tindih; proses itu hilang setelah restart |
| test:catalog-delete-db | PASS, 9/9 | |
| test:cms-media-db | PASS, 6/6 | |
| test:cms-catalog-security-db | PASS, 9/9 | |
| test:auth-e2e | PASS, 8/8 | |
| test:cms-pages-e2e | PASS, 4/4 | |
| test:cms-catalog-e2e | PASS, 12/12 | |
| test:cms-media-e2e | PASS, 2/2 | |
| test:published-e2e | PASS, 36/36 + 3/3 | |
| test:e2e | PASS, 192/192 | ~1,6 menit |
| `npm run security:check` | PASS, exit 0 | Lihat catatan audit dan hasil di bawah |

Rincian `security:check`: `npm audit --omit=dev --audit-level=high` lulus (tidak ada temuan high), `test:auth-db` 21/21, `test:cms-catalog-security-db` 9/9, `scripts/security-check.mjs` OK (hak akses peran CMS dan proteksi katalog terverifikasi di DB test, tidak ada variabel server-only di `.next/static`, 37 file, 5 variabel dicek).

## Audit (tidak diperbaiki)

- `npm audit` (level all) melaporkan 4 temuan moderate: `esbuild <=0.24.2` (GHSA-67mh-4wv8-2f99, server dev dapat diakses lintas situs) dan rantai `@esbuild-kit/*`. Ini dependency dev (dari `drizzle-kit`). Tidak masuk ke build produksi.
- Perbaikan memerlukan naik versi `drizzle-kit`, yang oleh npm dinyatakan breaking (`drizzle-kit@0.18.1`). Tidak diupgrade sesuai aturan. Perlu persetujuan user.

## Yang tidak dijalankan

- Lighthouse: dilewati atas keputusan user.
- Cek staging manual (belum diverifikasi agen): konsol tanpa pesan CSP, YouTube consent iframe, menu Akun di staging. Di luar lingkup lokal.
- Verifikasi host DB dari `.env.test*.local`: tidak bisa dibaca langsung karena pembacaan kredensial ditolak. Test memuat env sendiri lewat skrip package.json.

## Bug aplikasi

- Tidak ditemukan bug aplikasi pada putaran ini. Semua suite lulus.

## Risiko sisa

- Empat temuan audit moderate di dev dependency (lihat bagian Audit).
- Run CMS katalog bisa macet tanpa batas jika ada run tumpang tindih, karena `node --test` tidak punya timeout per tes. `package.json` sudah berubah di luar agen ini (10:18:31): `test:cms-catalog-db` kini memakai `--test-concurrency=1`. Run ulang yang lulus dijalankan setelah perubahan ini. Perubahan ini perlu ditinjau dan disetujui user, atau dibatalkan. Penambahan timeout ditolak user.
- Cek staging manual belum diverifikasi (lihat Yang tidak dijalankan).

## Dokumen yang diubah

- `docs/runbooks/railway-staging.md` Langkah 19 butir 2: menunjuk menu Akun `/admin/account` (PR-3) dan cek konsol CSP enforce (PR-4). CRLF dipertahankan.
- `docs/specs/pre-production-hardening-qa-report.md`: laporan ini.

## Rollback

- Dokumen: `git checkout -- docs/runbooks/railway-staging.md` dan hapus `docs/specs/pre-production-hardening-qa-report.md`.
- Tidak ada perubahan kode, skema, atau data.
