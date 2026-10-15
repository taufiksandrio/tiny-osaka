# Tiny Osaka — Approved Requirements (v1.3 consolidated for implementation)

## Business
Tiny Osaka: ONE restaurant delivery-only in Bandung, Indonesia. Goal: qualified outbound clicks to verified GoFood and GrabFood store/product pages; direct product link if confirmed, fallback to verified merchant store. No onsite ordering/payment. Mobile-first expressive Japanese street-food look; use original logo and truthful food photographs. Hero + featured items + strong CTA. Public: home, about, menu, product detail, food guides (takoyaki, okonomiyaki, burger), promos/events, manual social embeds, location/service info. Support video in products/storytelling. Indonesian + English content with proper localized metadata.

## CMS
Owner/Admin and Staff/Editor; internal accounts only. Secure email/password, optional Owner MFA, email password reset. Staff drafts and submits for review; only Owner approves, rejects, publishes, schedules, archives, authorizes catalog version and merchant sync. Approval is for exact revision; edits do not alter published copy before reapproval. Fixed page templates + rich-text content editor; draft, review, scheduled, published, archived. Media: optimized responsive images, video upload or external embed, thumbnails/posters, lazy loading, manual social selection. Retouch is outside CMS. No owner design-token changes.

## Catalog
CMS authoritative master; products may have variants, modifiers, topping groups/addons, constraints; price equality required on GoFood and GrabFood. Verified deep links per product else verified store link. No stock/quantity management. Import existing merchant catalog only if officially authorized API available.

## Merchant sync
Explicit Owner-initiated Sync Menu separate from save, preview changes, per-platform independent results/retry, logs and ID mappings; enable/disable control (per-platform recommended but pending explicit confirmation); default OFF pending partner API verification. Merchant platform API eligibility/operation behaviors unresolved. If unavailable, launch website with catalog and links and leave sync disabled.

## SEO/analytics
SEO metadata title/description/canonical/OG, XML sitemap, robots, hreflang, localized public content, internal linking, accessibility, page speed. Google Search Console setup/verification. GA4 acquisition, sessions, traffic and order-link events with product/platform/source page/campaign dimensions; UTM per campaign. No analytics UI in CMS. **No Restaurant/LocalBusiness structured data**. Organic GEO can improve clarity not guarantee recommendation.

## Security/quality
Server-side RBAC; max 24h session, idle 1h; rate limiting, CSRF/XSS, secure cookies, upload validation, secret management, audit sensitive login/approval/publish/merchant settings/sync. Unit/integration/Playwright E2E/security/dependency/build checks. Good CWV targets and Lighthouse mobile >=90 target QA.

## Operations
1k–10k visits/month. Under IDR 250k/month hosting target, excluding ads, domain and development. No domain chosen. Dev, staging only during QA, prod; production deployed manually after developer approval. Weekly **same-VPS** backup (high data-loss risk on total VPS failure). Uptime/application/job/sync monitoring. Transactional email only. Open-source-first, documented and inexpensive components, JavaScript/JSX; Git+Codex approval-first.

## Explicitly excluded
Website checkout/payment/order management, numeric inventory, CMS GA4 dashboard, Restaurant structured data, in-CMS AI retouch, auto social feed, public CMS registration, save-triggered merchant sync, editable CMS brand tokens, costly microservices/orchestration.

## Dependencies and unverified business inputs
Official GrabFood URL/product links, actual menu/ingredients/prices/modifier rules, original photos/logo, exact address/hours/claimed delivery coverage, access to partner APIs and safe sandbox, consent/privacy copy, domain, video limits, email sender, final ORM/auth/package versions. Unverified production claims must not be fabricated.

## Authority
Derived from user-approved decisions through v1.3 on 2026-10-15. `docs/DECISIONS.md` records any later explicit changes. Never treat an example mock item as factual Tiny Osaka product data.
