# Tiny Osaka — Approved Requirements (v1.6 katalog kartu + satu bahasa; diamandemen ADR-037/038, 2026-10-18)

## Business
Tiny Osaka: ONE restaurant delivery-only in Bandung, Indonesia. Goal: qualified outbound clicks to verified GoFood and GrabFood store/product pages; direct product link if confirmed, fallback to verified merchant store. No onsite ordering/payment. Mobile-first expressive Japanese street-food look; use original logo and truthful food photographs. Hero + featured items + strong CTA. Public: home, about, menu, product detail, food guides (takoyaki, okonomiyaki, burger), promos/events, manual social embeds, location/service info. Support video in products/storytelling. Indonesian-only content and metadata. English switching/authoring is removed by ADR-034.

## CMS
Owner/Admin and Staff/Editor; internal accounts only. Secure email/password, optional Owner MFA, email password reset. Staff drafts and submits for review; only Owner approves, rejects, publishes, schedules, archives, authorizes catalog version and merchant sync. Approval is for exact revision; edits do not alter published copy before reapproval. Fixed page templates + rich-text content editor; draft, review, scheduled, published, archived. Media: optimized responsive images, video upload or external embed, thumbnails/posters, lazy loading, manual social selection. Retouch is outside CMS. No owner design-token changes. [DIAMANDEMEN 2026-10-18 (ADR-036/037): Owner dan Staff aktif menyimpan halaman dan katalog langsung tayang; Hapus produk hanya Owner; scheduling dihapus. Kalimat approval/jadwal di atas usang untuk halaman dan katalog.]

CMS forms use one atomic Save all action for all pending content and media references. Main page fields are title and body; summary/media and template extras are optional. SEO defaults to authored title/summary. Catalog uses a name/category/price first form with optional descriptions and advanced variants/modifiers. Required review fields and local errors appear beside the bottom action row. Drafts may be incomplete; review/approval/publication remain explicit. Existing English rows are retained only for legacy snapshot integrity, never required for new drafts or publicly served. [USANG untuk katalog sejak ADR-037: form kini nama, deskripsi, satu harga IDR, gambar+alt opsional, tiga link order opsional; tanpa kategori/varian/modifier.]

Under ADR-035, Owner uses Setujui on saved content: exact revision validation, submission, approval and immediate publication commit atomically. An optional future WIB time schedules publication instead; the previous live revision remains until the worker succeeds. Staff still saves and submits for Owner review. Save all never approves or publishes. The user explicitly approved combining ADR-034 and ADR-035 after the concurrent editing session completed. [USANG untuk katalog dan halaman: Setujui/jadwal tidak berlaku (ADR-036/037).]

ADR-036 supersedes those workflow rules for website pages: Owner and enabled Staff use one fixed editor per page and one Save that immediately updates the public page. The page table shows name, last change time (WIB) and Edit. No page draft/revision/review/approval/publication controls are exposed. Full valid content and media commit atomically with real actor audit and optimistic conflict detection. Historical immutable snapshots/receipts remain internal for compatibility and recovery; no persistent unfinished snapshot is created by opening an editor. Catalog review/Owner permissions remain, except scheduling is removed across the CMS. The schedule page/navigation/controls are retired, schedule HTTP requests are denied and the foreground worker CLI is disabled without deleting old jobs/history. Saving a page cancels its superseded pending jobs in the same transaction. Saving pages does not sync merchants. [Katalog mengikuti pola yang sama sejak ADR-037; "Catalog review/Owner permissions remain" usang.]

## Catalog
CMS master katalog (ADR-037): produk berupa kartu (nama, deskripsi, satu harga IDR, satu gambar opsional dengan alt wajib, tiga link order opsional GrabFood/GoFood/ShopeeFood yang hanya disimpan, tidak tampil di publik). Tanpa kategori, varian, modifier, stok. Kesetaraan harga GoFood/GrabFood tetap aturan bisnis Owner. Verified deep links tampil di publik hanya setelah host resmi diverifikasi. Hapus permanen oleh Owner. (Teks lama tentang varian/modifier/topping diamandemen; riwayat ada di ADR-014..019 dan git.)

## Merchant sync
Explicit Owner-initiated Sync Menu separate from save, preview changes, per-platform independent results/retry, logs and ID mappings; enable/disable control (per-platform recommended but pending explicit confirmation); default OFF pending partner API verification. Merchant platform API eligibility/operation behaviors unresolved. If unavailable, launch website with catalog and links and leave sync disabled.

## SEO/analytics
SEO metadata title/description/canonical/OG, XML sitemap, robots, Indonesian public content, internal linking, accessibility, page speed. Google Search Console setup/verification. GA4 acquisition, sessions, traffic and order-link events with product/platform/source page/campaign dimensions; UTM per campaign. No analytics UI in CMS. **No Restaurant/LocalBusiness structured data**. Organic GEO can improve clarity not guarantee recommendation. [ADR-038: canonical/sitemap menunggu Phase 3; tanpa hreflang; URL tanpa prefix bahasa (/en 404, /id 308).]

## Security/quality
Server-side RBAC; max 24h session, idle 1h; rate limiting, CSRF/XSS, secure cookies, upload validation, secret management, audit sensitive login/approval/publish/merchant settings/sync. Unit/integration/Playwright E2E/security/dependency/build checks. Good CWV targets and Lighthouse mobile >=90 target QA.

## Operations
1k–10k visits/month. Under IDR 250k/month hosting target, excluding ads, domain and development. No domain chosen. Dev, staging only during QA, prod; production deployed manually after developer approval. Weekly **same-VPS** backup (high data-loss risk on total VPS failure). Uptime/application/job/sync monitoring. Transactional email only. Open-source-first, documented and inexpensive components, JavaScript/JSX; Git+Codex approval-first.

## Explicitly excluded
Website checkout/payment/order management, numeric inventory, CMS GA4 dashboard, Restaurant structured data, in-CMS AI retouch, auto social feed, public CMS registration, save-triggered merchant sync, editable CMS brand tokens, costly microservices/orchestration.

## Dependencies and unverified business inputs
Official GrabFood URL/product links, actual menu/ingredients/prices/modifier rules, original photos/logo, exact address/hours/claimed delivery coverage, access to partner APIs and safe sandbox, consent/privacy copy, domain, video limits, email sender, final ORM/auth/package versions. Unverified production claims must not be fabricated. [Tambahan 2026-10-18: host resmi GoFood/GrabFood/ShopeeFood untuk allowlist link order (saat ini kosong; ADR-037).]

## Authority
Derived from user-approved decisions through v1.4 on 2026-10-15. `docs/DECISIONS.md` records any later explicit changes. Never treat an example mock item as factual Tiny Osaka product data.
