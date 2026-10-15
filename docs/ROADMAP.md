# Implementation Roadmap — each step needs a separate approval

## Phase 0: Read-only discovery, version choices, repository bootstrap
- Ask Codex to inspect and produce plan only; approve toolchain and narrow scaffold separately.
- After approval: initialize Next.js JS/JSX App Router, Tailwind, ESLint, folder conventions, scripts, Git, verified package versions. No auth/DB/merchant calls.
- Acceptance: local dev server works; lint/build pass; no TS files; instructions present and Git clean after approved commit.

## Phase 1: Static public conversion shell + localization
- Responsive layout, nav/footer, `/id` and `/en` routing (after path approval), homepage/about/menu/product/guide/promo/location placeholders with unmistakable dummy content.
- Design tokens and responsive UI, accessible CTA skeleton; mock data in separate fixture folder.
- Acceptance: links navigable, mobile Playwright E2E, SEO metadata and page structure. No fabricated live restaurant facts.

## Phase 2: Catalog and content data
- Decide ORM, migrate schema, seed safe mock products, fixed content templates, localized fields, public server rendering, category/product pages; image/video capabilities with limits.
- Acceptance: validated modifier constraints and price, public approved data only, no numeric stock.

## Phase 3: Secure CMS + content approval
- Select verified OSS auth, owner/staff provisioning, reset and optional Owner MFA, server-enforced sessions 24h/1h idle, RBAC, rich-text, revision approvals, schedule/archive, media upload and audit.
- Acceptance: unit/integration/E2E include attempts to bypass Owner-only functions via API.

## Phase 4: Marketing, SEO, analytics
- Content ID/EN, CMS templates, campaign CTA URLs with verified links, GA4 event strategy, UTM and Search Console. Manual Instagram/TikTok embeds, privacy/consent assessment.
- Acceptance: GA4 event payloads mocked/tested; sitemap only approved published pages; proper canonical/hreflang; no Restaurant schema.

## Phase 5: Deployment and readiness
- On-demand staging, protected admin, weekly same-VPS backups plus tested restore, monitoring, production runbooks and manual deploy approval. No live merchant integration required.
- Acceptance: release checklist passes, performance mobile target tested, rollback possible.

## Phase 6: Merchant integration (conditional, post-launch allowed)
- Only after official API access and approved sandbox. Evaluate full/partial menu semantics; implement provider adapter mapping, import, dry-run preview, explicit owner sync, toggle, retries, logging, reconcile.
- Acceptance: no network calls with disabled sync; no live writes in tests; independent retry, safe conflict and destructive update protections.

**Each phase is subdivided into PR-sized tasks.** Before a task, Codex presents file-by-file plan and STOPs for explicit approval. Production deployment always requires separate permission.
