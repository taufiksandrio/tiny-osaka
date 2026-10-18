# Usulan perubahan AGENTS.md (diterapkan HANYA oleh user)

Dasar: ADR-037 dan ADR-038 (docs/DECISIONS.md), disetujui 2026-10-18. Nomor baris merujuk AGENTS.md saat ini; verifikasi sebelum menerapkan.

## Baris 4
- conversion-first, bilingual Japanese street-food website
+ conversion-first, Indonesian-language Japanese street-food website

## Baris 28 (Invariants, RBAC)
- Staff may draft/submit; Owner approves revisions and publishes/schedules/archives.
+ Staff dan Owner dapat menyimpan halaman dan katalog langsung tayang (ADR-036/037); hanya Owner yang menghapus produk katalog dan mengelola akun/sync merchant. Scheduling dihapus.

(Kalimat sesudahnya, "Editing an approved revision invalidates that revision's approval; live content persists until approved replacement", perlu ditinjau karena alur revisi/approval tidak lagi dipakai untuk halaman dan katalog.)

## Baris 30 (merchant price)
- validate final modifier costs and detect external differences
+ validate the single product price and detect external differences (modifier tidak ada)

## Baris 33 (SEO)
- SEO ID/EN with verified public content; `Restaurant`/`LocalBusiness` structured data remains OUT OF SCOPE.
+ SEO Indonesia dengan konten publik terverifikasi; `Restaurant`/`LocalBusiness` tetap di luar scope.

## Tambah satu baris di Invariants
+ Hapus produk katalog bersifat permanen oleh Owner (ADR-037); audit append-only hanya berlaku untuk catalog_deletion_log.

Baris Session, sync, dan GA4 tidak berubah.
