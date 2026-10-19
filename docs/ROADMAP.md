# Implementation Roadmap — each step needs a separate approval

## Phase 0: Read-only discovery, version choices, repository bootstrap
- Ask Codex to inspect and produce plan only; approve toolchain and narrow scaffold separately.
- After approval: initialize Next.js JS/JSX App Router, Tailwind, ESLint, folder conventions, scripts, Git, verified package versions. No auth/DB/merchant calls.
- Acceptance: local dev server works; lint/build pass; no TS files; instructions present and Git clean after approved commit.

## Phase 1: Static public conversion shell + localization
- [Diamandemen ADR-038, 2026-10-18: situs satu bahasa Indonesia, rute tanpa prefix; `/id` dan `/en` sama-sama 404 biasa tanpa alihan.] Responsive layout, nav/footer, `/id` and `/en` routing (after path approval), homepage/about/menu/product/guide/promo/location placeholders with unmistakable dummy content.
- Design tokens and responsive UI, accessible CTA skeleton; mock data in separate fixture folder.
- Acceptance: links navigable, mobile Playwright E2E, SEO metadata and page structure. No fabricated live restaurant facts.

## Phase 2: Catalog and content data
- Decide ORM, migrate schema, seed safe mock products, fixed content templates, localized fields, public server rendering, category/product pages [diamandemen ADR-037: kartu produk, satu harga, gambar+alt, tanpa kategori/varian/modifier]; image/video capabilities with limits.
- Acceptance: validated modifier constraints and price, public approved data only, no numeric stock. [Diamandemen ADR-037: harga tunggal tervalidasi; data publik hanya yang tayang; tanpa stok numerik.]

## Phase 3: Secure CMS + content approval
- Select verified OSS auth, owner/staff provisioning, reset and optional Owner MFA, server-enforced sessions 24h/1h idle, RBAC, rich-text, revision approvals, schedule/archive [diamandemen ADR-036/037: scheduling dihapus; revisi approval hanya relevan bila dikembalikan], media upload and audit.
- Acceptance: unit/integration/E2E include attempts to bypass Owner-only functions via API.

## Phase 4: Marketing, SEO, analytics
- [Diamandemen ADR-038: konten Indonesia saja.] Content ID/EN, CMS templates, campaign CTA URLs with verified links, GA4 event strategy, UTM and Search Console. Manual Instagram/TikTok embeds, privacy/consent assessment.
- Acceptance: GA4 event payloads mocked/tested; sitemap only approved published pages; proper canonical/hreflang [diamandemen ADR-038: canonical dan sitemap hanya halaman tayang; tanpa hreflang]; no Restaurant schema. [Sitemap/canonical: dimajukan ke hardening PR-2, amandemen ADR-038 2026-10-19; Search Console dan GA4 tetap di fase ini.]

## Phase 5: Deployment and readiness
- On-demand staging, protected admin, weekly same-VPS backups plus tested restore, monitoring, production runbooks and manual deploy approval. No live merchant integration required.
- Acceptance: release checklist passes, performance mobile target tested, rollback possible.

## Phase 6: Merchant integration (conditional, post-launch allowed)
- Only after official API access and approved sandbox. Evaluate full/partial menu semantics; implement provider adapter mapping, import, dry-run preview, explicit owner sync, toggle, retries, logging, reconcile.
- Acceptance: no network calls with disabled sync; no live writes in tests; independent retry, safe conflict and destructive update protections.

**Each phase is subdivided into PR-sized tasks.** Before a task, Codex presents file-by-file plan and STOPs for explicit approval. Production deployment always requires separate permission.

## Tindak lanjut tahap 2 (ADR-037/038, butuh persetujuan terpisah)
- Hapus tabel/kolom kategori, varian, modifier dan terjemahan katalog (ulangi dry-run catalog-variants-report); nasib publication_jobs/event dan FK RESTRICT; (kolom/baris locale en: selesai oleh ADR-039/migrasi 0016); host resmi allowlist link order; tampilan publik link order + GA4 click_order; [canonical/sitemap sudah dimajukan ke hardening PR-2; Search Console tetap Phase 3]; prosedur penarikan gambar darurat; pengukuran CWV nyata; migrasi 0014/0015 ke dev/staging; backup off-VPS. Daftar lengkap: docs/specs/adr-037-038-draft.md bagian 4.
