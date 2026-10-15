# Architecture & Product Decision Record

Each new decision: `ADR-XXX | date | status | context | alternatives | decision | reason | cost/security/maintenance implications | approver`.

## Baseline
- CONFIRMED business decisions: see `docs/REQUIREMENTS.md`.
- PROPOSED: Next.js App Router JS modular monolith + PostgreSQL + Tailwind/Headless UI, platform adapter interfaces, ID/EN locale paths.
- PENDING: Auth library, ORM, exact versions, video constraints, VPS provider, retention, API authorization.
- ACCEPTED HIGH RISK: backup only on production VPS.
- BLOCKED BY EXTERNAL: GoFood/GrabFood official partner API onboarding.

No user-approved technical choice should be silently recast as confirmed because it appears in this kit.

## ADR-001 — Toolchain lint sementara untuk development

- Date: 2026-10-15.
- Status: APPROVED, temporary, development only.
- Approver: user, explicit approval in this session ("setuju") after review of
  the proposed clean-install verification and temporary decision record.
- Context: ESLint 10.12.0 with eslint-config-next 16.4.1 passed lint, build and
  three stdin rule probes previously. However, npm reports invalid ESLint peer
  ranges for eslint-plugin-react 7.37.5, eslint-plugin-import 2.32.0 and
  eslint-plugin-jsx-a11y 6.10.2. The development dependency chain through
  fast-glob/micromatch/braces has five high-severity audit entries. The previous
  production-only audit reported zero vulnerabilities; this is not a complete
  security review.
- Alternatives: downgrade to unsupported ESLint 9; remove plugins and lose
  lint coverage; force dependency resolution; maintain a custom fork. None
  was selected. Reviewed stable upstream versions did not resolve both issues.
- Decision: retain the current pinned toolchain for development and allow
  Phase 1 planning while tracking these findings. Preserve all lint rules,
  audit findings and release gates. This does not approve Phase 1 code changes,
  a commit, deployment, or a security exception for release.
- Reason: avoid returning to unsupported tooling or weakening checks while
  upstream compatibility and security fixes remain unresolved.
- Cost/security/maintenance implications: no new service or paid package;
  dependency validation remains failing and security findings remain open.
  Reassess when relevant upstream fixes become available and before release;
  any dependency change requires a separately approved plan. Release still
  requires resolution/review of these findings and all existing QA gates.
- Verification on 2026-10-15: the approved npm ci attempt failed with EPERM
  unlinking lightningcss.win32-x64-msvc.node. File locking is suspected, not
  confirmed. No forced retry or process termination was performed. Package
  manifest and lockfile SHA-256 hashes were unchanged. Subsequent dependency,
  lint/build and audit checks were not rerun. Local node_modules may be
  partially removed and must be restored/verified before development resumes.
- Evidence: [Next.js ESLint compatibility](https://nextjs.org/docs/app/api-reference/config/eslint),
  [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), and
  [actual command results in README](../README.md).
- Rollback: remove this ADR and the corresponding latest README subsection;
  preserve earlier documentation and untracked bootstrap files. Dependency
  recovery is separate and requires a successful installation from the
  existing lockfile followed by verification.

## ADR-002 — Phase 1A public homepage and locale paths

- Date: 2026-10-15.
- Status: APPROVED, Phase 1A only.
- Approver: user, explicit "setuju" after the file-by-file Phase 1A plan.
- Context: public implementation started from a development status page;
  original logo, photographs, official catalog and merchant links are pending.
- Alternatives: implement every public template together, use language query
  parameters, or use an extra localization library. Not selected for this scope.
- Decision: `/id` and `/en` homepage routes, temporary 307 redirect from `/`
  to `/id`, and a root layout under `[locale]` with server-rendered localized
  content, correct HTML language, local metadata and development noindex.
  Reject unsupported locales. Use simple wrapping anchor navigation, a locale
  switch, header/footer, cream/red/charcoal tokens in code and labeled fixtures.
  Keep platform links unavailable until verified. Use no new dependencies.
- Reason: establish a reviewable bilingual homepage without fabricated catalog
  facts or additional interactive tooling. Domain-specific SEO metadata remains
  deferred until a domain and public content are verified.
- Cost/security/maintenance implications: no new external service or runtime
  dependency; no merchant requests, auth, uploads or analytics. Existing
  dependency findings remain open under ADR-001; no release exception is granted.
- Verification: npm ci, lint, build and diff whitespace checks passed. HTTP
  redirect/status/lang/metadata checks and local Chrome desktop/mobile,
  keyboard and locale navigation checks passed; see README for precise scope
  and limitations. npm ci restored local dependencies without manifest or
  lockfile hash changes. Playwright and full release gates remain pending.
- Boundaries: Phase 1B templates and Phase 1C E2E require separate plans and
  approval. No Git commit, push or deployment is authorized by this decision.
- Rollback: restore only affected existing files from the pre-Phase-1A local
  backup and remove the six new implementation files listed in README.
  Preserve all unrelated/untracked bootstrap files.

## ADR-003 — Phase 1B supporting public templates

- Date: 2026-10-15.
- Status: APPROVED, Phase 1B only.
- Approver: user, explicit "setuju" after the Phase 1B routes, file list,
  process-stop and verification plan.
- Context: Phase 1A supplied homepage shells; supporting content, official
  product facts, merchant URLs, original media and operational details are
  still pending. The website remains a development preview.
- Alternatives: localized slugs per language or building CMS-backed content
  now. Shared slugs and static fixtures keep this phase smaller to review.
- Decision: add `/menu`, `/menu/sample-01` through `sample-03`, `/about`,
  `/guides`, `/guides/takoyaki`, `/guides/okonomiyaki`, `/guides/burger`,
  `/promos` and `/location` under both `/id` and `/en`. Reuse page intros,
  menu cards and ordering notices. Preserve the current page when switching
  language, using one small pathname-aware Client Component. Keep page content
  server-rendered, localized metadata and development noindex. Reject unknown
  locales and detail slugs with 404.
- Reason: allow public navigation and template review before verified catalog
  content exists, without inventing products, ingredients, prices or offers.
- Cost/security/maintenance implications: no additional dependencies, external
  services, merchant API calls or live ordering URLs. No Restaurant/LocalBusiness
  schema, checkout, analytics or public data mutations. Existing dependency
  findings and release gates remain open under ADR-001. Production SEO awaits
  verified domain and content; guide pages are editorial placeholders.
- Verification: lint/build/diff checks passed. Local Node HTTP assertions checked
  24 pages, eight invalid routes, redirect and 26 internal link destinations.
  Chrome checked 72 page/viewport combinations, 12 language-switch round trips,
  keyboard skip link, breadcrumb and footer navigation; see README for limits.
  An old server initially occupied port 3001; after restart all HTTP assertions
  passed against the new build. Playwright and full release gates remain pending.
- Boundaries: Phase 1C E2E setup, future CMS/real content and deployment require
  their own approved scope. This decision authorizes no commit, push or deploy.
- Rollback: restore the eight affected existing files from the local pre-1B
  backup and remove only the 13 new files listed in README; preserve all
  baseline 1A and unrelated/untracked files.

## ADR-004 — Phase 1C repeatable public E2E and accessibility checks

- Date: 2026-10-15.
- Status: APPROVED implementation scope; initial automated findings resolved
  by the separately approved ADR-005 follow-up. Manual/release gates remain open.
- Approver: user, explicit "setuju" after the Phase 1C package, browser, test
  configuration, file list and verification plan.
- Context: ad hoc Chrome checks covered the preview, but no persistent E2E
  runner or automated accessibility scan existed.
- Alternatives: continue temporary browser scripts or add all browser engines
  immediately. A Chromium-only suite was selected to keep setup focused.
- Decision: pin @playwright/test 1.64.1 (Apache-2.0) and @axe-core/playwright
  4.14.0 (MPL-2.0) as devDependencies. Use JS tests and an MJS config; match
  Chromium to Playwright. Test production build on fixed localhost port 3030,
  never reuse an existing server, and cover desktop/mobile/small mobile with
  222 cases. Retain local failure reports, screenshots and traces ignored by Git.
- Reason: make route/metadata/navigation/keyboard/accessibility regressions
  reproducible without live merchant data or credentials.
- Cost/security/maintenance implications: local browser download/cache and
  two test workers; no paid service. Browser HTTP(S)/WebSocket requests outside
  the test server are blocked and reported; this is not a whole-system or SSR
  firewall. No product code, SEO metadata or lint/axe rules were weakened.
  Existing audit and peer dependency findings remain open under ADR-001.
- Verification: package/browser installs, final lint, build and diff checks
  passed. Initial E2E run completed: 150 passed, 72 failed, none skipped/flaky
  (about 157 seconds). All failures were axe scans: header wordmark accessible
  name mismatch on all 72 scans and low-contrast placeholder numbers on 54.
  All 84 route/metadata, 48 navigation/language and 18 keyboard cases passed.
  Axe incomplete results for decorative arrow glyphs require manual review.
  Full audit still reported five high development entries; production audit
  reported zero. See README and local reports for detailed evidence.
- Boundaries: the initial run was not accepted as passing; the separately
  approved UI fixes and passing rerun are recorded in ADR-005. Lighthouse,
  screen reader, Firefox/WebKit, future CMS domain
  tests and remaining security/release gates are not implied. No commit, push
  or deployment is authorized.
- Rollback: restore seven pre-1C files from the temporary backup and remove only
  playwright.config.mjs and the four new tests/e2e files. Restore dependencies
  from the old lockfile as needed; leave all website 1A/1B/navbar work intact.

## ADR-005 — Fix initial Phase 1C accessibility findings

- Date: 2026-10-15.
- Status: APPROVED and verified by the automated suite; manual/release gates open.
- Approver: user, explicit "setujui" after the proposed two UI fixes and
  documentation/rerun plan.
- Context: all 72 initial axe scans flagged the header wordmark accessible
  name; 54 scans also flagged translucent large placeholder numbers.
- Alternatives: retain the failing UI or suppress checks. Neither was selected.
- Decision: raise `.slot-number` opacity from .28 to .75 and remove the redundant
  wordmark aria-label so its visible text supplies the link's accessible name.
  Preserve decorative stamp aria-hidden, all test coverage and axe/lint rules.
- Reason: resolve the observed contrast/name failures without reducing checks
  or changing navigation, locale routing, metadata or dependencies.
- Cost/security/maintenance implications: no new dependency or external service;
  sample numbers appear stronger. Existing dependency security findings remain
  open. No SEO indexing or release decision changes.
- Verification: lint, build and diff checks passed. Full rerun completed with
  222 passed, zero failures/skips/flaky cases, in about 98 seconds. All 72 axe
  scans reported zero violations; no browser-safety attachments were generated.
  72 axe incomplete entries for decorative arrow contrast remain for manual
  review. Audit was not repeated because dependencies did not change.
- Boundaries: automated success does not imply full accessibility compliance,
  screen-reader/Lighthouse/cross-browser/CMS coverage, or release security approval.
  No commit, push or deployment was performed.
- Rollback: restore only the two product files, README and this decision record
  from the temporary pre-fix backup documented in README. The prior E2E JSON
  report is also preserved there. Retain the Phase 1C suite and all earlier work.
