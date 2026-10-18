# Phase 2: current status and original data design

> Catatan 2026-10-18 (ADR-034/038 dan penghapusan kode bahasa): rencana ini historis. Istilah bilingual, ID/EN, `locale`, `/id`, dan `/en` di bawah tidak berlaku lagi; situs satu bahasa Indonesia tanpa prefix URL (kontrak terbaru: docs/DATA_CONTRACTS.md bagian "Kontrak satu bahasa").

Current status (2026-10-16, ADR-024): all five approved functional groups are
complete. Public routes use published data by default; explicit local fixture
preview remains available. QA: 104 unit, 143 integration, 300 E2E, lint/build.
Mobile Lighthouse Performance: home99/menu98/product90, accessibility100 and best
practices100; SEO60 due to intentional noindex. See SECURITY_AND_QA.md for actual
commands, reports and open release gates. Both local databases are empty with
reviewed migrations0000-0006. Auth/editor/physical media serving stay in Phase3.
Existing development dependency findings remain open; this is not release approval.

## Original Phase 2A catalog and content design (historical)

Status: approved documentation scope on 2026-10-15. This records the selected
direction, not an implemented schema or permission to install or migrate.
See ADR-006 and the Phase 2 contracts in DATA_CONTRACTS.md.

Follow-up implementation status: ADR-007 authorizes and records the package and
local configuration foundation. Its explicit scope supersedes the original 2A
documentation-only boundary below. ADR-008 subsequently provisioned separate
local application LOGIN roles and private env files. Four read-only integration
tests passed, including actual PostgreSQL denial of cross-database access.
ADR-009 adds the seven-table draft schema and generated SQL/metadata files.
ADR-010 subsequently applies the foundation to the isolated local TEST database
and verifies its constraints. Development is still unmigrated; public read-path
integration, prices/modifiers and revision approval/publication remain pending.

## Baseline and outcome

Phase 1 serves clearly labeled ID/EN fixtures. Local PostgreSQL 18.6 has empty
UTF-8 databases `tiny_osaka_dev` and `tiny_osaka_test`, owned respectively by
`tiny_osaka_dev_owner` and `tiny_osaka_test_owner`. Both owners are NOLOGIN and
have no superuser, database/role creation, replication or bypass-RLS privileges.
Database privileges for PUBLIC were revoked. PostgreSQL listens on loopback.
These are local setup observations, not a production provisioning recipe.

Select Drizzle ORM 0.45.4, Drizzle Kit 0.31.11 and node-postgres (`pg`) 8.23.1
for the next implementation proposal. Keep application schema/config in JS/MJS.
Validate this pinned combination before adopting generated migrations. No
dependency, schema, credential, migration or public route changes occur in 2A.

## Catalog design

Use stable category/product identities plus immutable catalog revisions. A
revision contains its own categories, products, translations, variants,
modifier groups/options, media references and verified ordering links. Editing
a shared child row must never change an approved or published revision.

The published catalog pointer identifies one approved immutable revision.
Approval records bind to the exact revision and content hash. Changes create a
new draft revision with no inherited approval; the live pointer stays unchanged.
Publish replaces the pointer atomically after checking that revision's approval.
Use optimistic concurrency for draft edits and transactions for review/publish
transitions. Referenced media cannot be overwritten or deleted while live.

Store amounts as integer IDR, with explicit bounds and safe arithmetic. A
selected variant supplies the base amount; selected modifiers add their deltas.
Reject invalid selections before calculating a total. Variant behavior, negative
deltas, repeatable options and exact limits need business confirmation; do not
invent production rules. No numeric stock, checkout or order tables.

## Fixed content and localization

Use stable page identities and immutable page revisions for existing homepage,
about, guides, promos/events and location templates. Template keys/allowed fields
stay in code; editor content cannot change brand tokens or inject HTML/scripts.
Keep ID and EN fields in the same reviewed revision. Require verified localized
fields for the locales being published; missing data must not silently become
fabricated text or an unmarked language fallback. Product/category slugs remain
stable across languages, consistent with the existing route design.

Public server reads resolve published pointers only, never the newest draft.
Unknown, unpublished or invalid-locale details return 404. Existing fixture
routes remain intact until a separately approved read-path replacement. Empty
DB handling and preview behavior must be explicitly tested before that switch.

## Security boundaries and deferred work

- Phase 3 chooses auth and implements Owner/Staff server-side enforcement:
  Staff draft/submit; Owner approve/reject/publish/schedule/archive. Do not invent
  an auth user table now that may conflict with the selected auth library.
- Schedule in Asia/Jakarta, persist instants consistently, and publish only the
  exact approved revision with atomic, idempotent transitions.
- Separate local development/test LOGIN credentials and migration/runtime
  privileges need their own provisioning plan. Never run the app as `postgres`
  or share development credentials with tests. Keep secrets in ignored env files;
  request any interactive password locally, never through chat or command args.
- Test DB mutations must fail closed unless the explicit local test database
  is selected. Do not run destructive test setup against development/production.
- Merchant APIs remain disabled. Verified outbound links do not authorize API
  access. No integration, import or save-triggered sync in this stage.
- Plan media metadata and immutable references; defer storage, upload handling,
  sanitization library and image/video limits until separately selected. This
  design does not permit arbitrary embeds or unvalidated uploads.

## Implementation sequence (each requires a concrete approved plan)

1. Verify pinned packages with JS schema/config, local-only connection setup,
   safe secret handling and separate roles. Review installation/audit results.
2. Implement schema constraints and review generated SQL; approve local
   migrations and clearly labeled mock seeds separately before executing them.
3. Implement price/modifier validation and server read functions with meaningful
   unit/integration tests. Keep fixtures until the read-path switch is approved.
4. Wire public routes to published data; verify bilingual routes, draft exclusion,
   empty DB behavior and cache invalidation after publication. Plan media support
   separately with confirmed limits. Phase 3 adds authenticated CMS operations.

## Acceptance checks for implementation

- JS/MJS schema/config work with the pinned package combination and PostgreSQL
  18.6; clean local migrations reproduce the reviewed schema in the test DB.
- Reject fractional/overflow amounts, invalid variant ownership, options from
  another product/group, duplicates outside allowed rules, and min/max failures.
  Valid selections calculate exact totals; platform price comparisons include
  final modifier costs and report discrepancies without automatic sync.
- Draft edits cannot change live content or preserve approval on changed data.
  Cross-revision references and forged approvals fail. Publish is atomic and
  concurrent stale writes fail safely; unpublished rows cannot leak publicly.
- Once auth exists, direct Staff API attempts to approve/publish/schedule/archive
  fail; absolute 24h and idle 1h session limits are enforced server-side.
- Future public integration passes lint/build, relevant unit/integration tests
  and the existing Playwright suite with network guards. No real merchant/email
  calls. Full security/release gates and existing ADR-001 findings remain open.

## Unknowns, cost and rollback

Actual catalog, prices, modifier rules, merchant links, media and verified
translations remain pending. Auth choice, media limits, pool sizing, revision
retention and production backup/restore details are unresolved. ORM/VPS memory
usage has not been measured; no hosting cost/performance guarantee is made.

2A verification is documentation diff/whitespace review only; it does not prove
runtime acceptance. No SEO behavior changes: preview remains noindex and no
Restaurant/LocalBusiness schema is introduced. Rollback restores the three
existing documents and removes this new file, preserving unrelated work. Future
migration rollback must be reviewed against actual SQL and backups; do not
assume dropping a schema is safe. Commit, push and deployment need separate
authorization.

## Phase 2B1: draft foundation and reviewed migration files

Approved on 2026-10-16 under ADR-009. The existing branch retains earlier
uncommitted work. Implemented tables: catalog_revisions, categories, products,
category_entries, product_entries, category_translations and product_translations.
See DATA_CONTRACTS.md for columns/limits and the deliberately draft-only boundary.

Generated files: drizzle/0000_catalog_foundation.sql,
drizzle/meta/0000_snapshot.json and drizzle/meta/_journal.json. Review found
seven CREATE TABLE statements, six ALTER TABLE ADD CONSTRAINT statements and
one CREATE INDEX, with no DROP/TRUNCATE/DML. Import/generation does not apply SQL.
The snapshot/journal belong to this migration; do not edit their version/history
independently or delete them after a migration has been applied.

Validation passed: seven configuration tests, four read-only connectivity/role
isolation tests, lint, build and an offline SQL/snapshot structure check. This
does NOT prove actual uniqueness/CHECK/FK enforcement or migration replay.
No new package, table grant, LOGIN role, secret, seed or public route was added.

### Next local migration proposal (not authorized by 2B1)

1. Review final SQL, database targets and the separate migration/runtime role
   provisioning plan. Current app roles intentionally cannot create tables;
   do not switch the application to postgres or grant it ownership for convenience.
   Explicitly target public schema and verify object ownership/privileges.
2. Present exact migration commands plus test-only mutation boundaries and
   rollback/backup steps for approval. Apply to the isolated local test DB first;
   do not automatically migrate dev or production with it.
3. Test valid bilingual graphs and actual PostgreSQL rejection of invalid locales,
   blank titles, duplicate slugs/entry keys, negative sort order, invalid version,
   non-draft status, orphaned/cross-revision references and unsafe parent deletion.
   Use transactions for test records and verify cleanup; no merchant/email calls.
4. Verify recorded migration state and safe reapplication behavior, inspect the
   resulting schema/privileges, and report results before proposing dev migration.
   Future approved development migration requires its own explicit target boundary.

2B1 rollback: restore schema.mjs to the prior empty entry point, remove only the
three generated files and undo 2B1 documentation. Preserve earlier ORM, role/env
and design work. Because the SQL was not executed, no DB rollback is needed.
Later applied migrations require a new recovery plan against actual data.

## Phase 2B2: test database migration and constraint verification

Approved on 2026-10-16 after the concrete 2B2 plan, with the user's subsequent
instruction to omit unrelated repeated checks. Remain on feat/catalog-data-plan.

Implemented a separate tiny_osaka_test_migrator LOGIN with CONNECT to test and
membership in tiny_osaka_test_owner (SET true, INHERIT/ADMIN false). The owner is
NOLOGIN. Migration credentials live only in private ignored .env.test-migrator.local;
the application's existing credentials/grants are unchanged.

The runner accepts TEST_MIGRATION_DATABASE_URL only, validates exact local test
identity/role privileges, explicitly SET ROLEs to the owner, sets public search
path and checks a pinned SHA-256/timestamp for 0000_catalog_foundation. A session
advisory lock serializes this runner. Unexpected public objects or migration
history fail closed. Drizzle's migration and metadata creation run inside an
outer transaction; applied history and object ownership are checked before commit.
This one-migration runner needs an approved update before accepting later files.

Result: seven tables and the Drizzle migration metadata now exist in test. The
second runner invocation checked history/hash/ownership and made no changes.
Two guard tests passed. Eight database cases were verified: seven passed on the
first run, and the RESTRICT case passed on its targeted rerun after correcting
the expected SQLSTATE from 23503 to 23001. No schema/rule was weakened. Synthetic
records are rolled back; all seven tables were confirmed empty. Application
denial tests also passed for owner assumption, CREATE TABLE and draft-table reads.
Development metadata query confirmed zero catalog tables; no dev migration ran.

PowerShell/Node syntax checks, lint and whitespace/diff review passed. As requested,
old configuration/connection tests, build, E2E and audit were not repeated because
their relevant code/packages/UI did not change. Existing security findings and
full release gates remain open. No seed, live content, API or deployment occurred.

Rollback after application is NOT the 2B1 file-only rollback: preserve SQL and
history. Inspect test data/objects/role dependencies first and propose an explicit
reverse migration or scoped restore for approval. Do not drop the database,
CASCADE-remove objects or blindly delete the Drizzle history. No destructive
rollback was performed. Next work needs a separately scoped plan for dev migration
or continued catalog fields; completing 2B2 is not completion of Phase 2.

## Phase 2B3: local development migration (2026-10-16)

Approved scope: separate dev migrator provisioning, guarded application of the
existing foundation and read-only post-migration verification. Completed on
feat/catalog-data-plan: provisioning, first migration, no-change repeat and
read-only verification passed. Dev now has seven empty draft tables.
See ADR-011. Test runner, SQL/snapshot/journal and runtime grants stay unchanged.

New scripts: setup-dev-migrator.ps1/.sql, lib/dev-db.mjs, migrate-dev-db.mjs,
verify-dev-db.mjs and unit dev-db-guard.test.mjs. No new package. The runner pins
one reviewed migration, checks role/target/history/ownership, serializes itself
with a dev-specific advisory lock and wraps migration in a transaction. Later
migration files require a reviewed runner update. No production operation.

Acceptance includes a no-change second invocation and read-only checks of seven
empty tables, owner/history, six RESTRICT FKs and runtime privilege isolation.
Rollback after application requires inspected reverse migration/restore, never
file/history deletion. Actual results are recorded in README.

## Phase 2C1: offline pricing schema and validator (2026-10-16)

Approved plan plus user amendment: no business price ceiling; one standard variant
for simple products; product-wide modifiers, nonnegative deltas, no repeated option.
Six tables and the pure validator/test are implemented. 0001 SQL/snapshot/journal
were generated without running SQL. Foundation SQL and prior snapshot tables are
unchanged. See ADR-012 and DATA_CONTRACTS.md for technical safe-integer bounds.

The existing dev/test runners are still intentionally pinned to 0000 and will
refuse the additional migration. Next proposal must review 0001 SQL and update
runner history/object/hash guards, then apply/test against isolated test first.
Development migration remains a separate approved target. Draft readiness and
selection validation do not establish DB constraints, immutable revisions or
Owner approval/publication. Public fixtures stay unchanged.

Verification results/commands and file-only pre-application rollback are in README.
No production data, seed, API, new dependency, credentials, grant or deployment.

## Phase 2C2: test-only pricing migration (2026-10-16)

Approved and completed on feat/catalog-data-plan (ADR-013). Only the test runner
now accepts reviewed 0000/0001. Its manifest/state helper rejects wrong hashes,
journal/order/timestamps, unexpected or missing relations, wrong owner/kind,
empty history and partial/mismatched state. The same test-specific lock and role
checks remain; migration and final verification run in a transaction.

Test has thirteen empty catalog tables and two matching migration history rows.
Six manifest guard unit cases, eight catalog DB and eleven pricing DB cases
passed. First application and no-change repeat passed. Read-only dev metadata
confirms seven foundation tables only. Actual commands/results are in README.

The dev runner is unchanged and still refuses the additional journal until its
own reviewed update. Next work may propose dev migration with explicit target,
history/ownership guards and updated dev verifier; do not reuse test credentials.
No grant, new dependency, UI/public-data switch, seed, API or release operation.
After this test application, preserve migration files/history and use an approved
reverse/restore plan for rollback; do not use offline 0001 file removal on test.

## Phase 2C3: development pricing migration (2026-10-16)

Approved and complete on feat/catalog-data-plan; see ADR-014. Dev-only manifest
helper/tests, runner and verifier updated. The runner pins reviewed 0000/0001,
refuses unknown/mismatched history, owners, object kinds/names and nonempty
foundation before applying 0001 in a transaction under its existing dev lock.

Six unit guard cases, syntax, lint, first migration, no-change repeat and read-only
verification passed. Dev now has thirteen empty owner-owned tables, two history
rows and twelve RESTRICT FKs; runtime app still has no table privileges. Test
runner/database, SQL artifacts, credentials and packages were not changed here.
Both local DBs now share the pricing schema. Public routes still use fixtures;
no approved/published source, write grant, CMS or merchant API is introduced.

Next work should plan revision/concurrency and approval/publication prerequisites
or remaining content contracts before a public data switch. Auth selection and
server RBAC remain separately gated; do not expose draft rows just because the
schema exists. File-only rollback is invalid after 0001 application in either DB.

## Phase 2D1: draft writer foundation (2026-10-16)

Approved and complete: create empty drafts and save variant base-price with
expectedVersion, atomic root compare/increment plus scoped child update. No
schema/migration, route, auth/permission grant or public-data switch. See ADR-015
and DATA_CONTRACTS.md. Only this edit operation currently follows the contract;
future child writers must use the same root version transaction policy.

Four unit cases and final nine DB cases passed; syntax/lint/diff passed. Initial
lock observation failed (8/9 passed); direct lock-graph probe fixed it, targeted
rerun and full suite passed. Committed test fixtures enabled genuine concurrency
and were cleaned only by owned IDs; final thirteen tables empty. Development
was not mutated. Actual command results and limitations are in README.

Next planning may extend draft operations/copying or design immutable submission/
approval/publication with auth selection. Current draft-only status and runtime
privilege denial must stay intact until their separately reviewed protections
exist. No claim of completed CMS, global SQL concurrency enforcement or Phase 2.

## Phase 2D2: draft catalog cloning (2026-10-16)

Approved and completed per ADR-016. cloneCatalogDraft copies all ten current child
tables under an exact source version and FOR SHARE source root lock, in one
transaction. A fresh root starts draft/version 1; identity/slug rows remain shared.
Explicit column whitelist prevents accidental future workflow-field inheritance.
Empty/incomplete drafts are retained as-is, not made publish-ready or fabricated.

Five unit tests, syntax/lint/diff, nine existing writer DB cases and eleven clone
DB cases passed. Genuine editor-first/clone-first blocking, partial-copy SQL error
rollback and source/copy edit independence verified. Exact generated fixture IDs
were cleaned; thirteen test tables empty. No dev/schema/permissions/UI change.

Next planning can extend versioned child editing and eventually immutable submit/
approval/publication prerequisites. Auth/Owner/Staff enforcement and stable slug
protection remain gated; copying is not their replacement. Future additional
revision-child tables need an explicit clone/cleanup contract and tests.

## Phase 2D3: versioned category/product text editing (2026-10-16)

Approved and completed per ADR-017. Internal writers now upsert category/product
ID/EN title/description with an existing revision parent and expectedVersion.
A shared compare/increment helper serializes price and text writers. All changes
and version increment commit together; stale/wrong-scope/error paths roll back.
Only literal text fields persist; identity/slug/status and other locales stay intact.

Six unit cases, syntax/lint/diff, nine writer and eleven clone regression cases,
and eleven translation DB cases passed. A genuine two-connection text/price race
produced exactly one winner and one stale conflict. Temporary fixtures cleaned;
all thirteen test tables empty. No dev/schema/grant/public-route changes.

Next work can plan remaining versioned variant/modifier text/rule writers or the
review/publication prerequisites; login/Owner/Staff checks and immutable approved
revisions remain separate requirements. This step does not complete all catalog
editing, public integration or Phase 2. Publish-readiness must verify bilingual
completeness later; partial drafts remain allowed now.

## Phase 2D4: variant and variant-label writing (2026-10-16)

Approved/completed per ADR-018. Internal writers create/edit variants and upsert
ID/EN variant title/description with root expectedVersion. Generated IDs, full
revision/product scope, unique code, first/sole standard rule, safe IDR and int4
sort enforced transactionally. No deletion, product creation, grant or migration.

Eight unit cases, syntax/lint/diff passed. Regression: writer 9/9, clone 11/11,
translations 11/11; new variants DB suite 13/13 passed. Actual mixed-writer races,
SQL failure rollback, clone isolation and complete cleanup checked. All thirteen
test tables empty; dev/public data untouched. Actual commands in README.

Next work can plan modifier-group/option writers, their translations and min/max
policy editing with the same root contract. Broader catalog creation, readiness,
auth/RBAC and immutable approval/publication remain separate before public data
integration; completing this variant step does not complete Phase 2.

## Phase 2D5: modifier group/option writing (2026-10-16)

Approved/completed per ADR-019: six internal writers for group and option create/
edit plus ID/EN labels, sharing the root transaction/version contract. Groups
have single/multiple and min/max; options use nonnegative safe-IDR deltas. Generated
IDs, exact scopes and code uniqueness enforced; edits cannot reparent records.
Underfilled drafts allowed until readiness validation. No deletion/schema change.

11 writer and 20 pricing unit cases, syntax/lint/diff passed. DB regression writer
9/9, clone 11/11 and modifiers 15/15 passed. DB-loaded totals/selection rules,
real SQL rollback for six operations, genuine mixed writer concurrency, copy
isolation and exact fixture cleanup verified. Thirteen test tables empty; dev,
public data and runtime grants untouched. Actual commands/results in README.

Next work can plan remaining category/product creation and graph editing or
catalog review-readiness validation. Auth, immutable approval/publication,
content-page templates/media and public DB integration remain separate requirements;
completion of modifier writers does not mean all Phase 2/CMS work is complete.

## Phase 2D6: bundled draft foundation completion (2026-10-16)

Approved and complete per ADR-020. Category/product identity creation, revision
placement/sort and structural review-readiness report implemented in one package.
Empty-to-complete catalog acceptance uses only application writers, with ID/EN
category/product/variant/group/option fields. Readiness returns a version-bound
issue list under a consistent shared source lock; no approval or publish transition.

43 unit cases, syntax/lint/diff and 71 DB cases across all six related suites passed.
Synthetic source/clone/identity rows cleaned by owned IDs; thirteen tables empty.
No dev/schema/grant/UI changes. Actual command/results and boundaries in README.

### Fixed five-group progress (keep this grouping stable)

| Group | Status |
|---|---|
| 1. Draft catalog foundation | Complete for the approved foundation scope: create/copy, versioned editing, placement and structural readiness |
| 2. Revision protection and publication read path | Backend complete: frozen revisions, exact-hash approval, atomic pointer, audit and published reader; real auth integration remains Phase 3 |
| 3. Fixed bilingual page content data | Backend complete: fixed templates, ID/EN revisions, safe structured text, review/publication/audit and published page reader |
| 4. Image/video references and limits | Backend complete: immutable metadata, policy limits, bilingual versioned references/posters, hash/clone/readers; physical upload adapters/UI remain Phase 3 |
| 5. Public integration and complete QA | Pending |

These are work groups, not a fixed count of implementation tasks or duration.
Deletion, CMS UI, verified business content and auth are not implied by foundation
completion. Further tasks stay within these five groups; do not inflate the count
by treating each new writer/test as another group. Group 2 backend is completed
below; group 3 is also complete below. Group 4 is also complete below; next is group 5 public integration. Phase 3 auth
boundaries remain required before exposing CMS workflow actions.

## Phase 2 group 2 backend package (ADR-021)

The approved backend scope is implemented. Default-deny trusted server identity
contract, submitted content freeze/hash, exact Owner approval/rejection, fresh
draft clones, atomic publication pointer, safe nonlive archive and append-only
audit are covered by 74 unit, 90 regression and 14 publication integration cases.
Migrations 0002 and forward correction 0003 preserve applied history; runner now
verifies SQL/history/protection state before its single pg transaction commits.

This completes group 2 backend, not the Phase 3 CMS login/UI or group 5 public
integration. Group 1 is complete for its foundation scope. Three Phase 2 groups
remain: 3 fixed bilingual content, 4 media references/limits, 5 public integration
and complete QA. Keep these five groups stable. Release QA and known dependency
findings remain open. Public preview routes stay on fixtures and noindex.

Final local acceptance: 74 unit + 108 DB integration (90 regression, 14 publication,
4 connectivity), 222 public E2E, lint/build and dev verifier passed. Both local
databases have 17 empty tables and four reviewed migration history entries.
Development audit findings remain open; this is not release approval.

## Phase 2 group 3 backend completion (ADR-022)

Approved full package implemented on feat/catalog-data-plan. Nine existing page
identities use fixed code-owned templates, bounded bilingual structured content,
versioned drafts and immutable hash-bound approval/publication. Trusted identity
resolver defaults to denial until Phase 3 auth. Public preview/noindex unchanged.

0004 applied to test, then development after 89 unit, 126 DB integrations, lint,
build and 222 public E2E passed. Both DBs have 24 empty tables, five reviewed
history rows and intact catalog/page protection; repeat runners make no changes.
No new dependency, runtime grant, business-content seed, merchant or production call.

Two Phase 2 groups remain: 4 media references/limits, 5 public integration and
complete QA. CMS login/editor/session/scheduler stay in Phase 3. Fixed grouping
remains five; backend completion does not imply CMS UI or release readiness.
Rollback requires inspected approved reverse migration/restore; keep applied SQL
and history. Existing dependency findings and release gates remain open.

## Phase 2 group 4 backend completion (ADR-023)

Approved media metadata/reference package implemented. Image 10 MB/4096-side,
video 100 MB/120 sec/1920-long+1080-short, image poster and twelve attachments
limits enforced by server policy and SQL. Bilingual refs are draft-versioned,
frozen with their revision, cloned without approval, hash-bound and safely read
from published pointers. Old no-media hashes stay identical. Registration is
default-deny without trusted auth/physical inspector; tests use synthetic reports.

0005 applied to test, then development after 102 unit, 142 DB integrations, lint/
build and 222 public E2E passed. Both DBs have 28 empty tables, six history entries,
30 RESTRICT FKs and verified catalog/page/media guards. No-op repeats passed.

One Phase 2 group remains: 5 public integration and complete QA. Actual login,
upload UI, physical file inspection/storage and scheduler remain Phase 3; do not
claim working browser uploads or decoded-file acceptance from this backend scope.
Public fixtures/noindex and runtime grants unchanged. Known dependency findings
and staging/Lighthouse/release gates remain. No production/merchant operations.
Preserve applied SQL/history; rollback needs inspected approved reverse/restore.

## Phase 2 group 5 completion (ADR-024)

Published-only runtime readers, safe fixed-template ID/EN SSR, catalog prices and
choices, bounded rich text/media policy, honest empty/404/error behavior and
explicit fixture preview are implemented. Migration0006 applied test-first then
development after QA; SQL/history preserved and no-op repeats verified.

There are no remaining functional groups in the approved Phase2 scope. Remaining
release quality work is tracked separately, not added as new Phase2 groups.
Phase3 auth/CMS/upload work must use a new branch per approved subphase, then
commit and push after completion/verification, as explicitly requested by user.
Merge/deploy need separate authorization. No Phase2 commit/push was performed.
