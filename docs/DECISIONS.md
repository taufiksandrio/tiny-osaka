# Architecture & Product Decision Record

Each new decision: `ADR-XXX | date | status | context | alternatives | decision | reason | cost/security/maintenance implications | approver`.

## Baseline
- CONFIRMED business decisions: see `docs/REQUIREMENTS.md`.
- PROPOSED: Next.js App Router JS modular monolith + PostgreSQL + Tailwind/Headless UI, platform adapter interfaces, ID/EN locale paths.
- PENDING: Auth library, video constraints, VPS provider, retention, API authorization.
- ORM direction selected in ADR-006 and packages installed under ADR-007;
  tested schema/migration compatibility remains pending. Later ADRs govern any baseline
  proposal they explicitly resolve, including locale paths under ADR-002/003.
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

## ADR-006 - Phase 2A catalog/content design and ORM direction

- Date: 2026-10-15.
- Status: APPROVED design/documentation scope only; implementation pending.
- Approver: user, explicit "setuju" after the four-file 2A plan and exact branch
  and verification commands. No installation, migration or application change
  was included in that approval.
- Context: Phase 1 uses public fixtures. Two empty local PostgreSQL 18.6 UTF-8
  databases exist with separate NOLOGIN owners and revoked PUBLIC database
  privileges. LOGIN credentials and application schema are not provisioned.
- Alternatives: Prisma 7.10.0 or handwritten SQL/data access. Prisma's modern
  generator emits TS and its JS generator is deprecated; handwritten access
  requires more manually maintained mapping/migration conventions. Neither
  alternative was selected. No runtime/performance comparison was performed.
- Decision: select Drizzle ORM 0.45.4 (Apache-2.0), Drizzle Kit 0.31.11 (MIT)
  and pg 8.23.1 (MIT) as the next implementation proposal's pinned candidates.
  Keep JS/MJS source and verify the precise combination before migration use.
  Adopt stable identities, immutable catalog/page revisions, revision-owned
  children, exact revision approval, and atomic published pointers. Validate
  integer-IDR final variant/modifier costs and server-only published reads.
- Reason: establish a small reviewable data foundation consistent with JS source,
  bilingual fixed templates and the existing Owner approval requirements.
- Cost/security/maintenance implications: no new installed dependency/service,
  database mutation or public behavior change now. Separate runtime/migration
  and dev/test credentials require a future provisioning plan. Prevent live
  revision mutation, cross-revision references and draft leakage. Auth, media
  limits, actual catalog rules and production resource use remain unresolved.
  Merchant sync stays disabled; no API access is authorized. Preview noindex
  and the exclusion of Restaurant/LocalBusiness schema remain unchanged.
- Verification scope: read-only requirements/state/package metadata review plus
  documentation diff and whitespace checks; no runtime/schema acceptance claim.
  Actual checks are reported at task end. Prior security findings remain open.
- Boundaries: see PHASE2_PLAN.md for separately gated implementation steps.
  No package install, schema generation, credential creation, migration, seed,
  commit, push or deployment is authorized by this decision.
- Rollback: restore DATA_CONTRACTS.md, DEPENDENCIES.md and DECISIONS.md to the
  pre-2A state and remove only PHASE2_PLAN.md, preserving unrelated edits.

## ADR-007 - Local ORM configuration foundation

- Date: 2026-10-15.
- Status: APPROVED implementation scope; dependency security findings open.
- Approver: user, explicit "setuju" after the package/config/test/documentation
  file list and exact install/verification commands. Remain on
  `feat/catalog-data-plan` and preserve the earlier uncommitted 2A documents.
- Decision: install pinned drizzle-orm 0.45.4, pg 8.23.1, server-only 0.0.1
  and development-only drizzle-kit 0.31.11. Add JS/MJS config, an empty schema
  entry point, explicit lazy client factory, secret-free env template and Node
  tests. Do not create tables or initiate connections on module import/build.
- Alternatives: package-only installation would omit configuration validation;
  simultaneous role/schema/migration setup would exceed this reviewed scope.
- Security: accept only explicit IPv4/IPv6 loopback URLs on PostgreSQL port 5432
  targeting tiny_osaka_dev or tiny_osaka_test as selected. Permit matching
  `_app`/`_migrator` role names, reject administrator/NOLOGIN owner credentials,
  cross-target URLs and connection options. Names are a configuration guard,
  not proof of actual DB role privileges. DB grants need later verification.
  Validation errors do not echo URLs/passwords or attach parser causes.
  `server-only` blocks client imports; no automatic singleton/connect is added.
- Cost/maintenance: small local pool limit of two per explicitly created client
  is a starting configuration, not measured VPS tuning. Future consumers must
  reuse/close pools. No external service, merchant calls, auth or SEO changes.
- Verification: configuration/import tests 7/7, Kit version check, lint and build
  passed; production audit zero findings. Full audit failed with five existing
  high and four added moderate affected-package entries. See DEPENDENCIES.md.
  No downgrade/override/audit fix was applied; no release exception is granted.
  Playwright: 222 passed, exit 0 (4.0m), after manual cleanup of its own local
  test server during stalled teardown; see README. Unattended teardown remains
  an environment concern, not a waived test or a release approval.
- Boundaries: no LOGIN provisioning, real password/env file, connection query,
  migrations/seeds, public read-path switch, commit, push or deployment. Schema
  and DB integration acceptance remain pending, despite passing import tests.
- Rollback: remove only the six new configuration/template/test files and four
  new package entries, undo the added script and this step's documentation,
  restoring its previous lockfile/dependency tree. Preserve all Phase 2A design
  documents and unrelated work; do not restore them wholesale from HEAD.

## ADR-008 - Local application LOGIN roles and connection verification

- Date: 2026-10-15.
- Status: IMPLEMENTED; local role isolation and connectivity verified. Release gates remain open.
- Approver: user, explicit "setuju" after the two-account, file list and command
  plan. No migration or catalog data change is included.
- Decision: create tiny_osaka_dev_app and tiny_osaka_test_app with LOGIN and
  CONNECT only to their respective local database. Neither is a superuser,
  database/role creator, replication/bypass-RLS role or member of its owner role.
  Use NOINHERIT and connection limit five. Existing NOLOGIN owners stay intact.
  No migration role or table/schema privileges are granted in this stage.
- Provisioning: SQL checks target database owners/PUBLIC isolation and refuses
  existing target roles; psql --single-transaction rolls SQL back on error.
  Administrator and app passwords use local interactive prompts and SCRAM.
  Env files are created exclusively and restricted to the current Windows SID
  before secrets are written. Distinct app secrets of at least 20 characters
  are checked locally for env entry. Passwords are not placed in source/args/chat.
- Alternatives: use the postgres administrator or share dev/test credentials;
  rejected for excessive privileges and isolation risk. Credentials entered
  locally need no additional package or external service.
- Verification: syntax checks and seven configuration tests passed. Four real
  read-only integration cases passed (exit 0): Drizzle dev/test connections,
  actual role privilege checks and PostgreSQL denial of cross-database CONNECT
  in both directions with SQLSTATE 42501. Both env files are ignored by Git;
  ACL inheritance is disabled with one current-user access rule per file.
  The sandbox could not read private env files; rerun in the permitted user
  context succeeded without relaxing ACLs. Lint/build results are in README.
- Recovery: an early attempt failed without a definitive cause. The next SQL
  attempt committed, but env entry rejected a short password confirmed by the
  user. CompleteExistingRoles validates existing roles/grants, then interactively
  resets their passwords and writes private env files without recreating roles
  or changing grants. Administrator authentication failed on an intermediate
  recovery attempt; the final attempt configured both env files successfully.
  Phase/exit-code/type/line diagnostics now avoid hiding the failing step while
  withholding raw messages and secrets. These are resolved setup attempts,
  not evidence of an active connection failure.
- Limits: this isolates the two project databases, not all databases in the
  PostgreSQL cluster. Other databases' existing PUBLIC grants are not changed.
  No table privileges exist yet; future schema/migration grants require review.
  Login roles are infrastructure accounts, not CMS Owner/Staff accounts.
  Existing dependency findings remain open. Public content/SEO is unchanged.
- Failure/recovery: after SQL commit, env creation may still fail or a password
  may be re-entered incorrectly. Report state without secrets and do not blindly
  rerun provisioning or overwrite credentials. Recover against observed state.
- Rollback: separately inspect dependencies, revoke the two explicit CONNECT
  grants and remove only these new roles when safe; preserve both databases and
  their NOLOGIN owners. Remove this stage's env/scripts/integration test/script
  entry/documentation without discarding prior uncommitted Phase 2A work.
  No commit, push or deployment is authorized.

## ADR-009 - Phase 2B1 draft catalog schema and offline migration generation

- Date: 2026-10-16.
- Status: APPROVED implementation scope; SQL generated/reviewed, not applied.
- Approver: user, explicit "setuju" after the seven-table scope, file list,
  generator/verification commands and migration-execution exclusion.
- Context: local dev/test connectivity is verified, but schema.mjs was empty;
  real menu rules, auth/publishing and migration role provisioning remain pending.
- Alternatives: implement all variants/modifiers/approval/content at once or
  execute generated SQL immediately. Neither was selected; the reviewed scope
  is a draft foundation with migration files only.
- Decision: implement seven JS tables for revision, stable category/product
  identity, revision-owned entries and ID/EN translations. Use UUID keys, unique
  shared slugs, positive version, nonnegative ordering, locale/title checks and
  composite foreign keys with RESTRICT actions. Status accepts draft only.
  Generate 0000_catalog_foundation.sql plus matching snapshot/journal using
  pinned Drizzle ORM 0.45.4/Kit 0.31.11. No additional dependency is installed.
- Security/maintenance: no public source switch, approval bypass, API, auth,
  price, inventory, media or merchant operation. Version comparison/increment
  and approved revision immutability require future service/DB protections.
  No database object/privilege is changed. No SEO or fixture-content change.
  Existing dependency findings remain open; no release exception is granted.
- Verification: initial generator failed with uv_os_get_passwd ENOMEM in the
  sandbox. The authorized retry outside that sandbox passed without DB execution.
  Generated SQL reviewed: seven CREATE TABLE, six ADD CONSTRAINT, one CREATE INDEX;
  all six FK actions restrict update/delete, no destructive statements/DML.
  Offline snapshot/journal structure check, 7 configuration tests, 4 read-only
  connection/isolation tests, lint and build passed. Diff checks are recorded
  in README. Actual DB constraint/migration tests and E2E/audit rerun were not
  performed in this scope.
- Boundaries: real schema application, migration roles/grants, seeds, approval,
  publication, further catalog fields, commit/push/deploy require their own scope.
  Neither schema imports nor the reviewed file counts establish PostgreSQL
  constraint enforcement. This is not completion of all Phase 2 requirements.
- Rollback: restore only schema.mjs to its pre-2B1 empty entry point, remove the
  three generated migration/metadata files and undo this step's documentation.
  Keep all earlier uncommitted work and both databases/role/env configurations.

## ADR-010 - Test-only catalog migration and focused constraint checks

- Date: 2026-10-16.
- Status: APPROVED and implemented in the local test database; release gates open.
- Approver: user, "oke lanjutkan" after the concrete 2B2 files/commands plan and
  explicit instruction to skip repeated unrelated checks. No dev/prod migration,
  commit, push or deployment is included.
- Decision: provision tiny_osaka_test_migrator with CONNECT to test, NOINHERIT,
  no administrator flags, and SET-only membership in tiny_osaka_test_owner.
  Keep migration credentials separate in an ignored Windows-ACL private env.
  Verify role/target before SET ROLE; the NOLOGIN owner owns the resulting objects.
  Use the installed Drizzle migrator inside an outer transaction to apply only
  the reviewed SQL, with explicit public search_path, hash/journal/history checks
  and an advisory lock. No application privilege is expanded.
- Alternatives: use postgres for the runner, grant application table ownership,
  or migrate development simultaneously. Rejected to preserve boundaries.
- Verification: PowerShell/Node syntax checks, two target guard cases, lint and
  diff checks passed. Migrator setup initially failed postgres authentication;
  retry succeeded before schema execution. Migration application passed; a
  second invocation detected the same history and made no changes. Seven of eight
  DB cases passed initially; one test expected the wrong SQLSTATE for RESTRICT.
  Correcting only its expected code to 23001 and rerunning that case passed.
  All eight behaviors are therefore checked, without claiming a second full
  eight-case run. Synthetic fixtures rolled back; seven tables remained empty.
  Role ownership/application denial and a read-only dev-unmigrated check passed.
- Security/cost/SEO: no new package or external service. Runtime app cannot
  SET ROLE owner, CREATE TABLE or read these draft tables. Test-only migrator
  can assume its database owner and must remain separate from app credentials.
  No public route/data, SEO, merchant operation, secret output or auth change.
  Existing audit/peer findings remain open. No release exception is granted.
- Deferred checks: previous configuration/connection suites, build, E2E, audit,
  Lighthouse and comprehensive security were not repeated for this isolated
  change, per the user's instruction. Repeat relevant checks on new changes or
  failure; full release requirements still apply.
- Boundaries/rollback: only test now has the seven catalog tables and Drizzle
  metadata. Never use the pre-application file-removal rollback after this step.
  Inspect actual data/dependencies and seek approval for a scoped reverse
  migration/restore; preserve dev, SQL/history and unrelated earlier work.
  No drop/reset/truncate/CASCADE cleanup or migration rollback was executed.

## ADR-011 - Local development foundation migration

- Date: 2026-10-16.
- Status: IMPLEMENTED locally; dev migration and read-only verification passed.
- Approver: user, explicit "setuju" after the dev-only file/command plan.
  Remain on feat/catalog-data-plan; preserve previous uncommitted work.
- Decision: add a separate dev migrator LOGIN and private ignored env, a dev-only
  guarded foundation runner and read-only metadata/runtime privilege verification.
  Reuse the installed pinned Drizzle/pg packages; no dependency change.
- Alternatives: defer dev migration until later schema fields, or share the test
  runner/credentials. Separate runners keep the reviewed database targets explicit.
- Security: require DEV_MIGRATION_DATABASE_URL and the exact loopback dev identity;
  reject app/admin/test credentials, role privilege drift and unreviewed SQL/history.
  Migrator may SET ROLE to NOLOGIN dev owner; runtime app receives no new grants.
  Provisioning uses local interactive passwords, SCRAM and private Windows ACLs.
- Acceptance: guard/syntax/lint checks, initial migration, safe second invocation,
  seven empty owner-owned tables, matching history, six RESTRICT FKs and runtime
  privilege isolation. Guard/syntax/lint checks passed. Interactive setup completed;
  private env ACL/ignore checks passed in user context. First migration and no-change
  second invocation passed (exit 0); all listed read-only DB checks passed (exit 0).
  No new test records were inserted. Exact commands/results are in README.
- Boundaries: only local dev foundation; no seed, test/prod changes, public source
  switch, CMS/auth, prices/modifiers, merchant call, commit, push or deployment.
  Prior audit/peer findings and release gates remain open; public SEO unchanged.
- Rollback: provisioning and migration are separate transactions. On setup failure,
  inspect status and role/env state before recovery; do not overwrite secrets.
  After schema application, preserve SQL/history and request a reviewed reverse
  migration/restore after inspecting data and dependencies. No destructive cleanup.

## ADR-012 - Offline catalog pricing foundation without a business ceiling

- Date: 2026-10-16.
- Status: implemented schema/validator and generated SQL offline; DB execution deferred.
- Approver: user "oek lanjutkan" following the concrete schema/validator/offline
  migration plan and explicit revision to no business price ceiling. Stay on
  feat/catalog-data-plan and preserve prior uncommitted work.
- Business policy: one internal standard variant for a simple product; modifiers
  apply to all product variants; each option once; nonnegative base/delta integer
  IDR amounts. Initial 100000 proposal was superseded before implementation.
- Technical decision: PostgreSQL bigint with Drizzle number mapping, individual
  CHECK bounds 0..Number.MAX_SAFE_INTEGER and pre-addition overflow checks in the
  validator. This is a technical limit, not a business ceiling. No new dependency;
  use installed Drizzle ORM 0.45.4, Kit 0.31.11 and pg 8.23.1.
- Design: six revision/product-scoped tables with ID/EN translations, composite
  RESTRICT FKs, unique codes/identities, min/max/single constraints. Drafts may be
  incomplete; pricing-readiness validation checks cross-row option feasibility.
- Alternatives: retain 100000 cap (rejected by user), int4 storage (unnecessarily
  narrow range), arbitrary-precision values throughout the API (more conversion
  complexity than current need). The exact safe integer range is documented.
- Security/SEO: pure calculator requires trusted server-loaded data. It is not an
  auth, published-data or merchant verifier; no routes, grants, secrets, approval,
  publication, pricing warnings or public content/SEO changes are included.
- Verification: 20 unit cases passed; syntax and offline SQL/snapshot checks passed.
  Generator failed uv_os_get_passwd ENOMEM in sandbox; authorized user-context retry
  succeeded. Six CREATE TABLE and six ADD CONSTRAINT statements, scoped RESTRICT
  FKs, preserved 0000 hash/journal and unchanged prior seven snapshot tables checked.
  Lint/final diff results recorded in README. No DB constraint execution claim.
- Boundaries: no DB migration, seeds, app privilege change, runner update, API,
  checkout/inventory, merchant calls, package change, commit, push or deployment.
  Existing one-migration runners now fail closed on the additional file/journal;
  a reviewed test-first migration stage is required before using them again.
- Rollback: before 0001 application, remove only new pricing module/test/0001 SQL
  and snapshot; restore journal to its original single preserved 0000 entry and
  remove only this stage's appended schema definitions/imports/documentation.
  Preserve applied 0000 SQL/history, previous work and databases. After eventual
  application, file-only rollback is invalid; inspect data and plan reverse/restore.

## ADR-013 - Test-only pricing migration and PostgreSQL verification

- Date: 2026-10-16.
- Status: IMPLEMENTED in tiny_osaka_test; development remains foundation-only.
- Approver: user "oke setuju" after the concrete runner/test/files/commands plan.
  Scope stays on feat/catalog-data-plan; previous uncommitted work is preserved.
- Decision: update only the test runner to accept exact reviewed 0000/0001 files,
  journal and hashes. Require an existing reviewed foundation baseline or a fully
  migrated state; empty databases are refused. Check table/relation names, kinds,
  NOLOGIN-owner ownership and metadata schema ownership, with the existing role
  target guard, advisory lock and outer transaction. No runtime grants are added.
- Manifest: 0001 timestamp 1792118484382; SHA-256
  ae73813aaa600199bb8730d8080e4a5a4a9ed957d6b144d61b3befbb8ea00749.
  Foundation hash/timestamp remain unchanged. Later files require another review.
- Alternatives: direct SQL/push would skip these history safeguards; offline-only
  review would not prove PostgreSQL enforcement. Neither was selected.
- Verification: six migration-plan unit cases, syntax, lint and diff checks passed.
  First migration passed (13 tables); eight catalog and eleven pricing DB cases
  passed (all exit 0). Repeated migration reported already applied/no changes.
  Read-only dev metadata confirmed exactly seven foundation tables (exit 0).
- DB acceptance: bigint values above 100000 and exact JS-safe boundary mapped
  through Drizzle; safe totals calculated and overflowing selections refused.
  PostgreSQL checked price bounds, uniqueness, locale/title, local group rules,
  composite FK scope and RESTRICT update/delete. Service readiness separately
  rejected a draft with insufficient options, which storage deliberately permits.
  App read/delete attempts and any-table-privilege checks denied access to all
  six new draft tables. All synthetic records rolled back; thirteen tables empty,
  owned by test owner with twelve RESTRICT FKs. No persistent seed/cleanup DDL.
- Security/SEO: private env execution in approved user context preserves ACLs;
  no credentials printed, app privileges expanded, merchant API, UI/SEO or package
  change. Existing dependency findings and release gates remain unresolved.
- Deferred: build, public E2E, audit, Lighthouse and unrelated old unit/config
  suites not repeated per focused-check preference. No release approval implied.
- Boundaries: no dev runner update/dev migration, auth/CMS, immutable approval,
  publication, production operation, commit, push or deployment.
- Rollback: 0001 is now applied to test; the offline file-only rollback is invalid
  there. Preserve SQL/journal/history, inspect data and dependencies, and seek
  approval for a scoped reverse migration/restore. No drop/reset/truncate/CASCADE
  cleanup or destructive rollback was executed. Dev stays at 0000.

## ADR-014 - Development pricing migration and read-only verification

- Date: 2026-10-16.
- Status: IMPLEMENTED locally; dev now has reviewed 0000/0001.
- Approver: user "oke lanjut" after the concrete dev-only file/command plan
  and explanation of transactional rollback versus post-commit recovery.
  Remain on feat/catalog-data-plan; preserve unrelated earlier uncommitted work.
- Decision: update only dev runner/verifier and add dev-specific manifest guards
  and unit tests. Pin the same reviewed SQL hashes/timestamps as test; retain
  strict local dev role checks and advisory lock 76210983. Require the existing
  foundation or complete pricing state, verifying history, relation names/kinds,
  metadata/table ownership. Before 0001 execution, refuse nonempty foundation
  tables inside the migration transaction. Verify final state before commit.
- Alternatives: leave dev at 0000, or generalize test/dev runners together. A
  dev-only update keeps the already-verified test path outside this change.
  No new package, dependency version, SQL or credential/grant change.
- Verification: six dev manifest guard cases, syntax, lint and diff review passed.
  First dev migration passed; second invocation made no changes. Read-only verifier
  passed: 13 empty owner-owned tables, two exact history entries, metadata owner,
  12 RESTRICT FKs and runtime privileges denied across all catalog tables.
  All commands exit 0; see README for exact executed commands.
- Limits: manifest/state checks are not a complete schema fingerprint. No new
  constraint fixture writes were run against dev; actual constraint cases passed
  in the preceding isolated test phase. Build/E2E/audit/Lighthouse and unrelated
  old suites were not repeated. Existing dependency findings/release gates remain.
- Security/SEO: app grants remain unchanged; no privileged credential reaches
  client code, output or Git. Private env execution used approved user context
  without changing ACL. No public route/data/SEO, auth/CMS or merchant operation.
- Boundaries: no test DB mutation, seed, production action, commit, push or deploy.
- Rollback: both local DBs now have 0001. Preserve SQL/snapshots/journal/history;
  inspect data/dependencies and request a scoped reverse migration/restore if
  needed. No file-only rollback, drop/reset/truncate/CASCADE cleanup was run.

## ADR-015 - Internal draft creation and version-guarded variant price edits

- Date: 2026-10-16.
- Status: IMPLEMENTED; unit and isolated test-DB acceptance passed.
- Approver: user "oke setuju" after concrete files/commands and explicit temporary
  committed synthetic fixture plus ID-scoped cleanup approval. Stay on
  feat/catalog-data-plan; preserve previous uncommitted work.
- Decision: add server-only createCatalogDraft and updateVariantPrice with an
  injected Drizzle context. No migration, connection factory, new dependency or
  app privilege expansion. Use installed Drizzle ORM 0.45.4/pg 8.23.1.
- Behavior: create empty draft defaults; validate input before DB access; compare
  status/id/version and increment root version before exact scoped variant edit
  in one transaction. Failed child edit rolls root increment back. Stale/missing
  root conflicts safely. Guard int4 version exhaustion and JS-safe IDR amounts.
  Generic driver errors hide connection details/parameters without causes.
- Alternatives: last-write-wins risks lost edits; building all CMS/approval/copy
  operations now exceeds this narrowly reviewed writer foundation.
- Verification: four unit cases, syntax, lint and final diff checks passed.
  First integration run: 8/9 passed, lock-observation assertion failed; fixture
  cleanup and empty-table check still passed. pg_stat_activity visibility under
  SET ROLE was suspected; lock-graph query pg_blocking_pids replaced that probe
  without privilege expansion or weakening concurrent-wait requirement.
  Targeted concurrency rerun passed; final complete integration run 9/9 passed,
  exit 0. Both workers observed blocked before release; exactly one save/version
  increment succeeded, other returned REVISION_CONFLICT. All fixtures removed.
- Security: internal persistence only, not RBAC. Runtime app creation/edit denied
  by unchanged privileges in DB tests. Approval/live immutability, identity/slug
  protection, auth/session/audit and other child writers remain future work.
  No route/public-data/SEO, merchant call, secret/grant or dependency change.
- Test boundaries: real concurrent sessions require committed synthetic fixture
  rows in isolated test. Cleanup uses only generated revision/identity IDs, in
  dependency order and a transaction; no drop/reset/truncate/CASCADE. Final run
  confirms all thirteen tables empty. Failed cleanup reports its own fixture IDs.
- Deferred: old suites, build, public E2E, audit and Lighthouse not repeated;
  existing dependency findings and full release gates remain open.
- Rollback: remove only drafts module/new unit+integration tests/script entry and
  this stage's documentation. No schema change. All temporary records already
  removed; if later cleanup fails, inspect logged fixture IDs and scope recovery
  to those synthetic rows. Do not reset DB or discard earlier work.
- No development mutation, commit, push, production operation or deployment.

## ADR-016 - Atomic draft catalog cloning with a shared source lock

- Date: 2026-10-16.
- Status: IMPLEMENTED; unit/writer/clone integration acceptance passed.
- Approver: user "setuju" after concrete files/commands, ten-child-table cloning
  and temporary test source/clone fixture plus ID-scoped cleanup plan. Remain on
  feat/catalog-data-plan; prior uncommitted work preserved.
- Decision: add cloneCatalogDraft to existing server-only writer. Validate source
  UUID/version, select exact draft/version FOR SHARE, create a new draft root and
  copy explicitly whitelisted columns of ten child tables in FK order in the same
  transaction. Reuse shared stable identity/slug and revision-scoped child IDs;
  root starts at version 1, source unchanged. No schema/lineage/approval fields.
- Alternatives: partial copying risks incomplete graph loss; automatically copying
  all future columns risks inheriting workflow fields; duplicating stable identities
  breaks shared slugs. Explicit full current-child whitelist selected.
- Dependencies: unchanged Drizzle ORM 0.45.4, pg 8.23.1 and server-only 0.0.1.
  Local installed declarations verified support for SELECT locking. No install.
- Verification: five writer unit cases, syntax, lint and diff review passed.
  Existing writer DB suite 9/9 and new clone DB suite 11/11 passed on first run,
  all exit 0. Full ten-table content equality, isolated bidirectional price edits,
  empty/incomplete drafts, exhausted source version, stale/missing source, real
  SQL error on sixth child-copy statement and nested-savepoint recovery verified.
  Both editor-first and clone-first orders verified actual lock waiting through
  pg_blocking_pids on separate sessions. Runtime app clone denied. All thirteen
  test tables empty after exact fixture source/clone ID cleanup.
- Security/SEO: no new grant/credential, public route/content/SEO, merchant operation
  or auth workflow. Only internal persistence with explicitly supplied DB context;
  future callers still need server authorization/audit. Raw SQL/shared identity edits
  remain outside the lock contract. Copying does not establish publish readiness.
- Deferred: unrelated suites, build/E2E/audit/Lighthouse not repeated. Existing
  dependency/security findings and full release gates remain open.
- Rollback: remove only clone function/whitelist, new unit additions/clone test,
  test:clone-db entry and this stage documentation. Keep previous draft writer,
  schema/migrations/data. Fixture cleanup passed; any later cleanup failure must
  be inspected against reported test-owned IDs, never reset all data.
- No dev mutation, schema/migration, new dependency, commit/push or deployment.

## ADR-017 - Version-guarded category/product translation upserts

- Date: 2026-10-16.
- Status: IMPLEMENTED; unit/regression/integration acceptance passed.
- Approver: user "setuju" after concrete translation files/commands plan,
  shared root-version helper and test-only temporary fixture/cleanup boundaries.
  Remain on feat/catalog-data-plan; preserve prior uncommitted work.
- Decision: add saveCategoryTranslation/saveProductTranslation to existing internal
  server-only writer and share advanceDraftVersion with updateVariantPrice. Use
  exact id/en locale, existing revision-owned parent, explicit title/description
  upsert and transactional version+text commit. No schema/migration or new package;
  installed Drizzle ORM 0.45.4/pg 8.23.1 unchanged.
- Input: nonblank string title (Unicode trim validation), string description
  including empty, no NUL, writable int4 version and UUID scope. Preserve supplied
  text exactly; no length cap, rich-text parsing or implicit description default.
- Alternatives: update-only cannot fill missing translations; last-write-wins
  conflicts with catalog-wide version safety. Explicit locale upsert selected.
- Verification: six unit cases, MJS syntax, lint/diff passed. Writer regression
  9/9, clone regression 11/11 and translation integration 11/11 passed, exit 0.
  Tests check insert/update, locale/revision/clone isolation, stable slugs/status,
  wrong-scope/version rollback, SQL failure after real writes, version exhaustion,
  literal text preservation, simultaneous text-vs-price with exactly one winner,
  unchanged app permission denial and final thirteen empty tables.
- Security/SEO: no route/public-data/SEO or runtime privilege change. Plain-text
  strings are not sanitized rich HTML; future consumers must render escaped text.
  Auth/Owner/Staff/audit, approval/publish and other child writers remain pending.
  Input version does not authorize writes; explicit authorized DB context required.
- Test boundary: committed synthetic fixture IDs only in local test; cleanup by
  exact revision/identity IDs in dependency order, no reset/drop/truncate/CASCADE.
  All fixture cleanup passed. Private env execution preserved ACLs/no secret output.
- Deferred: unrelated suites, build/E2E/audit/Lighthouse not repeated. Existing
  dependency findings and full release gates remain open. No dev DB mutation.
- Rollback: restore the prior price writer implementation, remove new translation
  functions/helper additions/unit cases/integration test/test:translations-db entry
  and this stage documentation. Keep clone/writer baseline and all schema/data.
  Test fixtures already removed; inspect only reported owned IDs on later failure.
- No migration/install/credential change, merchant call, commit/push or deploy.

## ADR-018 - Draft variant creation/editing and localized labels

- Date: 2026-10-16.
- Status: IMPLEMENTED; unit/regression/integration acceptance passed.
- Approver: user "setuju" after concrete file/command plan, first/sole standard
  policy and temporary test fixture/ID-scoped cleanup. Stay feat/catalog-data-plan.
- Decision: add createProductVariant/updateProductVariant/saveVariantTranslation
  to server-only drafts writer, reuse root CAS/version lock and share text input
  validation with prior translation writers. Explicit scoped writes, generated new
  UUIDs, unique codes per product revision, safe IDR and int4 sort validation.
- Business rule: first or sole variant must have code standard. Additional named
  variants allowed; with multiple variants a code can be renamed if unique.
  No deletion/promotion of variants in this scope. No business amount ceiling.
- Alternatives: labels-only would not let editors create variant choices; last-
  write-wins bypasses root concurrency. Use existing schema/version without a
  migration. Installed Drizzle ORM 0.45.4/pg 8.23.1 unchanged, no new dependency.
- Verification: eight unit cases, syntax/lint/final diff passed. Existing writer
  9/9, clone 11/11, translations 11/11 and variants 13/13 passed (all exit 0).
  Coverage: generated IDs, first/sole standard, multiple variants/code edits,
  duplicate rollback, zero and safe-integer prices, int4 sort, full scope, literal
  ID/EN labels, SQL failure rollback, stale/exhausted versions, cloning/isolation,
  actual creation-vs-text and edit-vs-price races with one winner, runtime denial
  and final thirteen empty tables. No failed/skipped cases.
- Security/SEO: app grants/credentials/public routes/SEO unchanged. Internal
  persistence requires authorized DB context before exposure; no RBAC/audit,
  approval/live freeze, rich-text sanitization or merchant integration here.
- Test boundaries: temporary committed fixture IDs only in test, dependency-order
  cleanup by exact revision and identity IDs; all cleanup checks passed. No global
  reset/drop/truncate/CASCADE, dev mutation or persistent seed. Env ACL preserved.
- Deferred: unrelated old suites, build/E2E/audit/Lighthouse not repeated. Existing
  dependency findings and release gates remain open.
- Rollback: remove only new variant functions/unit additions/integration test and
  test:variants-db entry; restore prior inline translation validation if removing
  its new shared helper. Undo stage documentation, preserve previous writers,
  clone, schema/migrations/data. Fixture cleanup already complete.
- No schema/migration/install/commit/push/production operation or deployment.

## ADR-019 - Draft modifier group/option and ID/EN label writers

- Date: 2026-10-16.
- Status: IMPLEMENTED; focused unit/regression/integration acceptance passed.
- Approver: user "oke setuju" after concrete six-writer/files/commands plan and
  temporary test fixture plus ID-scoped cleanup approval. Stay feat/catalog-data-plan.
- Decision: add create/update groups, create/update options and two label upserts
  to existing server-only drafts module, using the shared root CAS/version and
  text rules. Explicit fields, generated new IDs, exact composite parent scope,
  code uniqueness, int4 selection/sort and safe nonnegative IDR delta validation.
  No schema/migration, dependency or permission change; installed versions unchanged.
- Policy: single max <= 1, min <= max, product-wide groups, once-per-option
  selection, nonnegative deltas, no business price ceiling. Drafts may be underfilled
  while options are added; pricing readiness, not local writer, checks option count.
  Edit cannot move group/option ownership. Deletion is out of scope.
- Alternatives: group-only writing cannot verify complete modifier pricing; enforcing
  option-count readiness on every draft save prevents incremental group setup.
  Keep partial drafts and use the existing readiness validator.
- Verification: 11 writer unit cases and 20 pricing unit cases passed; syntax,
  lint and diff review passed. DB writer regression 9/9, clone regression 11/11,
  new modifiers 15/15 passed (all exit 0). Cases include create/edit, generated IDs,
  uppercase UUID, code conflicts, scope/non-movement, local limits, zero/safe delta,
  literal bilingual labels, DB-loaded exact price/required/duplicate/overflow
  validation, underfilled-to-ready transition, SQL failure rollback for all six
  operations, stale/exhausted versions, clone isolation and mixed-writer races.
  Runtime app denied all six functions; thirteen tables empty after cleanup.
- Security/SEO: internal persistence, not auth/RBAC/audit or approval/live freeze.
  No route/SEO/public-data, merchant API, runtime grants or credential change.
  Private test env used in permitted user context with ACLs preserved/no secrets.
- Test boundaries: temporary committed source/clone fixture IDs only in local test;
  cleanup exact revision/identity IDs in dependency order, no global reset/drop/
  truncate/CASCADE or persistent seed. Development not mutated.
- Deferred: unchanged translation/variant DB suites, other unrelated suites,
  build/E2E/audit/Lighthouse not repeated. Existing findings/release gates remain.
- Rollback: remove only six new functions/private modifier helpers/schema imports,
  added unit cases/new integration test/test:modifiers-db entry and stage docs.
  Preserve previous writer/clone, schema/migrations/database. Fixtures are clean;
  inspect only reported owned IDs on later cleanup failure. No DB rollback required.
- No install/migration/commit/push/production operation or deployment.

## ADR-020 - Bundled completion of draft foundation and structural review report

- Date: 2026-10-16.
- Status: IMPLEMENTED; bundled acceptance passed. Phase 2 overall remains incomplete.
- Approver: user "setuju" after one combined file/command plan for category/product
  identity creation, placement/sort, review readiness and temporary test cleanup.
  User requested larger coherent packages; no per-writer confirmation required.
  Stay on feat/catalog-data-plan and preserve earlier uncommitted work.
- Decision: four new internal draft identity/placement writers, a pure graph
  readiness validator and a server-only version-bound reader. Existing root CAS
  serializes writes; global unique namespace-specific slug guards protect concurrent
  creations across revisions. No implicit existing-identity attachment or slug edit.
  No schema/migration/new dependency; installed Drizzle ORM 0.45.4/pg 8.23.1 unchanged.
- Readiness: category/product structure, all five entity kinds localized in ID/EN,
  variants/modifiers/counts/ranges/scopes plus safe worst permitted final amount.
  Highest base plus top max deltas per independent group computes the bound without
  enumerating combinations. No business price ceiling. Drafts may be incomplete;
  ready is structural review assistance, not content truth/approval/publish parity.
- Reader: exact draft/version FOR SHARE, sequential child/identity reads within
  one transaction, no DML/token changes. A normal transaction is required for row
  locks. Future transitions must revalidate exact version and enforce authorization.
- Alternatives: continued per-function tasks rejected by user preference; automatic
  slug reuse or shared-slug editing would change identity semantics; direct public
  data switch would bypass pending auth/immutable approval/publication protections.
- Verification: 43 combined unit cases (12 drafts, 20 pricing, 11 readiness), syntax,
  lint and final diff review passed. DB suites: drafts 9, clone 11, translations 11,
  variants 13, modifiers 15, foundation 12; all 71 passed (exit 0). No failed/skip.
  Full catalog built solely through application writers to structural ready state.
  Actual slug races across revisions, placement races, consistency/read lock and
  stale reports, SQL rollback, clone isolation, overflow/boundary and app denial
  tested. All thirteen tables empty after exact owned-fixture cleanup.
- Security/SEO: internal persistence only; no runtime grants/credentials, route,
  public content/SEO, merchant API, auth/audit or live-state changes. Private env
  execution used permitted user context with ACLs preserved/no secret output.
- Deferred: schema/config/audit/build/public E2E/Lighthouse not rerun for unchanged
  packages/UI. Existing findings and full release gates remain open. Stable slug
  freezing, raw SQL protections, deletion/UI and approval remain outside this scope.
- Rollback: remove only added identity/placement functions/imports, review modules,
  new unit/integration cases, test:foundation-db script and stage documentation.
  Preserve all previous writers, schema/migrations and database state. Test rows
  already removed; any future cleanup recovery targets reported fixture IDs only.
- No development mutation, install, migration, commit, push or deployment.


## ADR-021 - Bundled revision protection and publication read path

- Date: 2026-10-16. Scope: backend Phase 2 group 2 on feat/catalog-data-plan.
- Approval: user's explicit agreement and "oke lanjutkan" after the combined
  schema/trigger/workflow/reader/test/local migration plan and rollback explanation.
  Auth is a trusted server resolver contract with default denial until Phase 3.
  Test-only cleanup of tracked committed fixtures with transactional USER trigger
  disable/reenable and exclusive locks was included in the approval.
- Decision: freeze complete submitted revisions and shared identities, bind Owner
  approval to exact ID/version/content hash, publish by atomic singleton pointer,
  preserve live content through draft edits, require replacement before live archive.
  Persist submission, approval and append-only action audit records. Read only the
  pointer-selected published graph; leave public routes on existing noindex fixtures.
- No new dependencies. Existing Drizzle ORM 0.45.4, Kit 0.31.11, pg 8.23.1 and Node
  built-in crypto/test runner are used. No auth library, runtime grant or install.
- Migration 0002 adds four tables, hash/states and custom protection functions/
  triggers; 0003 corrects the deferred receipt function's table-specific field
  access. Applied SQL/history are preserved rather than rewriting 0002.
- Verification discovered that nested Drizzle migrator session transactions can
  commit before an outer runner's final check. Runners now use a single explicit
  pg transaction for pending pinned SQL, history insertion and final verification,
  with rollback on SQL or verification failure. The first test migration returned
  an error after SQL/history had committed; subsequent read-only inspection
  confirmed the state, and forward correction was applied. No restore/delete used.
- Alternatives: mutable approved rows and newest-draft public reads violate exact
  revision approval; granting app permissions or implementing login now expands
  into Phase 3; rewriting applied migration files would break reviewed history.
- Security: default-deny resolver, explicit Owner actions, frozen child/identity
  SQL guards, append-only receipts/audit, exact hash checks, serialized publication.
  Privileged owners remain administrators; no SECURITY DEFINER/bypass setting.
- Rollback after commit requires inspected and separately approved reverse
  migration or restore. Preserve 0000-0003 SQL, snapshots/journal and history.
  Disabling application workflow exposure does not require reversing schema.
  No production/merchant operation, commit, push or deployment.


Final verification (2026-10-16):
- npm.cmd run test:e2e -- --workers=1: 222/222 passed in 3.9 minutes.
  Initial two-worker run: 104 passed, 2 browser-page setup timeouts, 116 not run
  after suite timeout. No tests/config were removed or weakened; single-worker
  rerun completed all desktop/mobile/small-mobile cases.
- npm.cmd run db:migrate:dev: applied pending 0002/0003 together; second run
  reported already applied with no changes.
- node --env-file=.env.local --env-file=.env.dev-migrator.local
  scripts/verify-dev-db.mjs: passed, 17 empty owner tables, four exact history
  rows, 16 RESTRICT FKs, eight exact function bodies and 36 enabled triggers;
  app has no new privileges.
- npm.cmd run db:migrate:test repeated: no changes, final protections verified.
- npm.cmd run test:db-connection: 4/4 passed, both isolated app roles and both
  cross-database CONNECT denials.
- Final unit rerun: 74/74; lint, syntax checks and git diff --check passed.
  .gitattributes fixes drizzle SQL to LF because core.autocrlf=true otherwise
  risks changing reviewed migration hashes on a later Windows checkout.

Both local databases now retain 0000-0003 history and contain no catalog fixtures.
No production or merchant call occurred. Actual auth/session integration, verified
business content, public DB integration, Lighthouse/staging/release and nine
development dependency audit entries remain outside this completed backend scope.

## ADR-022 - Bundled fixed bilingual page content backend

- Date: 2026-10-16. Status: IMPLEMENTED for Phase 2 group 3 backend.
- Approval: user "oke kerjakan" after the full file/behavior/command plan, including
  test-first then local development migration. Remain on feat/catalog-data-plan.
- Decision: seven page tables, code-owned fixed templates for existing nine page
  identities, both locales per exact immutable reviewed revision, explicit field
  and bounded rich JSON allowlists, versioned draft saves and unapproved clones.
  Owner approves/publishes/rejects/archives; Staff drafts/submits. Every factory write
  is default-deny until a trusted server identity resolver is wired in Phase 3.
- Published content follows per-page approved pointer and exact canonical SHA256;
  no newest-draft or language fallback. Atomic pointer/audit transitions, frozen
  root/translation guards, cross-page FKs and deferred receipt completion checks.
- Alternative: arbitrary HTML/layout content would require broader sanitization
  and undermine fixed templates. Structured JSON uses bounded allowlists and no new
  dependencies. Existing Drizzle ORM 0.45.4, Kit 0.31.11, pg 8.23.1 retained.
- Migration: generated 0004_page_content plus reviewed custom invoker-only trigger
  layer. Hash/timestamp pinned; test applied and verified first, development only
  after checks passed. Both now have 24 empty tables, five history entries, 24
  RESTRICT FKs, 16 guard functions and 52 enabled custom triggers. Repeats no-op.
- Verification: 89 unit; pages DB 18, catalog regression 90, catalog publication 14,
  connectivity 4; all 126 integrations passed. Lint/build and 222 local-only public
  E2E passed with one worker. Real SQL rollback for all draft/workflow operations,
  actual independent-session races and exact test fixture cleanup verified.
- Security/SEO: no auth/session implementation, endpoint/UI, runtime grant, secrets/
  ACL changes, public route/data-source/SEO change, merchant call or production action.
  Safe rich rendering belongs to group 5; UI editor/session/scheduler to Phase 3.
- Audit dependencies was not repeated: no versions/lockfile changed in this package;
  previous dev findings and staging/Lighthouse/release gates remain open.
- Rollback: inspect actual state and approve reverse migration/restore separately.
  Preserve applied 0000-0004 SQL, snapshots/journal and history; never delete history
  or rewrite an applied migration. No commit, push or deployment authorized/performed.

## ADR-023 - Bundled media reference and limits backend

- Date: 2026-10-16. Status: IMPLEMENTED for Phase 2 group 4 backend scope.
- Approval: user "setuju" after the complete file/command/boundary plan and explicit
  image/video/count/poster limits; local test-first then development migrations.
  Work remains on feat/catalog-data-plan with earlier uncommitted work preserved.
- Decision: four media tables, immutable inspected metadata, versioned localized
  catalog/page references, poster image FKs, root SQL guards and registration audit.
  No free-form HTML/iframe/URL. YouTube ID contract without network fetching.
- Limits: decimal image 10 MB/4096 per side; video 100 MB/120 sec/1920 long +1080
  short side; required image poster; twelve references per product/page.
- Registration: injected trusted server inspector and identity capability. Without
  a physical inspector registration denies; no browser claims are trusted. Real
  storage/decoding/ownership/immutable-key adapter, upload UI/auth remain Phase 3.
  External embed validation is syntactic, not proof of video existence/permission.
- Integration: media joins clone/readiness/approval/publication and public metadata
  readers. Empty-media legacy SHA256 preserved; media uses format 2. No approval
  or applied history rewrite. Referenced bytes must remain write-once in future storage.
- Alternatives: mutable shared media could silently alter approved content;
  unrestricted paths/iframe HTML and browser-only validation do not meet safety.
  No new dependency, codec, image editor or storage provider selected/installed.
- Migration 0005 generated offline, custom guards reviewed/hash pinned, applied
  to test first, development after acceptance. Both DBs: 28 empty tables, six
  exact history entries, 30 RESTRICT FKs, 19 guard functions, 60 enabled triggers.
  Runner repeats no-op. SQL/verification failures share existing pg transaction.
- Verification: 102 unit (media 13), 142 DB integrations (media16/pages18/catalog90/
  publication14/connectivity4), lint/build and 222 local E2E (--workers=1) passed.
  Golden old hashes, limits/posters, role denial, rollback, clone/publication and
  actual SQL count race at eleven references are covered. All fixtures removed
  by exact owned IDs with transactional test-only maintenance.
- Security/SEO: default-deny auth/inspection, immutable metadata and frozen refs,
  safe DTO without storage/checksum/actor. Public preview/noindex unchanged. No
  grants, secrets/ACL, merchant/YouTube API, production operation, commit/push/deploy.
- Existing dependency findings/release gates remain; audit not rerun for unchanged
  dependencies. Physical file checks, optimization/player/UI, Lighthouse and staging
  are not claimed by backend acceptance. Test inspectors use synthetic metadata.
- Rollback requires inspected and separately approved reverse migration/restore;
  preserve applied 0000-0005 SQL, snapshots/journal and history.

## ADR-024 - Phase 2 public integration and local QA (approved)

Default public routes read only published database content. Explicit server-only
PUBLIC_CONTENT_SOURCE=fixture retains the existing local design preview. Empty
databases show localized empty states; unknown/unpublished details return 404.
No silent fixture fallback. PUBLIC_DATABASE_TARGET selects only dev/test loopback
application credentials; migrator credentials are rejected by the public factory.

Migration 0006 adds two reviewed STABLE SECURITY DEFINER JSON readers with fixed
pg_catalog search_path, schema-qualified relations and explicit localized fields.
Only matching app login receives EXECUTE; PUBLIC is revoked and direct table
access remains denied. Readers join publication, published revision and exact
approval hash. Existing SQL/history remain intact. Runtime reads are request-fresh
with React per-request deduplication, with no cross-request content cache.

Fixed templates render bounded JSON as escaped React nodes and allowed internal
links. Catalog prices include mandatory modifier costs; interactive choices use
the existing pure pricing validator with no business price cap. File media show
reserved placeholders until the Phase 3 storage adapter exists. YouTube connects
only after an explicit load click. Merchant links remain unavailable pending
verification. Localized published metadata stays noindex; no business schema.

No new project dependency. Lighthouse 12.8.2 (Apache-2.0, Node >=18.16) is approved
for temporary npm exec use, with ignored local reports and no lockfile changes.
QA uses tracked synthetic fixtures only in test; child Next/browser processes
receive application credentials, never migrator credentials. Cleanup is test-only,
transactional and limited to tracked IDs, with guards checked before commit.

Standing Git workflow, explicitly approved by user: starting Phase 3, each small
subphase uses a new branch and, after completion and validation, commit and push.
Merge/deploy are separate actions. This does not authorize a Phase 2 commit/push.

Rollback: revert public application changes or explicitly select local fixture
preview while inspecting the issue. After successful migration, removing the SQL
capabilities needs an inspected, approved reverse migration/restore. Preserve
applied SQL/history; no production or merchant operation is included.

ADR-024 acceptance: 104 unit, 143 integration, 300 E2E, lint/build, runtime audit0,
browser bundle check and migration/verifier/no-op checks passed. Lighthouse final
mobile: home99/menu98/product90; accessibility100, best practices100, SEO60
(noindex). Both local DBs empty, history0000-0006 intact. Full dev audit remains
9 affected-package entries, release gates open. Full evidence: SECURITY_AND_QA.md.

## ADR-025 - Phase 3.1 authentication (approved 2026-10-16)

User approved Better Auth1.7.10 and Drizzle adapter1.7.10 (MIT), new auth schema/
limited grants, login/admin/security/reset UI,24h absolute+1h idle sessions,
internal provisioning, rate limits, CSRF, append-only audit and optional Owner MFA.
Branch feat/phase3-1-auth is based on merged main d323c80. User's standing
per-subphase branch/commit/push instruction authorizes Git completion after QA.
No merge, deployment, production or merchant/email operation is authorized.

Auth.js Credentials was considered: it requires more custom password/reset
persistence logic. Better Auth provides the credential/reset/MFA primitives;
its rolling session default does not by itself satisfy the approved absolute
and idle limits. We disable refresh/cache and enforce those limits in the server
gate with database clock/atomic activity updates, plus a24h SQL expiry constraint
and immutable session identity trigger.

Nine cms_auth tables are separate from the28 public tables. Runtime roles have
only needed auth grants, roles read-only and audit INSERT(user_id,event) only.
User/account creation is a trusted local CLI; hashing is library-owned. No public
signup, social login, account linking or client role update route is allowed.

Token links use fragments and browser POST bodies; Better Auth verify-email GET
is translated internally, without a token-bearing HTTP URL. Secure cookie is
enforced for HTTPS; local HTTP is loopback-only. Config rejects remote origins.
A private generated auth secret file is ignored and owner-ACL restricted.

Real email provider remains unselected. Runtime sender is absent and fails
closed; only tests use memory mail capture. No real account or verified-email
claim is fabricated. Editor/workflow integration remains the next approved task.

ADR-025 acceptance:107 unit,154 integration and318 E2E passed, with lint/build,
bundle secret check, dev/test migration no-op repeats, dev verifier and four
connectivity cases. Auth runtime smoke passed; real account awaits operator input.
Audit remains9 total,4 under omit=dev via optional peer; release gates remain
open. Real email delivery and content editor are not claimed. See QA details.

## ADR-026 - CMS password minimum six (approved2026-10-16)

User explicitly requested and approved minimum6 characters for internal CMS
Owner/Staff passwords. Maximum128 remains. This supersedes the original
provisioning20 and library/reset12 minimums; the user accepts the greater
guessability of shorter passwords. Scope is CMS credentials, not database
credentials or auth secret. No dependency, migration or role policy change.
Branch fix/cms-password-minimum is based on merged main8bd3831. Commit/push
authorized after validation. Account creation is also explicitly authorized;
identity remains runtime data, never committed, and password enters only a
hidden terminal prompt. Optional email/display-name script parameters allow
prefilling non-secret account details while keeping the password off arguments.
Rollback application policy via commit revert; do not silently reset an already
created account or delete data. Existing hashes work without rehash/migration.

## ADR-027 - Phase 3.2 fixed-template CMS pages (approved 2026-10-17)

User approved page editor, bilingual structured rich text, preview and exact
revision review/approval/publication/archive on feat/phase3-2-cms-pages. Base main
b1753db includes ADR-026. Existing Next/React/Better Auth/Drizzle versions remain
locked; no editor dependency is installed. A native structured editor preserves
the approved bounded document contract. A raw HTML editor would require a separate
parser/sanitizer and additional validation; it is not selected.

Dedicated local dev/test CMS database logins isolate page writes from public/auth
credentials and migrator privileges. User ran the administrator provisioning
script, which generated private random passwords; migration0008 grants only page
workflow access and read-only membership/media metadata. Public readers retain
published-only function access and no table grants. Server session/RBAC/Origin
validation and exact version/hash checks govern HTTP requests. Create/save/clone
audit rows commit atomically with the page mutation. No account, merchant, cloud,
production or email operation is included. Scheduling/catalog/media UI follow
in separately approved subphases. Existing release advisory blockers remain.

Rollback preserves applied SQL/history and private credentials. See
PHASE3_PLAN.md and SECURITY_AND_QA.md for boundaries and actual verification.

## ADR-028 — CMS shadcn UI redesign (approved 2026-10-17)

User approved the scoped redesign of login, dashboard, page/revision lists and
editor, including a responsive header/navbar/sidebar, and six pinned dependencies
listed in DEPENDENCIES.md. Branch feat/cms-shadcn-ui starts from merged main ccdd20c.
This is an explicit choice of shadcn/Radix for admin UI over the baseline Headless
UI direction. No database migration, API contract or authentication policy change.

Fifteen official MIT shadcn components are vendored as JavaScript/JSX with retained
license and source URLs. No scaffold/CLI overwrite, TypeScript conversion, paid
package, analytics chart or fabricated dashboard statistic is introduced. Dashboard
counts come from existing authenticated page reads; unavailable data shows an honest
unavailable state. Admin shell receives only server-verified name/role, never tokens.

The mobile navigation is a modal Sheet with inert background and restored trigger
focus. The account dropdown is intentionally nonmodal with a named portal landmark.
Revision confirmation uses AlertDialog and restores focus to its actual initiating
button, or the action section if that button is disabled/removed after a transition.
Existing server authorization, CSRF, sessions and frozen/live revision rules remain.

Admin CSS variables and legacy style resets are scoped to .admin-root. globals.css
imports admin.css into the same Tailwind compilation so semantic color utilities
exist; it does not apply admin values to public pages. No public design-token or
business-copy changes. CMS and public previews remain noindex.

Rollback: revert the UI application commit and restore its previous package.json/
lockfile together, then install that lockfile and rebuild. Preserve private envs,
accounts, content and applied migration history. No schema rollback is needed.
Commit/push after verification follows the standing approved subphase workflow;
merge/deployment still require separate authorization.

## ADR-029 — Revision list and detail form refinement (approved 2026-10-17)

User approved refining Kelola revisi and its detail form with the existing shadcn
components. Branch fix/cms-revision-ui starts from merged main 831ac0f. The user's
standing UI direction is shadcn for subsequent features/pages. This change reuses
the pinned ADR-028 packages, with no installation, schema or API contract change.

Revision lists use a desktop table and mobile cards, Indonesian status badges,
version, live pointer and creation time in Asia/Jakarta (WIB). Counts describe only
the displayed list of at most100 revisions. Shared RevisionStatus keeps labels
consistent between list/detail without changing stored workflow values.

The detail form groups fixed-template fields into main content, additional page
sections, SEO metadata and CTA text when applicable. Short/title fields use Input;
summary fields use Textarea. Each language has an explicit unsaved indicator;
saving one language cannot clear the other's pending changes. Rich content uses
one Card per block and flat text-part controls, retaining paragraph/heading/list,
marks, internal links and existing limits. Save/actions and frozen revision notes
remain tied to the existing version/approval workflow.

Server RBAC, CSRF, sessions, immutable approvals, live content and code-owned links
remain unchanged. Styling is scoped to admin; public SEO/noindex policies remain.
Acceptance covers three viewports, Axe/focus, bilingual pending changes, rich-text
editing/preview, revision navigation, permission denials and stale-save conflicts.

Rollback: revert this UI commit and rebuild. Preserve content, private credentials
and applied SQL history; no dependency or database rollback is required. Commit/
push follows standing approval; merge and deployment need separate authorization.

Approved follow-up: increase label/control spacing to12px, field spacing to24px,
and group action buttons in wrapping rows with12px gaps. List item removal sits
beside text-part addition; block actions remain in the Card footer. The change
stays on fix/cms-revision-ui, reuses shadcn and does not alter content operations.

## ADR-030 — Phase3.3 catalog CMS and preview cards (approved 2026-10-17)

User approved the complete catalog CMS scope and page/product preview refinement,
including a forward migration on local test then dev after QA. Branch
feat/phase3-3-cms-catalog starts from merged main2b8b4cb. Existing pinned packages
are reused; shadcn remains the approved UI direction.

Reuse existing category/product/variant/modifier writers and frozen approval/
published readers through real server-authenticated CMS APIs. Database membership
is rechecked per transaction. No request accepts an actor/role override. Draft
audits are atomic; draft serialization/deadlock failures map to safe revision
conflicts. Category/product slugs remain immutable; copying uses a fresh draft.

Migration0009 grants only required catalog SELECT/INSERT/UPDATE capabilities to
the existing isolated CMS logins and extends catalog audit actions. No DELETE,
TRUNCATE, asset registration, identity updates, auth writes or privileged grants.
Existing trigger functions, SQL/history and public reader isolation are preserved.
This grant/audit-only dev transition may contain real local draft content: retain
all rows and verify counts under locks instead of requiring an empty dev database.

Preview is an authenticated simulation of the current draft, including unsaved
existing-field changes. Product total uses code-owned pricing/selection rules;
invalid selections have no numeric total. Media uses an honest placeholder.
No merchant price-comparison claim, live merchant call, checkout, stock quantity,
upload, scheduler, public schema or production operation is included.

See PHASE3_PLAN.md for scope/rollback and SECURITY_AND_QA.md for executed results.
Standing verified subphase commit/push workflow applies; merge/deploy stay separate.

## ADR-031 — Home editorial draft, illustration and lantern identity (2026-10-17)

User approved bilingual home content based on existing facts, a clearly labeled
original illustration while authentic photos are unavailable, and a matching new
logo/favicon. Branch feat/home-content-brand starts from merged main7e494a8.
This is a content/brand follow-up, not Phase3.4 media upload/storage implementation.

Read-only local inspection found empty home drafts, no catalog products and no
media; repo contained only the TO placeholder icon. Editorial copy therefore uses
only Tiny Osaka, Japanese street food, delivery-only and Bandung/Indonesia from
approved requirements. No ingredients, availability, price, address, hours, award,
promotion or merchant link is invented. Asset provenance: BRAND_ASSETS.md.

The built-in imagegen tool produced an original Osaka-inspired editorial PNG.
It carries localized illustration captions/alt text, never claims product or
premises photography, and uses next/image responsive optimization/dimensions.
An original code-drawn lantern SVG replaces TO in header/footer/CMS/favicon.
User approval explicitly authorizes this new proposed identity in place of the
placeholder; no authentic supplied brand asset was silently replaced.

Home composition reuses shadcn Card/Button/Badge, scoped theme tokens, server
published data and safe rich text. No homepage draft or sample data substitutes
for missing published content. Existing published catalog content is reused.

The CMS Home editor offers an explicit load-draft button that fills blank fields
in both languages while preserving existing text. It marks both dirty and uses
normal authenticated save/version/review/Owner publication. The agent does not
impersonate an Owner, seed local business data, approve or publish a revision.
Preview shows the new design plus SEO before publication, including empty states.

No dependency, migration, session/RBAC, merchant or production change. Rollback
application/assets together while retaining CMS content and existing SQL history;
already saved editorial content remains a normal revision requiring normal review.
Standing branch/commit/push workflow applies; merge/deployment remain separate.
# ADR-032 — private local media and original logo (2026-10-17)

User approved Phase 3.4 media CMS plus original logo/favicon after reviewing
scope, local storage, dependency and video-prerequisite limitations. Reuse existing
media schema/revision approval; use local private immutable original files,
server-authenticated preview and live-reference-only public byte delivery. No
cloud service, external binary installation, destructive asset action, publication
or deployment is included. Sharp 0.35.5 becomes a pinned direct dependency for
full image inspection and approved logo derivatives. Original source assets stay
untouched. See PHASE3_PLAN.md and BRAND_ASSETS.md for implementation boundaries.

## ADR-033 — durable Owner-authorized scheduled publishing (2026-10-17)

User approved Phase 3.5 scheduling for exact approved page/catalog revisions,
shadcn UI, WIB input/display, UTC storage, isolated local migration/QA and a local
foreground worker. Reuse the persisted real Owner authorization, then recheck
enabled Owner membership and exact approval at execution. No fabricated Owner,
public run endpoint or browser-session dependency. Jobs overlay frozen approved
revisions; manual publication cancels obsolete schedules. Persist live baseline,
bounded retries and atomic audit under consistent publication locks. Details and
rollback are in PHASE3_PLAN.md and OPERATIONS.md. No automatic worker startup,
Railway mutation, deployment, real email or FFmpeg installation is authorized.
Standing verified commit/push workflow applies; merge/deploy remain separate.

## ADR-034 - Indonesian-only website and simple atomic CMS forms (2026-10-17)

Explicitly approved by the user after replacing the bilingual/translation proposal.
This decision supersedes bilingual requirements, mandatory ID/EN authoring and
per-section save controls in earlier decisions and skills. Public and CMS UI use
Indonesian only; existing /id URLs remain, former /en URLs redirect permanently.
No translation service, dependency or cloud action is introduced.

Page authors supply a title and body; summary, media, SEO overrides and existing
template extras are optional. SEO defaults from authored content. Catalog starts
with name/category/price, creates a standard variant automatically for new products,
and keeps additional variants/modifiers available under optional controls. One
Save all changes action persists all pending fields, new identities and media
references atomically. Add controls stage local items rather than save to the DB.
Drafts may be incomplete; review readiness, exact approval and Owner-only publish/
scheduling remain enforced server-side. Feedback and required-field errors stay
beside the bottom action controls. Uploaded library bytes remain a separate explicit
upload; attaching/removing them from a draft uses the common save action.

Legacy English rows, immutable hashes/receipts, published pointers and old field
values are retained. No content, asset, credential or applied migration is deleted.
Readiness requires only Indonesian, and page readiness requires title/body plus
valid media labels. English HTTP authoring and public reads are rejected. Legacy
rich-text English links render as equivalent Indonesian links. Database guards
already enforce scope/frozen revision integrity rather than two-language readiness;
no schema change or migration is needed. Existing hash algorithms stay unchanged.

Branch feat/indonesian-simple-cms starts from merged main24eb63e. Existing shadcn
components and package versions are reused. Verified commit/push/PR follows the
standing workflow; merge/deploy and starting a worker remain separate operations.
Rollback application/docs together to the previous commit: English legacy data
remains intact, but any newly approved Indonesian-only revision cannot pass old
bilingual readiness. Keep the public app/worker on the same version. Pause the
worker and prepare an approved compatible forward fix or exact approved replacement
before rolling back active publication; never edit a frozen revision or delete history.


## ADR-035 - One Owner approval immediately publishes content (2026-10-17)

Approved by the user after the scoped plan, with the explicit requirement that
content replaces the previous version immediately unless a publication schedule
is selected. Supersedes separate Owner submit/review/approve/publish clicks in
ADR-034 and earlier CMS decisions. Staff still saves drafts and submits them for
Owner review; only Owner can approve or schedule, enforced server-side.

All page and catalog forms, including their revision-owned media, variants and
modifiers, share the behavior. Owner approves a saved draft directly; approving a
Staff submission also publishes immediately. Existing immutable revision hashes,
submission/approval receipts, audit events and database guards remain intact.
Internal transitions run in one CMS transaction. Validation, stale version/hash,
publication or scheduling failure rolls the entire action back; live content
persists. Previous published revisions remain historical rather than being deleted.

Owner may choose an optional future WIB time before approval; this approves and
creates the durable publication job atomically, retaining the previous live copy
until the worker succeeds. Existing pending schedules are respected. A conflicting
schedule for another revision must be cancelled explicitly before replacement.
Legacy approved revisions can still be scheduled or approved for immediate
publication. Scheduler execution still rechecks Owner membership and exact content.

Public routes already use request-time database reads; immediate CMS publication
also invalidates the /id layout tree. New server requests receive the committed
revision without a cache TTL or publication worker. Already open browser documents
need a navigation/reload to request new content. Scheduled jobs use the existing
worker; its availability, polling interval and bounded retries still govern them.

No dependency, schema migration, merchant sync or deployment is introduced. Changes
remain on feat/indonesian-simple-cms, preserving unrelated local edits. Rollback:
reverse only this approval/UI/cache/test patch and retain all publication data and
audits; the old UI can read published revisions. Do not restore entire dirty files
from HEAD or delete revisions. Validation results are recorded after verification.


ADR-035 implementation files:
- `src/server/cms/approval.mjs` (new), `pages.mjs`, `catalog.mjs`: atomic
  Owner approval, exact version/hash guards, shared publication locks and scheduling.
- `src/features/cms/pages/{RevisionActions.jsx,PageEditor.jsx,client.js}` and
  `src/features/cms/catalog/{CatalogActions.jsx,CatalogEditor.jsx,client.js}`:
  role-specific actions, validation and immediate/scheduled success messages.
- `src/features/cms/publishing/Publications.jsx`: optional WIB schedule chosen
  before approval, preserving the existing approved-revision scheduling controls.
- `src/app/api/cms/{pages,catalog}/[revisionId]/actions/route.js`: invalidate
  public layout after committed immediate publication.
- `tests/integration/simple-cms.test.mjs`, `tests/integration/publishing.test.mjs`,
  `tests/cms-pages-e2e/pages.spec.mjs`, `tests/cms-catalog-e2e/catalog.spec.mjs`,
  `tests/publishing-e2e/publishing.spec.mjs`: regression coverage and updated fixtures.
- This decision record. All pre-existing and concurrent workspace edits are retained.

ADR-035 verification (local isolated QA, 2026-10-17):
- `npm.cmd run lint`: passed; `npm.cmd run build`: passed with local environment
  loaded, after the final runtime change. No dependency installation or migration.
- `node --conditions=react-server --test tests/unit/cms-pages.test.mjs tests/unit/publishing.test.mjs tests/unit/catalog-workflow.test.mjs`:
  11 passed, zero failures.
- `node --conditions=react-server --env-file=.env.test-migrator.local --env-file=.env.test.local --env-file=.env.cms.local --test --test-concurrency=1 tests/integration/simple-cms.test.mjs tests/integration/cms-pages.test.mjs tests/integration/cms-catalog.test.mjs tests/integration/publishing.test.mjs`:
  40 passed. A subsequent focused run of `simple-cms.test.mjs` with the same Node
  conditions/environment flags passed all 11 tests after adding concurrent direct
  approval coverage (41 distinct integration cases across those runs).
- The first focused run failed two old `approved` status expectations because
  approval now correctly publishes. The next run found two test-reader permission
  errors: the CMS role intentionally cannot execute the app-only public SQL
  functions. Assertions now use the authorized published readers within their test
  transaction. No database grant was broadened. Final focused run: 11/11 passed.
- Protected env files were unavailable to sandboxed test/build attempts. Those
  checks were rerun with approved escalation; secrets were not printed. The local
  content-mode-only check confirmed `published`.
- `git diff --check`, plus `node --check src/server/cms/approval.mjs` and
  `node --check tests/integration/simple-cms.test.mjs`: passed.

Security: Staff API forgery remains denied, real database membership overrides
request/resolver role claims, CSRF/session checks remain active, and concurrent
approval produces one winner and one conflict with one exact audit sequence.
Failed schedules/validation preserve the prior public revision. SEO title and
content replacement share the committed revision; existing noindex policy remains.
Full dependency audit, Lighthouse, cross-browser/manual QA and unrelated release
suites were not rerun. These results do not authorize production release or starting
a persistent scheduler. Scheduled publication still requires the existing worker.

- Browser QA: `npm.cmd run test:cms-pages-e2e` passed all 12 cases across
  desktop/mobile/small-mobile; `npm.cmd run test:cms-catalog-e2e` passed all 9.
  Initial `npm.cmd run test:publishing-e2e` had three desktop passes and one
  timeout: the catalog UI incorrectly queried draft-only readiness for a frozen
  review revision, preventing confirmation. The editor now queries that readiness
  endpoint only for drafts; the server still validates exact reviewed content.
  Lint/build were rerun after this one-line UI correction.

- Final `npm.cmd run test:publishing-e2e`: 12/12 passed (desktop 4, mobile 4,
  small-mobile 4), exit 0; the runner cleaned its exact synthetic records and
  verified database protections/empty test state. Across the three browser suites:
  33 distinct cases passed. Final lint/build and whitespace checks passed.
