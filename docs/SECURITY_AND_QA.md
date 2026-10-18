# Security, Privacy & Quality Gates

> Catatan 2026-10-18 (ADR-034/038 dan penghapusan kode bahasa): situs hanya Indonesia, URL tanpa prefix; `/id` dan `/en` adalah 404 biasa tanpa alihan. Catatan hasil QA historis di bawah yang menyebut bilingual, ID/EN, locale, `/id`, atau `/en` mencatat keadaan saat itu dan tidak lagi berlaku; gerbang hidup ada di bagian "Mandatory automated coverage" dan bagian terbaru di akhir dokumen.

## Security baseline
- Use widely reviewed OSS auth library if it meets requirements; no DIY password hashing/session system.
- Credential login, internal invitation/provisioning only; optional Owner MFA; verified-email single-use expiry-limited reset flow; rate-limit login and reset endpoints.
- HTTP-only, Secure, SameSite session cookies; server-enforced absolute expiry <=24h and idle <=1h; revoke sessions after password reset. Consider step-up auth for dangerous merchant settings.
- Server-side RBAC and per-resource checks. Staff cannot publish, schedule, approve revisions, archive live pages, enable merchant API or sync by invoking endpoints directly.
- Validate/sanitize all rich text and URL embeds via allowlist. Ensure CSRF mitigation, safe redirects and CSP appropriate to embeds/GA4.
- Check MIME by content, caps for file size/type/dimensions, safe random storage key; private uploads controlled; never run files as code.
- External API tokens stored server-side only; production API use needs separate explicit user authorization; audit excludes secrets and personal info.
- No live vendor API calls or real email sending in automated tests. Use mock services, sandbox approved by owner, fixtures.
- Verify dependency licenses and vulnerabilities; lock dependencies; prevent committing secrets.
- Data/privacy: no tracking before required consent where applicable; review Indonesia privacy obligations, third-party embeds and privacy notices before launch.

## Mandatory automated coverage
1. Unit: currency, modifier minimum/maximum, URL allowlist (tanpa prefix bahasa), revision approval invariant.
2. Integration: auth/session expiry, server RBAC, draft/approval/publication boundaries, scheduled publish, sync default-OFF, per-platform failures/idempotency.
3. Playwright: public navigation (satu bahasa; `/id` dan `/en` 404), mobile CTA, admin login and role restriction, draft/review/approve/publish/archive, 404/unpublished behavior, UTM/GA4 mocked, media preview.
4. Security: dependency audit, secret scan, inputs/embeds/CSRF, prohibited actions.
5. Build and lint on PR. Tests must be reproducible and run without live credentials.

## Performance & release criteria
- Good CWV targets (LCP <=2.5s, INP <=200ms, CLS <=0.1 at p75 when field data available).
- Lighthouse mobile Performance >=90 as QA target tested on controlled conditions, not a production guarantee.
- Default video poster/lazy-load, responsive images, preserve layout sizing, minimize JS.
- No failing blocker tests, unauthorized mutation, mock menu facts in production, or unapproved live merchant calls.
- For changes, report precise commands/run results; if tests not run, state explicitly.

## Phase 1C public preview E2E coverage

Run `npm run build` then `npm run test:e2e`. Install the matching Chromium
once with `playwright install chromium` using the local CLI. The checked-in
JavaScript tests use Playwright 1.64.1 and axe Playwright 4.14.0. They target
only the production build on http://127.0.0.1:3030; an existing server is never
reused. Screenshots/traces are retained on failure, and HTML/JSON reports are
local ignored artifacts. No credentials or live merchant data are needed.

The 222 cases span 1440px desktop, 390px mobile and 320px small mobile:

- All public routes (historical 222-case run: 24 routes): server content, metadata/lang, H1,
  noindex, internal links and anchors and invalid-route 404.
- Homepage/menu/detail journeys, explicit unavailable merchant links, promo
  navbar, footer guides, breadcrumbs and cross-page ordering anchor.
- (Historical: language switching was removed by ADR-038; there is no switcher.)
- Axe WCAG A/AA tags, overflow/duplicate IDs, keyboard skip link and promo focus.

The browser fixture aborts and fails attempted non-local HTTP(S)/WebSocket
connections, blocks service workers, and checks uncaught page exceptions.
API checks use fixed local relative URLs. This is not an OS-level firewall,
an SSR network policy, or authorization to call live merchant services.

Passing requires zero test failures and no disabled axe rules to hide findings.
Axe incomplete findings are attached for manual review; a passing automated
scan does not replace screen-reader, contrast/context and keyboard review.
New UI defects discovered here require a separately approved implementation
scope before changing product files. Unresolved audit/peer findings remain
visible; no test result waives any release security gate.

CMS/auth/session/RBAC/revision/sync/unit/integration tests are still required
when those features exist. Lighthouse, CWV field data, Firefox/WebKit, secret
scanning and comprehensive security review are separate unexecuted gates,
not implied by this public-preview suite. Actual initial results are recorded
in README and docs/DECISIONS.md.

## Focused verification preference and Phase 2B2 (2026-10-16)

User instruction: skip repeated checks that are unrelated to the current change.
Run relevant checks for changed behavior; repeat on new changes, failures or
unresolved concerns. This does not waive the full release criteria above.

For the test-only migration, actual focused checks were syntax, two test-target
guard cases, SQL/hash/history/ownership review, migration application and safe
repeat, eight DB constraint/permission behaviors, transaction cleanup, lint,
dev-unmigrated metadata query and diff checks. Old config/connection suites,
build, E2E, dependency audit and Lighthouse were not rerun. Packages/UI did not
change; earlier audit/peer findings remain open.

Run `npm run db:migrate:test` ONLY after local test migration approval and private
migrator provisioning; it persists the test schema/history. Run
`npm run test:catalog-db` for rolled-back synthetic data checks afterwards.
Credential files are not printed or tracked. These checks are not CMS RBAC,
approval/publishing, price/modifier, production migration or release coverage.

The first constraint suite had seven passes and one incorrect expected error
code. PostgreSQL RESTRICT uses 23001 (restrict_violation); the test was corrected
and only that failed case was rerun successfully. No database rule was weakened
and no unresolved failing case was accepted. See README/ADR-010 for full results.

## Focused development migration checks (Phase 2B3)

Run the new dev-target guard tests, script syntax validation and lint before
interactive setup. After approved dev provisioning, run db:migrate:dev twice,
then verify-dev-db.mjs with the separate dev migrator and app env files. The
verifier uses read-only transactions for metadata, empty table and runtime
privilege checks; it does not seed or mutate catalog records. The migration
runner independently verifies actual migrator privileges before SET ROLE.

Passwords are entered in the local interactive terminal, never chat/arguments.
Inspect ignored test-results/dev-migrator-setup-status.json on partial failure;
recover only after checking actual state. Full release gates and previous audit
findings remain open. Packages/public routes are unchanged; unrelated build,
E2E/audit/Lighthouse suites are not repeated for this isolated operation.

Phase 2B3 actual DB result: local setup completed; protected private env ACL and
Git ignore verified. First dev migration passed, repeat made no changes, and
read-only verifier passed (all exit 0). Seven empty owner-owned tables, matching
migration history, six RESTRICT FKs and runtime privilege isolation were checked.
Sandbox ACL access was denied; authorized user-context execution preserved ACLs.
No synthetic records, grants to runtime app or test DB changes were made here.

## Phase 2C1 focused offline pricing checks

20 node:test cases exercise exact totals, zero amounts, multiple variant selection,
prices above 100000, safe-integer boundary/overflow, invalid numeric types,
min/max and required groups, repeat/unknown options, cross-product/revision/group
ownership and ambiguous/malformed graphs. No DB/env or merchant call is needed:
node --test tests/unit/catalog-pricing.test.mjs.

Offline snapshot/SQL checks confirm six additive tables, six scoped RESTRICT FKs,
linked snapshots, unchanged prior seven tables and preserved 0000 SQL hash/journal.
These are not PostgreSQL enforcement tests. DB integration must follow separately
approved test migration and include actual FK/range/uniqueness/localization denial
and transaction cleanup. Do not execute the existing migration runners unchanged:
they fail closed because the reviewed 0000-only history now has an extra file.

Public UI/packages are unchanged. Build/E2E/audit/Lighthouse are not repeated in
this offline step, consistent with focused verification preference; full release
gates and existing dependency/peer findings remain open. The pure validator is
not sufficient authorization, revision approval, publication or verified pricing
reconciliation. Future callers must load authoritative amounts server-side.

## Phase 2C2 actual test pricing migration checks

Executed: six migration-plan unit cases, MJS syntax, lint, test 0001 migration,
eight catalog constraint cases, eleven pricing DB cases, no-change migration
repeat, read-only dev metadata and diff review (all passed, exit 0). Prior pure
pricing unit/config tests, build, public E2E, audit/Lighthouse were not repeated.

Pricing tests use isolated test-owner connections and transaction/SAVEPOINT
fixtures; all revision/identity records are verified absent after rollback.
They check actual PostgreSQL amount/uniqueness/localized/group/FK/RESTRICT rules,
Drizzle bigint number mapping and calculator totals at the safe integer boundary,
service-only cross-row feasibility, runtime denial and thirteen empty owner-owned
tables with twelve RESTRICT FKs. No persistent dummy content is seeded.

SQL does not enforce final aggregate totals or cross-row readiness. The server
validator does; auth/approval/publication safeguards remain future work. Guard
unit tests reject modified artifacts/history/ownership but are not a complete
schema-drift fingerprint or comprehensive security review. Existing audit findings
and release gates remain open. Dev remains at 0000; its migration runner was not
updated. Applied test 0001 requires a reviewed reverse/restore for rollback.

## Phase 2C3 development pricing migration results

Six dev manifest guard unit cases passed, including rejection of test owner,
modified SQL/journal/history, partial state and wrong relation names/kinds/owners.
MJS syntax, lint and diff review passed. Dev runner application and no-change
repeat passed; read-only verification confirmed thirteen empty owner-owned tables,
two reviewed migration entries, metadata owner, twelve RESTRICT FKs and runtime
privilege isolation. The runner refused unexpected baseline data by design; no
such condition occurred in this execution. No synthetic dev records were inserted.

Previous test DB constraint results remain the evidence for pricing CHECK/FK/
uniqueness/translation enforcement; those mutation suites were not repeated on
dev. Test DB stayed outside this stage. Build/E2E/audit/Lighthouse and unchanged
suites were not rerun. Existing audit findings and full release gates remain open.
Future writes/public reads still require auth/RBAC and immutable approval/publication
protections. Reverse/restore for applied dev 0001 needs scoped review/approval.

## Phase 2D1 draft writer acceptance

Run node --conditions=react-server --test tests/unit/catalog-drafts.test.mjs for
input-before-DB and sanitized-error tests (4 passed). Run npm run test:drafts-db
for nine real PostgreSQL cases: defaults/empty revisions, atomic version+price,
stale/missing revision rejection, wrong-scope rollback, invalid amounts, int4
exhaustion, genuine two-connection race, unchanged runtime privilege denial and
complete fixture cleanup. Final full run 9/9 passed; syntax/lint/diff also passed.

Concurrency fixtures are explicitly authorized temporary COMMITTED test records.
Two writers are held on a revision lock until pg_blocking_pids shows both blocked;
release allows one winner and one stale conflict. Cleanup deletes exact owned
revision IDs/identities in dependency order, verifies absence and never resets
schema/data globally. All thirteen catalog tables empty at final verification.
Initial observation via pg_stat_activity failed; suspected role visibility was
avoided with the direct lock graph, no grant or assertion weakened. Targeted and
full reruns passed. Cleanup also passed on the failed initial run.

Future endpoints must authorize server-side and use an appropriate least-privilege
context. server-only is a bundling boundary, not RBAC. These tests do not prove
Owner/Staff permissions, approved/live immutability, auth/session expiry, audit,
full graph cloning or universal raw-SQL concurrency protection. No approved state
was introduced; public fixtures/SEO unchanged. Build/E2E/audit/Lighthouse and old
unchanged suites not rerun; release/security findings remain open.

## Phase 2D2 cloning acceptance

Executed successfully: writer unit suite 5/5, MJS syntax, lint, existing writer
DB suite 9/9, clone DB suite 11/11 and diff review. No failed/disabled/skipped case.
Clone DB coverage includes full ten-child-table comparison with nondefault values
and ID/EN descriptions, unrelated revision exclusion, stable identity retention,
source/clone edit isolation, empty/incomplete drafts, max int4 source version,
missing/stale source and rollback from a real division-by-zero SQL error during
sixth copy statement. Savepoint rollback leaves the enclosing transaction usable.

Concurrency tests observe actual pg_blocking_pids: clone waits on an uncommitted
editor then rejects stale version; editor waits behind shared clone lock then
changes source after clone commit, preserving the copy's prior snapshot. No extra
DB monitoring privilege. Test app cannot clone under unchanged grants.

Fixtures are temporary committed test-only source/copy rows with generated IDs.
Cleanup uses dependency-order DELETE on those revision IDs and exact generated
identity ID/slug pairs, verifies absence, and confirms thirteen empty tables.
No migration/reset/drop/truncate/CASCADE or production/development mutation.

Lock coverage is for compliant root-version writers, not arbitrary SQL or shared
slug edits. Copy preserves incomplete drafts, not bilingual approval readiness.
Auth/RBAC/session/audit, approved/live protection, build/E2E/audit/Lighthouse and
full release gates remain separate; prior dependency findings remain open.

## Phase 2D3 translation acceptance

Executed: six unit tests (including locale/title/description/scope/version rejection
before DB and sanitized error behavior), syntax/lint/diff; writer regression 9/9,
clone regression 11/11 and translations DB 11/11 (all passed, exit 0).

Coverage: insert/update category/product locale rows, empty descriptions, exact
Unicode/newline/literal-markup text, ID/EN and revision/clone isolation, unchanged
slugs/root status, missing parent and stale root rollback, actual SQL failure after
upsert restoring root/text, int4 exhaustion, unchanged app denial and cleanup.
Independent text/price writers were both observed blocked via pg_blocking_pids,
then only one committed and the other conflicted; shared root helper prevents
silent overwrite across these edit types.

All temporary test fixture/clone rows cleaned by exact owned IDs; thirteen tables
empty. No schema/dev/migration/grant/credential changes. Plain-text persistence is
not XSS sanitization; future UI must escape strings and not render stored text as
HTML. RBAC/session/audit, approval/publication, variant/modifier edits and full
release checks remain pending. Build/E2E/audit/Lighthouse and unchanged old suites
not rerun; existing dependency findings remain open.

## Phase 2D4 variant writer acceptance

Executed: eight unit cases, MJS syntax, lint/diff, writer 9/9, clone 11/11,
translation 11/11 and new variants 13/13 integration cases (all passed, exit 0).
Variant tests verify generated IDs, first/sole standard, named variants and edits,
duplicate-code rollback, zero/JS-safe prices, int4 sort boundary, parent/composite
scope, literal ID/EN upserts, real SQL rollback, stale/root exhaustion, cloning
and source independence. Uppercase UUID input also resolves its correct variant.

Creation-vs-product-text and full-edit-vs-price races use independent sessions
observed simultaneously blocked via pg_blocking_pids, then exactly one succeeds
and the other conflicts. No mixed/partial losing writes. Runtime app remains
denied all three new operations. Temporary committed fixtures and clone rows
cleaned by owned IDs in dependency order; thirteen tables empty at final check.

No schema/dev/grants/credentials/dependency/UI/SEO/merchant change. HTML-like
strings remain literal and need escaped rendering later, not HTML insertion.
Deletion, auth/RBAC/session/audit and approved/live protections remain pending.
Unrelated suites/build/E2E/audit/Lighthouse not repeated; full release gates and
existing dependency findings remain open.

## Phase 2D5 modifier writer acceptance

Executed successfully: writer unit 11/11, pricing unit 20/20, syntax/lint/diff,
DB writer 9/9, clone 11/11, modifiers 15/15. No failed/skipped cases. Tests cover
all six writes: generated IDs, parent/product/revision/group scope and no reparent,
code uniqueness (option code may repeat across groups), local single/min/max/sort,
zero/JS-safe delta, exact ID/EN literal fields, stale/technical version exhaustion,
real SQL failure after actual writes and complete token/child rollback.

DB-loaded graph prices/required selections/duplicate rejection/overflow validated.
Underfilled groups persist as drafts but readiness refuses them until options
suffice. Clone retains modifier graphs/labels and edits stay independent. Two
actual-session races (option create vs group rules, delta edit vs variant price)
are observed simultaneously blocked with pg_blocking_pids; one commit/one conflict,
no partial losing writes. Runtime app denied all six functions under existing grants.

All committed test fixtures cleaned only by owned revision/identity IDs; thirteen
tables empty. No dev/schema/grant/credential/dependency/public-SEO change. Unchanged
variant/translation DB suites and unrelated build/E2E/audit/Lighthouse not rerun.
Full release gates, dependency findings and auth/approval/publication prerequisites
remain open. Plain-text labels need escaped rendering, not HTML insertion.

## Phase 2D6 bundled foundation acceptance

Executed: 43 unit cases (draft input/errors 12, pricing 20, review graph/reader 11),
new module/test syntax, lint/diff; DB drafts 9, clone 11, translations 11, variants
13, modifiers 15, foundation 12 (71 DB cases). All passed on first full run, exit 0.
No disabled/skipped case. Full catalog with all five bilingual entity types created
through application writers from empty draft, then structural ready report verified
without root status/version change. Empty/partial graph returns specific deficits.

Foundation tests cover namespace slug collisions and real concurrent cross-revision
creation (one winner/one SLUG_CONFLICT, no orphan identities), scoped placement,
actual rollback for identity+entry and placement operations, clone/source isolation,
worst-case sum overflow and exact boundary, same-root placement races, read-lock
consistency and report staleness after waiting edit, version exhaustion and unchanged
app read/write denial. Root locking is observed via pg_blocking_pids, not assumed.

Fixture roots/identities are created by application writers and tracked before
outer commit. Cleanup uses exact owned revision/identity ID+slug pairs in dependency
order; no wildcard/global cleanup/reset/drop/truncate/CASCADE. All thirteen test
tables empty at final check. No dev/schema/migration/grant/credential changes.

Review report is structural, not content verification or authority. Normal SELECT
FOR SHARE transaction makes no DML, but is not PostgreSQL READ ONLY mode. Future
submit/approve must revalidate current exact version and freeze under authorization.
Raw SQL/shared-identity changes remain outside the compliant root writer contract.
No UI/SEO/public-source switch. Build/public E2E/audit/Lighthouse and unrelated
suites not rerun; existing dependency findings and full release gates remain open.


## Phase 2 group 2 backend acceptance (ADR-021)

Unit coverage: canonical hash determinism and every approved column, scope/version,
missing rows/fields, unknown/unwired identity, forged Owner inputs, staff denials,
invalid revision/hash tokens and sanitized failures. All 74 repository unit cases
passed with node --conditions=react-server --test tests/unit/*.test.mjs.

Database acceptance: 90 regression cases and 14 publication cases passed. Tests
exercise complete submit/approve/reject/publish/archive flows, raw INSERT/UPDATE/
DELETE denial on all ten frozen child tables, frozen roots/shared identities,
clone isolation, exact hash approval, idempotent publish, stable live snapshot
until replacement, current-live archive/pointer-delete denial and append-only
receipts/audit. Deferred completion constraints are forced immediately and tested
through actual committed transitions, not only rollback fixture transactions.

Real SQL failure at the audit write rolls back each of five transitions, including
receipt/approval/root and publication pointer. Independent sessions genuinely wait
on locks before submit-versus-editor, approve-versus-reject and first-publish races.
All 17 test tables are empty afterwards; 8 function bodies/owners/search paths and
36 enabled custom trigger definitions are checked against reviewed migrations.
Runtime app keeps no table privileges. Default workflow auth fails closed.

Migration test covers both SQL failure and failed post-application verification;
temporary DDL and migration history both roll back. Original nested migrator
transaction issue and deferred approval field bug were found and corrected during
acceptance; applied 0002 remains intact with forward correction 0003.

Committed frozen test fixtures require owner maintenance: verify test database,
lock all 17 tables exclusively, disable USER triggers inside the transaction,
delete only tracked revision/category/product IDs in dependency order, reenable
and verify protections before commit. Any error rolls back maintenance. No global
delete, reset, truncate, drop or development cleanup. This path is test-only.

Lint and optimized build passed. Production dependency audit found zero entries;
full audit still reports 5 high and 4 moderate development dependency entries.
No audit fix/override/install was run. Release gates remain open; actual login,
session expiry, route CSRF, scheduler, merchant parity, staging and Lighthouse
are outside this backend package. Public fixtures/noindex behavior is retained.


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

## Phase 2 group 3 bilingual page acceptance (ADR-022)

Executed and passed: 89 unit, 18 page integrations, 90 catalog regressions, 14
catalog publication integrations, 4 app connectivity/role isolation tests, lint,
optimized build and 222 Playwright public cases (--workers=1, 4.7 minutes).
There were no failing/skipped cases in these final runs. Test/development 0004
migration, no-change repeats, read-only dev verifier and final diff review passed.

Page tests cover all nine fixed templates, both exact locales/no fallback, unknown
fields/layout/prototype keys, raw HTML/script/media nodes, unsafe links, size/node/
field bounds, canonical jsonb hashes and exact version/identity scope. Literal HTML
characters stay plain text; group 5 must render via React nodes, never raw HTML.
Default-deny every factory write, forged Staff Owner actions, safe driver errors,
frozen raw SQL writes/root moves, cross-page pointers, append-only receipts/audit,
deferred completion, clone isolation and safe replacement/archive are tested.

Real SQL failure after actual writes rolls back create, save, clone and all five
workflow transitions; failed replacement retains old pointer. Two editors, submit
versus editor, approve versus reject and first-publication races use independent
connections actually blocked in pg_blocking_pids before release. Exactly one stale
write/decision loses; serialized publications leave one complete bilingual pointer.
Technical version exhaustion can submit/clone and cannot overflow on edit.

Committed page fixtures use test-only maintenance: confirm test DB, lock seven page
 tables exclusively, transactionally disable USER triggers, delete exact tracked
 revision IDs and only now-unreferenced tracked page keys, reenable and verify
 protection before commit. Fixture creation locks page identities and tracks only
 keys that did not exist before creation, so existing page identities are preserved.
 Errors roll back cleanup. No truncate/reset/global delete.
Both local DBs have 24 empty tables; all 16 function bodies/owners/search paths and
52 custom trigger definitions/enabled state are verified; runtime app grants denied.

No current UI/SEO/public source change or live network call. Existing dependency
audit findings remain open; audit was not rerun with unchanged dependency versions.
Login/session/CSRF endpoints, rich text renderer, scheduler, media, Lighthouse,
staging and release acceptance are not implied by this backend completion.

## Phase 2 group 4 media acceptance (ADR-023)

Actual final checks passed: 102 unit, 16 media integrations, 18 page integrations,
90 catalog regressions, 14 catalog publication integrations and four app role/
connectivity tests. Total DB integrations 142. Lint/build, 222 public E2E on one
worker (2.4 min), test/dev migration+no-op repeats, read-only dev verifier passed.

Unit tests cover image/video caps and exact boundaries/portrait, unsupported MIME,
filename/path/checksum, missing/non-image posters, unsafe YouTube URL/HTML input,
identity spoofing/absent inspectors and sanitized adapter/DB failures. Trusted
inspector receives frozen server identity independent of forged request role.
Media graph requires exact scoped rows/assets/posters, both alt locales, limits;
malformed arrays/null rows fail. Old catalog/page SHA256 constants were captured
before edits and remain identical for absent/empty media. Media binds labels/
captions/order/metadata/checksum; DTO removes private storage/checksum/actor fields.

DB tests exercise registration audit, SQL metadata/null/size checks, immutable
assets/posters/events, scoped reference create/update/remove, stale versions,
raw reparenting and frozen CRUD denials, incomplete bilingual review, clone and
explicit live replacement with exact approval hash. Real SQL failure after writes
rolls back registration and all reference operations, including root version.
Independent sessions actually blocked via pg_blocking_pids before media-vs-text/
submit races. Two raw INSERTs starting at eleven references yield one success,
one constraint denial and exactly twelve rows under parent UPDATE locks.

Committed fixtures are tracked inside setup transaction. Page key ownership is
checked under table lock; only newly created keys enter cleanup. Test-only owner
maintenance verifies database, locks tables exclusively, disables USER triggers
inside one transaction, deletes only tracked revision/asset IDs and owned now-
unreferenced page keys, reenables guards and verifies before commit. No global
delete/reset/drop/truncate. Both local DBs have 28 empty tables, exact six history
entries, 30 RESTRICT FKs and 19 function/60 trigger definitions verified.

Important boundary: tests use synthetic inspection adapters. They do not decode
or scan actual uploaded bytes, validate codecs, serve media or prove physical
file immutability. No actual adapter is wired and file registration fails closed.
Future Phase 3 adapter must enforce actor ownership, content inspection and
write-once storage/checksum integrity. No endpoint/upload UI or live network call.
Group 5 adds safe rendering/optimization/player policy. Actual auth/session,
privacy/consent, staging/Lighthouse/release and existing dependency findings remain.
Dependency audit not rerun: no version/lockfile change in this package.

## Phase 2 group 5 acceptance - 2026-10-16 (ADR-024)

Functional acceptance is complete for the approved Phase 2 public integration.
Release readiness remains open: existing development dependency advisories, real
business content/media, Phase 3 auth/upload adapters and staging/release gates.
No production/merchant operation or Phase 2 Git commit/push occurred.

Modified package: migration 0006 and public-read protection verifier; test/dev
migration manifests/runners and dev verifier; src/server/public config/data/view
models; localized routes/layout/error boundary/icon; PublishedContent, media and
product-choice components; global CSS, env template and Playwright configuration;
public integration/unit/browser fixtures and QA/bundle-check scripts; package
scripts and implementation/decision/dependency/QA documentation. Existing work
and applied 0000-0005 SQL were preserved; no project dependency/lockfile change.

Actual commands and results:

- npm.cmd run lint: passed, zero warnings.
- npm.cmd run build: passed, production build with request-fresh public routes.
- node --conditions=react-server --test tests/unit/*.test.mjs: 104 passed.
- node --conditions=react-server --env-file=.env.local --env-file=.env.test-migrator.local --env-file=.env.test.local --test --test-concurrency=1 tests/integration/*.test.mjs: 143 passed.
- npm.cmd run test:e2e: 222 fixture E2E passed, explicit fixture mode.
- npm.cmd run test:published-e2e: 72 published + 6 empty DB E2E passed; zero skips/flaky/unexpected results across desktop, mobile390 and small320 widths.
- node --conditions=react-server --env-file=.env.test-migrator.local --env-file=.env.test.local scripts/run-published-qa.mjs --lighthouse: passed, three final mobile reports below.
- node with four private local env files, scripts/check-public-bundle.mjs: 15 browser assets checked, no loaded DB URLs/passwords found. This is a scoped check, not proof of absence of every possible secret.
- npm.cmd audit --omit=dev --fetch-retries=0 --fetch-timeout=15000: passed, zero vulnerabilities.
- npm.cmd audit --fetch-retries=0 --fetch-timeout=15000: exit1, existing 9 development affected-package entries (5 high/4 moderate); no automatic fix/downgrade.
- npm.cmd run db:migrate:test: applied 0006 first; final repeat no changes.
- npm.cmd run db:migrate:dev: applied 0006 after functional QA/Lighthouse; repeat no changes.
- node --env-file=.env.dev-migrator.local --env-file=.env.local scripts/verify-dev-db.mjs: passed.
- npm.cmd run test:db-connection: four passed again after dev migration.
- Read-only development app smoke: both published SQL readers execute successfully and return null for the intentionally empty DB.
- git diff --check: passed. Lockfile SHA256 stayed AFA9844ECA65CFE813BC86454E89E24D6419268FA210A8E47A3B3DCB68A221F9 throughout temporary Lighthouse use.

Final Lighthouse12.8.2, simulated mobile, local optimized Next server, synthetic
content and reserved media placeholders:

| Page | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Home ID | 99 | 100 | 100 | 60 | 2.1s | 0 | 50ms |
| Menu EN | 98 | 100 | 100 | 60 | 2.3s | 0 | 110ms |
| Product ID | 90 | 100 | 100 | 60 | 2.4s | 0 | 350ms |

Reports: ignored test-results/lighthouse/{home-id,menu-en,product-id}.report.html
and .report.json. Target Performance>=90 met in these three local samples.
These are single lab samples, not field CWV or production guarantees. Product
blocking time still merits attention with real content; scores vary by machine.
SEO60 is caused by the intentionally retained noindex directive. A missing
favicon found during QA was corrected using the existing TO brand stamp.
Do not remove noindex merely to raise a local audit score.

Security/SEO acceptance: app role can execute only the two reviewed public JSON
readers, never SELECT/write tables or SET ROLE Owner. Draft/approved-only catalog
remains private; published replacements appear on fresh reads. Per-locale labels,
mandatory topping minimum price and a 400000-IDR combination are covered. Public
DTO excludes hashes/storage/checksum/actors. Fixed rich text is escaped, no raw
HTML; script-like text stays literal. Browser checks include no runtime exception,
axe accessibility, no horizontal overflow, 404 details/invalid locale and absence
of fixture fallback. YouTube iframe is absent before consent; browser tests block
external requests, including the consent click. No real video was fetched.

Both local databases end with 28 empty tables, seven reviewed history entries,
30 RESTRICT FKs, 19 original guard functions/60 triggers and two verified public
read functions with explicit owner/app EXECUTE ACLs. Synthetic fixtures are
removed by exact tracked IDs under test-only transactional maintenance, with
guards restored and verified before commit. Runtime table grants stay denied.

Rollback: revert public application files or select explicit local fixture preview
while investigating. A committed SQL change needs an inspected, approved reverse
migration/restore; preserve applied SQL and migration history. No production
rollback or deployment is authorized.

Additional failure smoke: local production server on port3032 with intentionally
invalid synthetic test-app password rendered the Indonesian generic error boundary.
Browser body contained no database URL/password/login, raw authentication error
or example menu fallback. No data was written; temporary server/browser closed.
Final lint/build also passed after matching the error component arrow-function
convention (no behavior change).

## Phase 3.1 authentication acceptance - 2026-10-16 (ADR-025)

Implemented on feat/phase3-1-auth based on main d323c80, under explicit package
approval and standing authorization to commit/push each completed Phase3 subphase.
Modified files include src/server/auth/*, src/server/db/auth-schema.mjs, admin
and auth routes, cms/auth components, migration0007/snapshot/journal, migration
plans/runners/verifier, auth provisioning/setup/QA/bundle scripts, package files,
env template, CSS, unit/integration/browser tests and documentation. Existing
0000-0006 SQL/history and public table access restrictions were preserved.

Actual commands/results:

- npm.cmd run lint: passed, zero warnings.
- npm.cmd run build: passed for public routes, protected admin and Node auth API.
- node --conditions=react-server --test tests/unit/*.test.mjs:107 passed.
- node --conditions=react-server --env-file=.env.local --env-file=.env.test-migrator.local --env-file=.env.test.local --test --test-concurrency=1 tests/integration/*.test.mjs:154 passed (143 previous +11 auth including suite wrapper).
- npm.cmd run test:auth-e2e:18 passed, six on each desktop/mobile390/small320.
- npm.cmd run test:e2e:222 public fixture cases passed.
- npm.cmd run test:published-e2e:72 published +6 empty-state cases passed.
- Total browser acceptance318, no failed/skipped/flaky cases in final reports.
- node with private local DB/auth envs, scripts/check-public-bundle.mjs:22 assets checked; no loaded DB URL/password or auth secret found.
- scripts/setup-auth.ps1: generated private ignored .env.auth.local with random secret and owner-only ACL; did not print the secret. Both auth PowerShell scripts passed parser syntax checks.
- Runtime development smoke: private config loaded, anonymous session rejected; no real account provisioned.
- npm.cmd run db:migrate:test:0007 applied; repeat no changes. An initial incomplete manifest caused final verification to fail; the transaction rolled back. The manifest was corrected before successful application. Applied SQL was not rewritten.
- npm.cmd run db:migrate:dev:0007 applied only after functional QA; repeat no changes.
- node --env-file=.env.dev-migrator.local --env-file=.env.local scripts/verify-dev-db.mjs: passed, including auth guards/grants.
- npm.cmd run test:db-connection: four passed again after dev migration.
- npm.cmd audit: exit1, existing9 affected-package entries (5 high/4 moderate).
- npm.cmd audit --omit=dev: exit1, existing4 moderate entries now reachable through Better Auth's optional Drizzle Kit peer.
- npm.cmd audit --omit=dev --omit=optional: passed, zero findings; diagnostic of optional peer exposure only, not an approved deployment workaround. No force fixes, removal or downgrade applied.
- Lighthouse not rerun for this auth subphase; Phase2 performance results are historical and are not claimed as new measurements.

Security acceptance: registration/social/user mutation/account-linking endpoints
are not allowlisted. Every protected CMS page reads fresh server session and
read-only membership; request-supplied role is ignored. Staff cannot open Owner
security page or enable MFA through a forged API request. Sign-in uses library
password verification; role/disabled changes are checked per request. Cookies
are HttpOnly/SameSite=Lax and Secure under HTTPS (tested); local HTTP config is
loopback-only. Remote host/proxy/TLS review remains required before deployment.

Absolute expiry24h, immutable session identity and atomic server activity gate
with1h idle expiry are tested. Cookie cache and rolling refresh are disabled.
Successful logout and reset revoke sessions. Durable bounded HMAC-key counters
protect routes/accounts; concurrent login attempts yield exactly five allowed
password attempts and one429, and a new service instance preserves the limit.
Untrusted forwarded IP headers are not used; local library per-path fallback is
shared. Future proxy-aware distributed limits require release review.

Origin checks cover state-changing requests, callbacks stay in CMS on configured
origin, body input is bounded to8KiB while streaming, errors are generic. Session
tokens are kept in HttpOnly cookies, removed from JSON. MFA uses library TOTP/
encrypted recovery data; Owner enrollment, later challenge, rejection of bypass
trustDevice flag and single-use recovery codes are covered. Verification/login
audit identifies opaque subjects and excludes email/password/token/secret.

Reset has uniform eligible/unknown responses, enabled+verified-email gating,
15-minute single-use tokens, expired/replayed-token rejection and session
revocation. Real delivery is absent: runtime reset/send-verification returns503;
UI states this. Tests inject memory mail capture and verify actual library reset
and email ownership flows. Reset/verification links keep tokens in URL fragments;
browser tests assert no token enters a request URL. Verification is translated to
library GET only internally; browser uses same-origin POST. No SMTP, real email,
merchant, production or telemetry operation was performed.

Test fixtures require empty isolated auth tables, hold test advisory lock and
track new users. New audit/limit/verification IDs from the exclusively owned run
are collected for exact-ID cleanup, with no truncate/reset/drop. Cleanup locks
auth tables, temporarily disables audit USER guard inside one transaction,
deletes owned IDs/users, restores guards and verifies before commit. Final test
DB is empty. Development ends with no real accounts; operator creates them next.
Both DBs have28 public +9 auth tables, eight reviewed migration history entries,
original public protection and three new auth guard functions/triggers intact.

Residual limits: real email sender not configured, initial operator account not
yet entered, editor/workflow writes and physical media/scheduler remain later
subphases. Existing advisories and staging/release gates remain open. The full
security test suite does not constitute a production penetration test.

Rollback: revert this subphase's application commit to restore prior application
behavior. Preserve private secret/config and any subsequently provisioned users.
After committed migration, removing auth schema/grants/data requires an inspected
and explicitly approved reverse migration/restore. Keep SQL/history intact;
Git revert alone does not reverse SQL. No deployment or destructive action.

## CMS password minimum adjustment - 2026-10-16 (ADR-026)

User approved minimum6/max128 for CMS Owner/Staff passwords. Branch
fix/cms-password-minimum starts from merged main8bd3831. Modified auth library
configuration, trusted provisioning validator/PowerShell prompt, reset form,
auth integration/browser cases and active policy documentation. No dependency,
SQL, database credential, secret, role or session configuration was changed.
PowerShell can prefill email/display name while password still enters through
Read-Host -AsSecureString with confirmation, UTF8 stdin and library hashing.
No real identity or password is included in repository documentation.

Actual validation: npm.cmd run lint passed; npm.cmd run build passed; full unit
suite107 passed; npm.cmd run test:auth-db12 passed; npm.cmd run test:auth-e2e18
passed (six cases each desktop/mobile390/small320). Boundary case verifies
provisioning rejects5, creates a synthetic six-character credential and logs in;
verified synthetic reset rejects5 without spending the token, accepts6, revokes
the old session and allows only the new password. Browser reset submits six
characters and reaches token validation. All synthetic fixtures were cleaned.

PowerShell provisioning parser passed. Browser bundle scan22 assets found no
loaded private DB URLs/passwords or auth secret. Full public/database regression,
Lighthouse and dependency audit were not repeated for this narrow auth policy
change; unchanged dependency advisories remain documented and open.

Security: six-character passwords are more guessable; user explicitly chose the
new policy after the risk was stated. Existing hashing, rate limits, optional
Owner MFA, session enforcement and noindex private CMS routes still apply.
Real email delivery remains unavailable without the approved sender adapter.

Rollback via revert of this application's policy commit; preserve any newly
created account and existing password hashes. This does not reset/delete accounts
or require SQL rollback. Account deletion or forced password changes need separate
explicit scope/approval.

## Phase 3.2 CMS page acceptance - 2026-10-17 (ADR-027)

Branch feat/phase3-2-cms-pages is based on main b1753db. Changed modules: admin
page/revision routes, authenticated CMS JSON routes, CMS request/database/service
composition, structured editor/preview/actions, scoped styles, page conflict
mapping, audit action constraint/schema, migration0008/snapshot/journal, local
role provisioning, migration guards/verifier, tests and operational documentation.
No added dependency/version or package-lock change. Development content/accounts
were not seeded/changed by QA. The user ran local CMS role provisioning via the
hidden administrator password prompt; random CMS credentials stay private/ignored.

Actual commands and results:

- npm.cmd ci --ignore-scripts --no-audit --no-fund: passed; restored missing local
  packages using the unchanged lockfile. Existing ESLint peer warnings and optional
  cleanup EPERM warning were emitted; build/lint subsequently worked.
- npm.cmd run db:migrate:test and npm.cmd run db:migrate:dev:0008 applied to
  local databases only. Repeats passed as no-ops. Original0000-0007 SQL preserved.
- npm.cmd run lint: passed with zero warnings on the final source.
- npm.cmd run build: passed; public/admin routes and CMS HTTP handlers compiled.
- node --conditions=react-server --test tests/unit/*.test.mjs:111 passed.
- node --conditions=react-server --env-file=.env.local
  --env-file=.env.test-migrator.local --env-file=.env.test.local
  --env-file=.env.cms.local --test --test-concurrency=1 tests/integration/*.test.mjs:
  163 passed. Local ignored report: test-results/integration-phase3-2.tap.
- npm.cmd run test:cms-pages-db: final9 passed. Eight overlap the full integration
  run; an added two-connection CMS transaction test confirms one winner, one
  REVISION_CONFLICT, version increment once and no losing-save audit row.
- npm.cmd run test:cms-pages-e2e:15 passed, five each desktop/mobile390/small320.
- npm.cmd run test:auth-e2e:18 passed, six each viewport.
- npm.cmd run test:e2e:222 public fixture cases passed.
- npm.cmd run test:published-e2e:72 published and6 empty-state cases passed.
- Browser total333; final reports have no failed/skipped/flaky cases and retries0.
- node --env-file=.env.dev-migrator.local --env-file=.env.local
  scripts/verify-dev-db.mjs: passed;28 empty public tables, history0000-0008,
  30 RESTRICT FKs, auth/CMS guards and public privilege isolation checked.
- node --env-file=.env.local --env-file=.env.cms.local --env-file=.env.auth.local
  scripts/check-public-bundle.mjs:24 assets passed; no loaded private URL/password
  or auth secret found in browser assets.
- setup-cms.ps1 PowerShell parser check: passed. git diff --check: passed.
- Snapshot review: only page_workflow_events constraint changes from0007;
  prevId chain is correct. Private envs and QA artifacts are Git-ignored.
- Final read-only test verifier:28 public and9 auth tables empty; CMS/auth grants
  verified after all fixtures. Staged SQL bytes match the applied migration hash.
  Staged diff secret scan against configured private values: passed.
- npm.cmd audit --json: exit1, existing9 affected-package entries,5 high/4 moderate.
- npm.cmd audit --omit=dev --json: exit1, existing4 moderate optional-peer-chain
  entries. No automatic fix, removal, downgrade or release exception applied.
- Lighthouse/staging/production QA not run; earlier measurements are historical.

Corrected initial failures: the migration verifier originally requested an invalid
column DELETE privilege, and the new manifest entry was initially missing because
of CRLF matching. Failed migration transactions rolled back before successful
application; applied SQL was not rewritten. Full integration initially failed
three old assertions expecting eight history rows; updated to the reviewed nine.
Browser tests initially used the wrong login label. Prefilled editor textarea
labels then exposed a real selector/accessibility issue, corrected with explicit
label/id relationships. One login exceeded the default5s expectation while a
second browser suite ran; final CMS acceptance used15s login expectations and ran
on its own, without retries or reduced test coverage.

Security acceptance: anonymous/read/write denial, trusted Origin and bounded JSON,
forged Staff Owner actions, unknown input/role fields, actual expired idle session,
server membership override, frozen approval/hash, stale and simultaneous saves,
literal script-like text, immutable live content, clone without approval, Owner
rejection/publication/archive, atomic draft audits and role grants are covered.
Existing auth regression covers24h absolute expiry/MFA/reset/session revocation.
Public reads remain published-only; page/SEO previews remain noindex and no business
structured data is introduced. Media bytes/storage and scheduling remain deferred.

Test runners pass only application/auth/CMS credentials to browser/server children,
never migrator/admin credentials. Synthetic content/account IDs are cleaned under
test-only guards, with trigger protection restored before commit. Trace artifacts
may contain synthetic credentials; they remain ignored and must not be published.

Rollback: revert the application commit while protecting private configuration,
accounts/content and SQL history. Grant/role/constraint reversal requires a separate
inspected approved reverse migration. No merge, deploy, merchant or real email
operation is claimed; dependency findings still block release readiness.

## CMS shadcn UI acceptance — 2026-10-17 (ADR-028)

Approved scope: login, dashboard, page/revision lists/editor and shared header/
navigation. Branch feat/cms-shadcn-ui starts from main ccdd20c. Files changed:
components.json;15 vendored src/components/ui JSX files plus MIT license;
src/lib/utils.js;AdminShell/AdminHeader/AdminNav;admin layout/dashboard/login and
three page routes;LoginForm/LogoutButton;page editor/rich editor/revision actions;
admin.css and its globals.css import;package manifest/lock;CMS browser tests and
README/decisions/dependency/QA documentation. No backend API/schema/migration edit.

Actual commands and outcomes:

- npm.cmd install --save-exact --ignore-scripts radix-ui@1.8.1
  class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@3.7.0
  lucide-react@1.58.0 tw-animate-css@1.4.0 --no-audit --no-fund: passed.
  Existing ESLint peer warnings and optional Windows cleanup EPERM warning emitted.
  Lock comparison:78 new entries, zero previous package version changes.
- Official new-york-v4 component sources were downloaded and converted to JSX/
  arrow functions in memory, with local import aliases and retained MIT license.
  No shadcn CLI or scaffold command ran; no new TypeScript source was generated.
- npm.cmd run lint: passed, zero warnings on final code.
- npm.cmd run build: passed for public/admin routes and unchanged API handlers.
- node --conditions=react-server --test tests/unit/*.test.mjs:111 passed.
  Ignored local report: test-results/shadcn-unit.tap.
- npm.cmd run test:auth-db:12 passed (11 cases plus suite wrapper).
- npm.cmd run test:cms-pages-db:9 passed, including forged Owner actions,
  actual session expiry and simultaneous-save conflict/audit integrity.
- npm.cmd run test:cms-pages-e2e:18 passed, six each desktop1440/mobile390/small320.
  Includes dashboard data, account dropdown, mobile Sheet navigation, selected
  route, Escape/focus restoration, dialog cancel/confirm and Axe checks, plus all
  existing draft/review/Owner publication, clone and stale-save flows.
- npm.cmd run test:auth-e2e:18 passed, six each viewport; login, MFA, logout,
  anonymous redirects, Staff restrictions and unavailable email reset UI.
- npm.cmd run test:e2e:222 public bilingual navigation/accessibility cases passed.
- Browser total258; final reports: zero unexpected/skipped/flaky cases, retries0.
- node --env-file=.env.local --env-file=.env.cms.local --env-file=.env.auth.local
  scripts/check-public-bundle.mjs:26 browser assets passed, no loaded private
  URL/password or auth secret found.
- Final read-only test DB check:28 public and9 auth tables empty after fixture
  cleanup; CMS/auth privilege protection verified. Private envs/reports ignored.
- git diff --check: passed. Source/lock/component-license diffs reviewed.
- npm.cmd audit --json: exit1, existing9 affected-package entries (5 high/4 moderate).
- npm.cmd audit --omit=dev --json: exit1, existing4 moderate optional-peer entries.
  Reports retained privately in test-results/shadcn-audit.json and
  test-results/shadcn-production-audit.json; no force fix/downgrade/waiver.
- Full catalog/media DB regression, published-only standalone E2E, Lighthouse,
  staging and production checks were not rerun for this UI subphase. Public
  about-page publication is covered in the CMS browser flow in both locales.

Visual review: screenshots of desktop login/page cards and mobile dashboard were
inspected. Test runners retain login/dashboard/pages/editor captures under their
viewport-specific ignored output directories. They contain synthetic QA data,
not production restaurant content; traces can include synthetic credentials and
must not be published.

Initial failures corrected before final acceptance: one JSX closing tag during
rich-editor conversion; semantic theme utilities missing from a separate Tailwind
compilation; visible/accessibility label mismatch; focus restoration for custom
dialog/drawer triggers; nonmodal account-menu landmark; one test locator matching
both breadcrumb and sidebar. No Axe rule was disabled and no test was skipped.

Security/SEO: server authentication/RBAC, Origin/CSRF, session expiry and revision
hash/version checks are unchanged. Shell identity is only trusted server name/role,
never session token or database credentials. Dashboard counts use existing CMS
reads, with an explicit unavailable state instead of fabricated values. Staff
navigation omits Owner security and API restrictions still apply. Admin variables/
legacy resets are scoped to .admin-root; public rendering tests passed. CMS/public
preview noindex remains; no analytics dashboard or business schema is added.

Rollback: revert this UI commit, restore matching manifest/lockfile, install that
lockfile and rebuild. Keep private envs, accounts, content and SQL history; no schema
rollback is required. Existing dependency advisories still block release readiness.
No merge, deployment, live merchant or real email operation was performed.

## Revision list/detail shadcn refinement — 2026-10-17 (ADR-029)

Approved branch fix/cms-revision-ui starts from merged main 831ac0f. Modified:
admin/pages/[pageKey]/page.jsx and [revisionId]/page.jsx; PageEditor,
RichTextEditor, RevisionActions and new shared RevisionStatus; scoped admin.css;
CMS browser acceptance tests; decisions and this QA record. Existing shadcn
packages/components are reused. No package, backend, schema or migration changes.

Acceptance: desktop table/mobile cards show version, creation time (WIB), readable
status and live pointer. Forms separate main/additional content, SEO and applicable
CTA fields. Short/title inputs, summary textareas, helpers, character counts and
per-language pending indicators are present. Rich editing retains marks, internal
links, numbered lists, item removal and block ordering with simpler Card grouping.
Saving Indonesia preserves pending English edits; actions remain disabled until
both languages are saved. Existing review/frozen/live/version rules still apply.

Commands actually executed and their final outcomes:

- npm.cmd run lint: passed, zero warnings.
- npm.cmd run build: passed after the final dropdown height adjustment.
- node --conditions=react-server --test tests/unit/*.test.mjs:111 passed.
- npm.cmd run test:cms-pages-db:9 passed, including anonymous/Staff denials,
  actual idle expiry, immutable live content and simultaneous-save conflicts.
- npm.cmd run test:cms-pages-e2e:18 passed; six each desktop1440/mobile390/small320.
  Added grouped Input/Textarea checks, unsaved bilingual preservation, ordered list
  editing/reordering, literal escaped preview with bold/internal link, revision-list
  navigation/date rendering, Axe and overflow checks. Existing publication/clone,
  forged permissions and two-tab conflicts remain covered. Final report has zero
  unexpected, skipped or flaky cases; retries0. Fixtures cleaned successfully.
- npm.cmd run test:auth-e2e:18 passed; six each viewport, including login/MFA/logout,
  anonymous redirect and Staff restrictions. Fixture cleanup assertions passed.
- node --env-file=.env.local --env-file=.env.cms.local --env-file=.env.auth.local
  scripts/check-public-bundle.mjs:26 assets passed; no loaded private database
  URL/password or auth secret present in browser assets.
- git diff --check: passed; final source/test/documentation diffs reviewed.

Initial browser run passed desktop but failed one mobile Axe check during the
AlertDialog exit animation. The test now waits for the closed dialog to unmount
before scanning the page; no accessibility rule was disabled. All18 CMS cases
were rerun successfully. Visual review also found legacy select padding clipping
text; scoped select sizing was corrected before the final build/browser run.
Desktop and mobile revision/editor screenshots were inspected. Artifacts remain
ignored under test-results; traces can contain synthetic credentials.

Security/SEO: no server RBAC, Origin/CSRF, session or approval/hash changes. Public
content remains published-only and admin stays noindex. No dependency install or
fresh audit ran; ADR-028's existing9 advisory entries (5high/4moderate, production
omit-dev4moderate) remain unresolved release blockers. Public222-case regression,
full catalog/media integration, Lighthouse, staging and production were not rerun
for this scoped admin change. Bilingual public about publication is covered by CMS
browser tests. No release readiness, merge or deployment is claimed.

Rollback: revert this UI commit and rebuild; preserve private envs, account/content
data and SQL history. No database or dependency rollback is required.

### Approved spacing follow-up (ADR-029)

Modified PageEditor, RichTextEditor, RevisionActions and admin.css to give labels
12px clearance from controls, fields24px separation, and action rows12px gaps with
wrapping. Text-part addition and list-item removal share a row; block actions stay
in the Card footer. All controls reuse existing shadcn; no dependencies changed.

Actual verification:

- npm.cmd run lint: passed, zero warnings.
- npm.cmd run build: passed.
- node --conditions=react-server --test tests/unit/*.test.mjs:111 passed.
- npm.cmd run test:cms-pages-db:9 passed.
- npm.cmd run test:cms-pages-e2e:18 passed across desktop1440/mobile390/small320;
  zero unexpected/skipped/flaky cases, retries0. Existing Axe, workflow, permissions,
  bilingual-save and conflict coverage passed. Added real bounding-box checks for
  label/control clearance and horizontal/vertical gaps between adjacent buttons.
  Desktop/mobile list-spacing screenshots were inspected. Test fixture cleanup
  and protection assertions completed successfully.
- git diff --check: passed; source/test/documentation diffs reviewed.

Security and SEO behavior is unchanged; all new CSS rules are scoped to admin.
Auth-only/public suites, fresh dependency audit, Lighthouse and staging/production
were not rerun for this spacing-only follow-up. Previously documented dependency
advisories remain unresolved. Rollback: revert this follow-up commit and rebuild;
preserve private configuration and content. No merge/deployment was performed.

## Phase3.3 catalog CMS and preview acceptance — 2026-10-17 (ADR-030)

Approved branch feat/phase3-3-cms-catalog starts from main2b8b4cb (merged PR8).
Files: catalog admin/API routes; CMS catalog service/HTTP adapter/shared runtime;
catalog editor/forms/actions/preview and synthetic fixtures/browser runner/config;
PagePreview/PageEditor; navigation/header/dashboard; scoped admin CSS; schema audit
check; forward0009 SQL/snapshot/journal; migration manifests/runners/CMS verifier;
migration unit and existing history assertions; package scripts and documentation.
No dependency version, lockfile, old SQL, auth policy or public component changes.

Implemented acceptance:

- Staff creates/clones drafts and edits localized category/product/variant/group/
  option content, placement, sort, integer prices and selection constraints.
- Server rechecks database membership; exact input/body/route scope and versions
  are enforced. Draft writer/audit operations are atomic. Concurrent draft writes
  yield one winner and one safe conflict with no losing audit/version consumption.
- Owner-only exact-hash approve/reject/publish/archive; frozen changes denied,
  cloning clears approval, and live catalog persists until approved replacement.
- Independent forms retain pending text across other saves and preview toggles.
  Readiness/actions wait until all forms save. Existing-field overlays appear in
  draft preview; new identities appear after successful creation.
- shadcn cards show localized content, variant/modifier simulation and validated
  total; invalid choices produce no numeric total. Literal script-like text is
  escaped. Image placeholders and unverified merchant-price status are explicit.
- Page previews group headline/content/SEO in responsive Cards. Label/control
  and action spacing from PR8 remains. Admin/public previews stay noindex.

Commands actually executed and final outcomes:

- npm.cmd run lint: passed, zero warnings (including final migration runner).
- npm.cmd run build: passed; admin/catalog and three catalog API routes included.
- node --conditions=react-server --test tests/unit/*.test.mjs:111 passed.
  Local report: test-results/phase3-3-unit.tap.
- npm.cmd run test:cms-catalog-db:9 passed before the full regression.
- node --conditions=react-server --env-file=.env.local
  --env-file=.env.test-migrator.local --env-file=.env.test.local
  --env-file=.env.cms.local --test --test-concurrency=1 tests/integration/*.test.mjs:
  173 passed, including the9 focused catalog cases; no double-counting. Includes
  auth, media, pages, catalog/publication, pricing/modifiers, grants and published
  readers. Only the connection tests read dev metadata; mutations use test only.
  Local report: test-results/phase3-3-integration.tap.
- npm.cmd run test:cms-catalog-e2e:12 passed (4 per viewport).
- npm.cmd run test:cms-pages-e2e:18 passed (6 per viewport).
- npm.cmd run test:auth-e2e:18 passed (6 per viewport).
- npm.cmd run test:e2e:222 public bilingual cases passed.
- Browser total270, desktop1440/mobile390/small320. Final JSON reports contain zero
  unexpected/skipped/flaky cases, retries0. No application acceptance test failed.
- node --env-file=.env.local --env-file=.env.cms.local --env-file=.env.auth.local
  scripts/check-public-bundle.mjs:28 assets passed; no loaded database URL/password
  or auth secret in browser output.
- npm.cmd run db:migrate:test: applied0009 atomically, then repeated as no-op.
- npm.cmd run db:migrate:dev: applied0009 after browser QA, then repeated as no-op.
  Dev content was locked and every public table's row count matched before/after.
  Existing credentials/accounts/content and old migration history were preserved.
- Read-only final checks:10 reviewed migrations and exact CMS privilege isolation
  in both databases;28 public and9 auth test tables empty after fixture cleanup.
- npm.cmd audit --json: existing9 affected-package entries (5high/4moderate).
- npm.cmd audit --omit=dev --json: existing4moderate optional-peer entries.
  Private reports: test-results/phase3-3-audit.json and production-audit.json.
  PowerShell initially encoded redirection as UTF-16; report parsing was corrected
  to UTF-8. No dependency fix, omission, downgrade or waiver was applied.
- git diff --check: passed; final source/schema/privilege/test/doc diffs reviewed.
- Staged diff secret scan, snapshot-only audit-check comparison and staged SQL
  hash verification passed before commit; no private configuration was staged.

Visual review: desktop/mobile catalog preview screenshots inspected; synthetic
content demonstrates variant25000 + modifier5000 =30000 IDR. These are test values,
not restaurant facts. Reports/traces remain ignored and must not be published;
traces can contain synthetic credentials. QA server children get application/test
CMS credentials only, never migrator/admin access.

Remaining limits: physical media upload/serving, scheduling, deletion UI, live
merchant verification/sync, real email and production configuration are deferred.
Dependency advisories still block release readiness. Lighthouse, staging and
production checks were not run. No merge, deployment or merchant call performed.

Rollback application/UI files and rebuild while retaining0009 SQL/metadata,
migration manifests/verifiers, applied history, private configuration and content.
Do not blindly revert/remove the applied migration. Restoring the prior grants
requires a separately inspected approved reverse migration.

## Home content and visual identity acceptance — 2026-10-17 (ADR-031)

Approved branch feat/home-content-brand starts from main7e494a8, after merged
Phase3.3. Scope: editorial home preset/fill helper; CMS load/preview; shared safe
public rich text; published home shadcn composition/theme; header/footer/CMS mark
and favicon; generated illustration; tests and asset/decision/usage documentation.
No dependency, migration, auth/API policy or local business-data mutation.

Read-only local inspection found empty home drafts, no catalog products/media,
and no authentic photographs/original logo in the repo. Text uses only approved
facts: Tiny Osaka, Japanese street food, delivery-only, Bandung, Indonesia.
No price/ingredient/promotion/address/hour/merchant URL was fabricated. The
original built-in imagegen illustration is visibly labeled in ID/EN and has alt
text, width/height, responsive sizes and next/image optimized delivery. The SVG
lantern mark is original code artwork; favicon/header/footer/CMS use one design.
Provenance and image SHA256: BRAND_ASSETS.md.

Acceptance: preset fills blank fields in both languages without overwriting
existing text. Save/review/Owner publication uses the existing versioned API;
loading never writes or publishes automatically. Both dirty languages must save
before review. Home preview supports empty fields, displays illustration and SEO,
and preserves unsaved/current content. Public home reads only published fields/
catalog; missing home publication never falls back to the editorial preset.
Published SSR, text escaping/internal links, noindex and empty/404 states remain.

Commands actually executed and final outcomes:

- npm.cmd run lint: passed, zero warnings.
- npm.cmd run build: passed on final home/preview code.
- node --conditions=react-server --test tests/unit/*.test.mjs:113 passed.
  The2 home tests were rerun successfully after correcting single-line titles.
- npm.cmd run test:cms-pages-db:9 passed.
- npm.cmd run test:public-db:1 passed; related integration total10.
- npm.cmd run test:cms-pages-e2e:18 passed,6 per viewport. Covers blank Home preview,
  explicit load, preservation of existing title, both-language dirty/save, natural
  image load, illustration caption, actual ID/EN design preview and no draft leak.
- npm.cmd run test:published-e2e:72 published +6 empty cases passed. Includes new
  home SSR/illustration/CTA/favicon checks and WebP640px response under300000 bytes.
- npm.cmd run test:auth-e2e:18 passed,6 per viewport.
- npm.cmd run test:e2e:222 public fixture navigation/accessibility cases passed.
- Final browser total336; desktop1440/mobile390/small320, zero skipped/unexpected/
  flaky cases and retries0 in final JSON reports. Repeated runs are not added.
- node --env-file=.env.local --env-file=.env.cms.local --env-file=.env.auth.local
  scripts/check-public-bundle.mjs:29 assets passed, no loaded private database
  URL/password or auth secret in browser output.
- Read-only test cleanup/protection check:28 public and9 auth tables empty;
  CMS grants/guards intact. No local dev content was inserted or published.
- SVG comparison passed after normalizing Windows CRLF/LF; favicon/mark match.
- git diff --check: passed; final code/asset/diff review completed.
- Staged diff secret scan, generated-image SHA256 and scoped-file checks passed;
  no private environment, trace, lockfile or migration change was staged.

Initial failure corrected: the first Home browser test found newline characters
in editorial titles incompatible with single-line Input display. Titles were
changed to normal sentences; responsive heading wrapping remains code-owned.
Focused home unit tests, build and all CMS viewport cases were rerun. Blank-draft
fallback labels and unstyled rich-text links were checked in the final build.
Desktop/mobile Home preview screenshots were inspected; ignored traces can
contain synthetic credentials and must not be published.

Security/SEO: no Owner impersonation, RBAC/session/CSRF bypass, automatic approval,
new structured data or indexing change. No new package/install or fresh audit;
previous ADR-030 dependency findings remain unresolved release blockers. Physical
media uploads, authentic photos, verified merchant links, Lighthouse, staging and
production are not claimed. No merge, deployment or merchant call performed.

Rollback this application/asset commit together and rebuild; retain CMS revisions,
private configuration and SQL history. Saved preset content is an ordinary CMS
revision and follows normal review/publication; never delete live data to undo UI.
## Phase 3.4 media library and original branding — 2026-10-17

Approved implementation on `feat/phase3-4-cms-media`. Changes cover private local
uploads, bounded full-file inspection, library/picker shadcn forms, bilingual
revision references, public delivery restricted to live approved references,
streamed byte ranges, and original-logo display derivatives. Original source
assets are untouched. Upload is not publication; Staff cannot approve or publish.

Executed successfully on the final relevant code:

- `npm.cmd run lint`: zero warnings/errors.
- `npm.cmd run build`: production build passed, including media and PNG icon routes.
- `node --conditions=react-server --test tests/unit/*.test.mjs`: 116 passed.
- `node --conditions=react-server --env-file=.env.local --env-file=.env.test-migrator.local --env-file=.env.test.local --env-file=.env.cms.local --test --test-concurrency=1 tests/integration/*.test.mjs`: 179 passed.
- `npm.cmd run test:cms-media-e2e`: 6 passed across 1440/390/320px.
- `npm.cmd run test:cms-pages-e2e`: 18 passed.
- `npm.cmd run test:cms-catalog-e2e`: 12 passed.
- `npm.cmd run test:auth-e2e`: 18 passed.
- `npm.cmd run test:published-e2e`: 72 published + 6 empty-database cases passed.
- `npm.cmd run test:e2e`: 222 fixture public cases passed.
- Browser totals: 354 expected, zero unexpected/flaky/skipped cases, retries zero.
- Local test/dev reviewed migrations 0010/0011 applied; repeat runs were no-ops.
  Dev runner verified unchanged public content counts under locks. Existing SQL
  history is preserved; final history is 12 entries, with 28 public/9 auth tables.
- Final public-bundle secret scan passed: 31 assets, no loaded database URLs,
  passwords or auth secret. Staged diff/asset integrity checks passed.
- `npm.cmd audit --json`: 9 advisories (5 high, 4 moderate), retained as release
  blockers. No unrelated dependency upgrade or audit-fix command was applied.
- Media prerequisite check: Sharp 0.35.5; video configuration and executables
  unavailable. Actual FFmpeg/ffprobe decoding/playback was NOT exercised.

New tests cover corrupt/unsupported/oversize image input, full decoding, MIME
mismatch, path rejection, checksums and original byte preservation, bounded
single ranges, anonymous/foreign-origin denials, private previews, no key/checksum
in browser DTOs, frozen/stale revisions, catalog product scope, poster publication,
Staff denial of Owner actions, live-reference revocation and ambiguous commit
acknowledgement. That last case retains possibly committed original bytes.
QA fixtures and physical test files are cleaned by exact tracked identities.
Screenshots were inspected for the new media library and logo presentation.

Initial failures were corrected before final verification: a misplaced client
directive, an anonymous-export lint warning, stale history-count assertions and
missing dev env in the first full test invocation, test action payload shape,
separate route pools exhausting the CMS connection limit, and a redundant poster
FOR SHARE lock requiring UPDATE privilege. Forward migration 0011 fixes that
lock without granting asset UPDATE/DELETE or rewriting applied migration 0010.

No live merchant calls, real email, automatic content publication, production
migration, staging QA, Lighthouse or deployment was performed. Native video upload
remains disabled until trusted operator-installed tools are configured and tested.
Images are original bytes, not responsive recompressions; performance of large
real uploads still needs release QA. Local disk persistence/backups and possible
crash/ambiguous-commit orphans require the operational care in OPERATIONS.md.
Current noindex, server RBAC, session limits and publication rules are preserved.

Rollback application/UI changes and rebuild while preserving `.media`, private
configuration, content and applied 0010/0011 SQL, journal/snapshots, manifests and
protection verifiers. Do not delete applied migrations or revert the entire Git
change blindly. Any database privilege reversal requires a separately reviewed
forward migration. Merge/deployment still require separate authorization.

## Phase 3.5 scheduled publishing — local QA (2026-10-17)

Branch `feat/phase3-5-scheduled-publishing`, based on the Phase 3.4 media branch
while PR12 remains open. The new PR must target that branch, then be retargeted
to main after the prerequisite merges. No merge or deployment is performed.

Executed successfully:

- `npm run lint` and `npm run build` (Next.js 16.4.1).
- `node --conditions=react-server --test tests/unit/*.test.mjs`: 118 passed.
- `node --conditions=react-server --env-file=.env.local
  --env-file=.env.test-migrator.local --env-file=.env.test.local
  --env-file=.env.cms.local --test --test-concurrency=1
  tests/integration/*.test.mjs`: 191 passed, zero failed/skipped.
- `npm run test:publishing-e2e`: 12 passed across desktop, 390px and 320px,
  with axe accessibility, overflow checks and inspected queue screenshots.
- `npm run test:e2e`: 222 public fixture cases passed.
- `npm run test:cms-pages-e2e`: 18 passed; `npm run test:cms-catalog-e2e`:
  12 passed; `npm run test:cms-media-e2e`: 6 passed; `npm run test:auth-e2e`:
  18 passed. The equivalent direct Node runner commands loaded the same explicit
  isolated environment files.
- `npm run test:published-e2e` (equivalent direct Node runner): 72 published
  content cases and 6 empty-database cases passed on the repeated full run.
- `npm run db:migrate:test` and `npm run db:migrate:dev`: reviewed 0012/0013
  applied locally; repeat invocations made no changes. Dev content counts were
  preserved under locks. Final history: 14 entries, 30 public and 9 auth tables.
- `node --env-file=.env.local --env-file=.env.auth.local
  --env-file=.env.cms.local --env-file=.env.test.local
  scripts/check-public-bundle.mjs`: 32 public assets scanned; no loaded database
  URL/password or auth secret found.
- `npm audit --json`: 9 existing advisories, 5 high and 4 moderate. These remain
  release blockers; no dependency upgrade/audit-fix was included.

New integration coverage uses real synthetic authenticated Owner/Staff accounts
and isolated CMS connections: anonymous/Staff/forged-role denial, exact approved
version/hash, malformed/past/out-of-range times, duplicate targets, optimistic
cancellation/audit, future-job denial, due page/catalog publication, manual and
archive cancellation, disabled Owner, changed live baseline, rollback/retry and
third-attempt failure, immutable job/audit denials, and two concurrent workers
publishing only once. Retry fault injection is confined to a rolled-back test
owner transaction; no development worker is started. Browser cases cover both
page/catalog forms, queue/history, revision links, cancellation and CSRF.

Initial QA findings were corrected: a membership FOR SHARE read needed forbidden
auth UPDATE permission (removed the lock; grants stayed read-only), three new
foreign keys needed ON UPDATE RESTRICT (forward migration0013), a test assumed
created_at order inside one transaction, raw SQL timestamps needed Date parsing,
and shadcn card titles needed semantic headings. No prior applied SQL was edited.
The first sandboxed build could not read private .env.local; the verified build
was rerun with authorized local access. A legacy CMS browser case hit its 30s
timeout during concurrent suites; the full CMS suite passed when rerun sequentially.
One published-content navigation initially failed with Chromium ERR_NO_BUFFER_SPACE;
the repeated full suite passed all 78 cases without changing its configuration.
Final queue review also prioritizes
all active jobs ahead of capped history and serializes timestamps as ISO UTC before
sending them to browsers; the focused integration rerun passed all 12 cases.
The final shadcn scheduling browser rerun passed all 12 cases on the final build.
Final browser total: 366 passed across the seven suites, with retries disabled.

Security/SEO: Owner identity and enabled membership are checked server-side;
exact Origin, JSON body limits and strict input fields are enforced. Public
read grants, existing sessions and approval/hash/media rules remain intact.
Admin queue inherits noindex; scheduled content does not enter public pages or
SEO outputs before the atomic approved publication. No Restaurant schema added.

Not executed: staging QA, Lighthouse/CWV, production migration/deployment,
Railway linking/cloud operations, live merchant calls, real email, FFmpeg/video
execution, real development content publication or background-service setup.
Worker supervision and external alert delivery remain operational follow-ups.
Pending jobs require an explicitly started worker. Rollback instructions:
PHASE3_PLAN.md and OPERATIONS.md; stop worker, restore application, retain all
applied migrations/history, jobs/events, content, media and private configuration.

## ADR-034 / ADR-035 combined local verification (2026-10-17)

The user approved combining the Indonesian-only/simple-form work with the other
session's Owner approval change, and confirmed that session had finished editing
and QA before this combined run. No dependency, migration, real development
content mutation, deployment or cloud operation was performed.

Executed checks on the combined branch:

- `npm run lint`: passed.
- `$env:QA_NEXT_DIST_DIR = '.next-qa'; npm run build`: passed. The isolated output
  avoids overwriting the user's running `.next` development server. The accepted
  override is restricted to `.next-qa`; ordinary builds keep `.next`.
- `node --conditions=react-server --test tests/unit/*.test.mjs`: 118 passed.
- `node --conditions=react-server --env-file=.env.local
  --env-file=.env.test-migrator.local --env-file=.env.test.local
  --env-file=.env.cms.local --test --test-concurrency=1
  tests/integration/*.test.mjs`: 202 passed, zero failures/skips.
- With `QA_NEXT_DIST_DIR=.next-qa`, `npx playwright test --reporter=line
  --output=test-results/indonesian-public-artifacts`: 132 passed.
- With the same isolated build, sequential `npm run test:cms-pages-e2e`:
  12 passed; `test:cms-catalog-e2e`: 9 passed; `test:cms-media-e2e`: 6 passed;
  `test:publishing-e2e`: 12 passed; `test:auth-e2e`: 18 passed;
  `test:published-e2e`: 36 published-content and 3 empty-database cases passed.
  Total: 228 distinct browser cases, retries disabled.
- `node --env-file=.env.local --env-file=.env.auth.local
  --env-file=.env.cms.local --env-file=.env.test.local
  scripts/check-public-bundle.mjs` with the same QA output: 32 assets scanned,
  no loaded database URL/password or auth secret found.
- Staged-diff checks reject private environment/original-assets paths and search
  for loaded secret values; the initial staged set passed. `git diff --check`
  passed after removing three whitespace-only lines.
- `npm audit --json`: 9 existing advisories (5 high, 4 moderate, 0 critical).
  Dependencies and lockfile were not changed; these remain release blockers.

Coverage includes single-save page/catalog creation, automatic standard price,
Indonesian-only readiness, exact approval/hash, Staff/anonymous/forged input
denial, concurrent approval, optimistic conflicts and preservation of typed
input. A late failed batch rolls back earlier writes, identities, versions and
audits. Owner approval publishes immediately or schedules atomically; a failed
schedule retains the existing live revision. Public checks cover permanent
English-address redirects, server-rendered content, metadata, safe literal rich
text, consent-gated embeds, immutable media bytes/revocation, axe, keyboard and
desktop/390px/320px overflow. Desktop and 320px preview screenshots were inspected.

Final media review found that a changed attachment with no selected asset could
be omitted from Save all. Changed rows now reach validation instead of being
silently discarded. Lint/build and the bundle scan were repeated successfully;
the media suite passed all 6 cases again after adding a regression that checks
failure feedback, preserved input, unchanged root version and no persisted media
reference, followed by a successful save with a selected file. Desktop and 320px
screenshots of the actual simplified form/error row were also inspected.

Earlier attempts are not counted as final passes: an old media browser selector
still requested an English alt field; it was updated to the approved form. A
default build was overwritten while another session/dev process was active, so
QA output was isolated. A test fixture lock timeout while the other session was
running was resolved by waiting for its completion. The public suite completed
all cases but stalled during Windows server cleanup; only its verified local QA
server on port 3030 was terminated, after rechecking the process identity. The
runner then exited 0 with 132 passes. An initial automatic review rejected an
unverified process-tree termination; identity verification satisfied the next
review. The user's development server was retained.

Security/SEO: membership, sessions, Origin/CSRF, immutable revisions and exact
approval receipts remain enforced. Saving never publishes or syncs merchants.
Legacy English rows/hash inputs remain unchanged; new public reads and authoring
use Indonesian. `/en` redirects to `/id`; admin/public preview noindex is retained,
and no Restaurant/LocalBusiness schema is added.

Not executed: staging QA, Lighthouse/CWV rerun, production migration/deployment,
Railway operations, real email, live merchant calls, actual dev publication or
persistent publication worker setup. Local test data uses isolated synthetic
accounts/content and runner cleanup; original assets/private configuration are
excluded from Git.

Rollback must follow ADR-034/035 together: keep app and worker versions aligned,
pause the worker and preserve all content, media, receipts, jobs and history.
Older bilingual readiness cannot approve newly created Indonesian-only snapshots;
use an approved compatible forward fix or replacement before reverting an active
publication. Do not edit frozen snapshots or delete English history.

## ADR-036 direct page editing (2026-10-17)

Approved scope: stable page table/editor, one immediate Save for enabled Owner
and Staff, no page editorial workflow UI, no scheduling UI/API/worker CLI.
Catalog review and Owner approval are retained. Original assets, private
configuration, immutable snapshots, receipts, hashes and SQL/history are retained;
no dependency, migration, cloud or actual development content write is included.

Executed local verification:

- `npm run lint`: passed.
- `$env:QA_NEXT_DIST_DIR='.next-qa'; npm run build`: passed on the isolated
  production QA output. No running development build was replaced.
- `node --conditions=react-server --test tests/unit/*.test.mjs`: 118 passed.
- `node --conditions=react-server --env-file=.env.local
  --env-file=.env.test-migrator.local --env-file=.env.test.local
  --env-file=.env.cms.local --test --test-concurrency=1
  tests/integration/*.test.mjs`: 211 passed, zero failures/skips on the initial
  complete run. The first focused current-pages run passed 7 cases before adding
  cancellation/disabled-member coverage and replacement-save concurrency checks.
- Sequential `npm run test:cms-pages-e2e`: 12 passed; `test:cms-media-e2e`:
  6 passed; `test:cms-catalog-e2e`: 9 passed; `test:publishing-e2e`: 9 retired
  scheduling denial/redirect cases passed; `test:auth-e2e`: 18 passed;
  `test:published-e2e`: 36 published-content and 3 empty-database cases passed.
  These 93 distinct browser cases ran with retries disabled and the isolated
  QA build, on desktop/390px/320px. Desktop page table and 320px direct editor
  screenshots were inspected.
- `node --conditions=react-server scripts/publication-worker.mjs --once`:
  expected exit1 and the retirement message, with no database connection.
- A read-only CMS-role query of local dev scheduled-job counts returned no rows.
  No real content or job was changed by verification.
- `npm audit --json`: exit1 for 9 existing advisories (5 high, 4 moderate,
  0 critical). No dependency/lockfile edits or audit-fix were performed. These
  remain release blockers.

Integration/browser coverage verifies that opening an empty editor does not
create a draft or audit; Staff and Owner save directly to the public reader;
all receipts use the real actor; prior content remains immutable; initial and
replacement-save races each have one winner; stale saves and late media failures
leave the pointer, versions, audits and snapshots unchanged. Required errors and
conflict messages preserve typed fields. Disabled database membership overrides
a forged resolver role. Anonymous/CSRF/forged command/schedule attempts fail.
Saving cancels a superseded page job and retains its audit/history. Media tests
cover original bytes, invalid attachments, immediate public visibility and
revocation by Staff Save. Stable editor links and old revision/queue redirects,
table timestamps, axe and overflow are checked.

Browser QA exposed a pg warning when the table issued simultaneous queries on
one transaction connection. The list now awaits those reads sequentially;
legacy unpublished timestamps also use their latest audit event.

Final source regression after that fix (2026-10-17, same staged source):

- `npm run lint`: exit 0.
- `$env:QA_NEXT_DIST_DIR='.next-qa'; npm run build`: exit 0.
- Unit suite: 118 passed, 0 failed/skipped.
- Integration suite (same command as above, `--test-concurrency=1`): 211
  passed, 0 failed/cancelled/skipped.
- Sequential browser suites with `QA_NEXT_DIST_DIR=.next-qa`, retries 0, on
  desktop/390px/320px: cms-pages 12, cms-media 6, cms-catalog 9, publishing 9,
  auth 18, published 36 + 3 empty-database; 93 passed, every runner exit 0
  with its synthetic records cleaned. No pg concurrent-query warning appeared
  in the captured logs.
- `npm audit` was not rerun; the 9 existing advisories above remain blockers.

Security/SEO: the approved permission change is website page publication by
enabled Staff as well as Owner. The server never impersonates an Owner; catalog,
merchant/account rights and database grants remain unchanged. Whole-page saves
validate the fixed template, rich text and media before an atomic pointer change,
then invalidate the public layout. Session/CSRF/no-store/noindex policies remain;
English output and Restaurant/LocalBusiness schema are not introduced.

Not executed: staging QA, Lighthouse/CWV rerun, production deployment/migration,
Railway operations, real email, live merchant calls or actual dev publication.
There is no persistent worker/service setup. Rollback: ADR-036; restore PR15 app
and UI together, retain all data/media/history and keep the worker stopped until
old pending jobs are inspected. An application revert does not restore previous
page text automatically; use a separately approved content replacement.

## Penghapusan kode bahasa (2026-10-18)

Lingkup: kode, API, UI, test, dan dokumen; tanpa migrasi dan tanpa perubahan hash. Kontrak baru ada di
`docs/DATA_CONTRACTS.md` bagian "Kontrak satu bahasa".

- Hash: daftar kolom hash katalog/halaman/media tidak diubah. Test golden `tests/unit/legacy-hash-golden.test.mjs`
  mengunci hash graf dengan baris `en` dan teks alt/caption Inggris; integrasi (`pages`, `media`, `publication`)
  membuktikan snapshot beku dengan baris/kolom Inggris tetap lolos hash, diabaikan validasi, tidak dikeluarkan
  API/publik, dan tidak disalin ke draft hasil klon.
- Keamanan: RBAC tidak berubah; permukaan input berkurang (`locale`, `altEn`, `captionEn` ditolak 400 oleh
  `exactInput`); Staff tetap tidak dapat publish/approve di jalur katalog/halaman yang ada.
- SEO: `<html lang="id">`, `noindex, nofollow`, tanpa hreflang, tanpa `Restaurant`/`LocalBusiness`; `/id` dan `/en`
  tetap 404 (`tests/e2e/navigation.spec.js`).
- Rollback: revert perubahan kode/test/dokumen; tidak ada perubahan data atau skema.
