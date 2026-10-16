# Security, Privacy & Quality Gates

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
1. Unit: currency, modifier minimum/maximum, locale fallback, URL allowlist, revision approval invariant.
2. Integration: auth/session expiry, server RBAC, draft/approval/publication boundaries, scheduled publish, sync default-OFF, per-platform failures/idempotency.
3. Playwright: ID+EN public navigation, mobile CTA, admin login and role restriction, draft/review/approve/publish/archive, 404/unpublished behavior, UTM/GA4 mocked, media preview.
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

- All 24 public locale routes: server content, localized metadata/lang, H1,
  noindex, internal links and anchors, root redirect and invalid-route 404.
- Homepage/menu/detail journeys, explicit unavailable merchant links, promo
  navbar, footer guides, breadcrumbs and cross-page ordering anchor.
- Locale switching in both directions on every public path, including details.
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
