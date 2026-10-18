# Tiny Osaka — Codex Repository Instructions

## Mission & precedence
Build and maintain Tiny Osaka's official conversion-first, Indonesian-language Japanese street-food website and custom CMS. Read `docs/REQUIREMENTS.md` first. Existing approved decisions outrank proposals. If implementation conflicts with them, stop and propose a change; do not silently reinterpret the scope. Consult relevant `.agents/skills/` when the task triggers one.

## Mandatory workflow: PLAN → WAIT FOR APPROVAL → IMPLEMENT → VERIFY
**Before any repository edit, code generation, dependency install, migration, Git commit, remote push, cloud action, or production operation:**
1. Inspect current repo state, task requirements and related files (read-only).
2. Summarize problem, affected modules, design, version-specific dependencies, alternatives, risk, test plan, and file-by-file change list.
3. Clearly mark unknowns/assumptions and ask for explicit user approval.
4. STOP. Do not write, scaffold, install, commit, or run mutating commands until approval is received.
5. Once approval is received, operate only inside approved scope and branch; if scope expands or destructive action is required, seek renewed approval.
6. Run appropriate tests and report actual command results and any failed/unrun checks. Review diffs before claiming completion.

Do not interpret a vague instruction like “proceed” as authorization to deploy, access live merchant data, or perform destructive data changes. There is no permission to self-approve.

## Code conventions
- Next.js App Router; **JavaScript/JSX, no TypeScript**. Pin major versions after checking docs and compatibility.
- Tailwind CSS; Headless UI for accessible primitives. Responsive, accessible, semantically correct HTML. Design tokens fixed in code, not owner-editable.
- Feature-oriented modules, straightforward naming, arrow functions, async/await, small readable functions; reusable components only when repeatedly used.
- Public server-rendered content should not rely on Axios in Client Components for search-indexable text; use server-side reads. Axios + custom hooks are appropriate for interactive CMS requests.
- Avoid premature abstractions, complex microservices, new dependencies without evidence, and commercial-only critical packages.
- Secrets in server-only environment variables. Never expose platform credentials to client bundles, tests, Git logs or messages.
- No unverified restaurant address, prices, ingredient claims, menu URLs, promotional claims, or official API capabilities in production content.

## Invariants & safety gates
- No direct on-site checkout, payment, inventory quantities, internal analytics dashboard, automated social feed, `Restaurant` schema, in-CMS image retouch, or automatic merchant sync on save.
- All content operations use server-side RBAC. Staff and Owner save pages and catalog products directly and changes go live on save (ADR-036, ADR-037); only Owner deletes catalog products and manages accounts and merchant sync. Scheduled publishing is removed.
- Deleting a catalog product is permanent and immediate, done by Owner (ADR-037); the append-only audit rule applies to `catalog_deletion_log` only.
- Catalog master in CMS. Platform sync only by Owner explicit action, with preview, per-platform enable switch, idempotency/retry/logs. Default OFF unless authorized partner API and sandbox verified. Saving never syncs.
- Merchant price equality is a business rule; validate the single product price and detect external differences (there are no modifiers). A merchant app login does not imply API rights.
- Never call live merchant endpoints without separate explicit consent and approved sandbox/production boundaries.
- GA4 tracks outbound order intent, never asserts completed orders. No PII in analytics parameters.
- SEO in Indonesian only (ADR-038) with verified public content; `Restaurant`/`LocalBusiness` structured data remains OUT OF SCOPE.
- Session max 24h; idle expiry 1h; secure reset and optional Owner MFA. Test server enforcement.
- Release requires lint, build, unit, integration, Playwright E2E, and security checks. Lighthouse mobile >=90 is target QA, not promise. Target good CWV.
- Deploy only after staging QA and explicit developer approval; no unapproved production migrations.

## Output at task end
Summarize modified files, behavior/acceptance criteria, security and SEO impact, tests **actually executed**, residual risks, and rollback instructions. Never claim success based on unexecuted tests.
