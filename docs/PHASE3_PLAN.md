# Phase 3 - secure CMS

## Subphase 3.1: authentication and protected CMS entry

Approved by user on 2026-10-16. Branch: feat/phase3-1-auth, based on main
merge d323c80. Per the standing instruction, complete verification then commit
and push this subphase. Merge/deploy are separate actions.

Scope: internal email/password login, logout, protected admin home, server Owner/
Staff authorization, absolute24h/idle1h sessions, CSRF/origin/callback restrictions,
durable bounded rate limits, audit, secure reset contract and optional Owner MFA.
Public signup/social/user mutation routes are not exposed. Catalog/page/media
workflow endpoints are not exposed by this subphase; existing default-deny
workflow factories remain until the editor integration is approved.

Better Auth and @better-auth/drizzle-adapter are pinned to1.7.10 (MIT). Built-in
password hashing, opaque signed cookie sessions, TOTP/encrypted recovery data,
email verification/reset and transactional reset revocation are used. Cookie
cache/rolling refresh/telemetry are disabled. Extra activity checks and SQL
constraints enforce the agreed24h/1h policy without replacing library crypto.

Migration0007 adds cms_auth with users/accounts/sessions/verifications/two_factors/
roles/session_activity/request_limits/audit. Runtime cannot create/delete users,
change role/enabled state or identity/email, or modify/delete/read audit. Auth
roles are provisioned by the verified local migrator/Owner CLI. Existing public
table grants and the two published-only reader capabilities remain unchanged.

Local secret configuration is generated into private ignored .env.auth.local,
never NEXT_PUBLIC_ variables. Auth config supports loopback only for this local
phase. HTTP loopback cookies use HttpOnly/SameSite=Lax; HTTPS uses Secure too.
Remote deployment needs separately approved origin/TLS/proxy configuration.

## Manual test after the development migration

Private auth configuration was generated during implementation. To provision
your first real local Owner, run from the repository root:

```powershell
powershell.exe -NoProfile -File .\scripts\provision-account.ps1 -Role owner
npm.cmd run dev
```

The terminal asks for email, display name and a unique password of 6-128 characters
with confirmation. Never send passwords through chat. Existing accounts are not
overwritten. Restart an already-running dev server, then open
http://localhost:3000/admin/login (same origin as BETTER_AUTH_URL).
Use /admin/security to enroll optional Owner TOTP; add the shown key manually to
an authenticator, verify a code and save the recovery codes privately. Recovery
codes are single-use. Staff cannot access or call Owner MFA settings.

Provision Staff through the same trusted operator tool with -Role staff. This
CLI requires private development-migrator credentials; it is not a public API.
For a new checkout, create private auth configuration first:

```powershell
powershell.exe -NoProfile -File .\scripts\setup-auth.ps1
```

The setup script refuses to overwrite an existing configuration and restricts
file ACLs to its owner. No real account was invented or seeded by implementation.

## Email boundary and rollback

A real email sender/provider is not configured. Reset/verification email requests
fail closed with503; the UI states this limitation. Backend tests inject a
memory-only sender, verify inbox tokens, single-use/expired reset tokens and
revocation. Accounts start emailVerified=false; reset is only sent for enabled
accounts with verified email ownership. Email verification and reset links use
URL fragments and POST token bodies, so tokens do not enter HTTP request URLs.

Do not claim real email delivery, completed account verification, working content
editing or production readiness from this subphase. Existing dependency findings
remain release blockers. Follow SECURITY_AND_QA.md for actual results.

Rollback: revert this subphase's application commit to restore the previous
application behavior; protect the private auth config and any created accounts.
Do not delete or rewrite applied SQL/history. A schema/grant rollback or account
deletion requires an inspected, approved reverse migration/restore.

## Verified completion

Subphase3.1 implementation and local functional acceptance complete:107 unit,
154 integration,318 E2E, lint/build and secret checks passed. Migration0007 is
applied to both local databases; repeats are no-op and guards/grants verified.
Real Owner setup awaits terminal input; real email sending and release advisory
resolution remain pending. See SECURITY_AND_QA.md for exact command results.

## Subphase 3.2: fixed-template page editor and approval

Approved by user on 2026-10-17. Branch: feat/phase3-2-cms-pages, based on
origin/main b1753db, which includes the six-character CMS password decision.
Standing per-subphase commit/push permission applies after verification.

Scope: /admin/pages, fixed-template page editing (Indonesian-only since ADR-034/038), bounded structured
rich text, content preview, exact-version draft save/clone/submit, Owner-only
approve/reject/publish/archive. Frozen revisions require a new draft; cloning
never inherits approval. Live content persists until an approved replacement.
Scheduling, catalog UI, media uploads, email delivery and merchant integration
are later subphases. Admin/public preview remain noindex.

No added dependency or version change. The editor uses native labelled form
controls and the existing bounded JSON document contract, rather than HTML
contentEditable or raw HTML parsing. Paragraph/heading/list blocks and individual
text spans preserve marks, order and allowlisted internal links. Preview displays
field content; the public page composition remains owned by its fixed template.

CMS mutations require real server-authenticated sessions, trusted Origin and
JSON, bounded streamed bodies, exact input fields and database membership recheck.
Each operation uses a repeatable-read transaction; stale versions/conflicting
writes are refused. Draft create/save/clone audit writes are atomic with content.
Existing workflow transitions already record actor, revision and action.

Public/auth runtime credentials are unchanged. scripts/setup-cms.ps1 provisions
separate dev/test CMS LOGIN roles using an administrator password entered only in
the operator terminal. Random CMS passwords are written into owner-ACL restricted,
ignored .env.cms.local. Runtime never receives migrator/admin credentials. CMS
roles can access only page workflow tables, read immutable media metadata, clone
page media references, and read role membership. They cannot change accounts,
roles, catalog, media assets or database/schema objects, delete rows, or truncate.
Application Owner/Staff RBAC is enforced by the server workflow, not by distinct
PostgreSQL login roles for each application user.

Migration0008 extends allowed page audit actions and grants the separate CMS
capabilities. Existing migration files/history, frozen-content triggers and
published-only public readers are preserved. Setup completed by the user;
migration applied only to local dev/test databases.

Manual use: restart npm.cmd run dev, sign in through /admin/login and choose
Kelola halaman website. Select a page, create a draft and save it.
Complete the Indonesian title and body before submit; Owner reviews the frozen candidate before
approval/publication. Concurrent stale saves retain local unsaved text and ask
the editor to copy it before reloading. The revision list shows the latest100.

Rollback: revert the application subphase commit while preserving .env.cms.local,
accounts, content and applied SQL/history. Revoking CMS grants, deleting roles
or reversing the audit constraint needs an inspected approved reverse migration;
do not delete an applied migration or reset passwords to roll back UI behavior.

Subphase3.2 local functional acceptance complete: lint/build,111 unit,163 full
integration regression,9 final focused CMS integration, and333 browser checks
passed. The focused CMS run includes an additional real two-connection race test
added after the full regression; eight CMS cases overlap that full run. Migration
repeats are no-op; public secret scan passed. Existing dependency advisories remain
release blockers. Exact commands and initial corrected failures: SECURITY_AND_QA.md.

## Subphase 3.3: catalog CMS and preview cards

Approved by user on 2026-10-17. Branch feat/phase3-3-cms-catalog starts from
origin/main2b8b4cb, including merged PR8's form/button spacing.

Scope: authenticated catalog revision list/create/clone, category/product
content, ordering/placement, standard and additional variants, integer IDR prices,
modifier groups/options and selection limits. Staff may draft/submit; Owner alone
approves/rejects/publishes/archives the exact frozen version/hash. Existing live
content persists while a replacement draft is edited. No deletion UI is added.

All UI reuses installed shadcn components. Form fields retain12px label clearance,
24px separation and wrapping action rows. Category/product sections expand with
semantic details/summary. Each form retains its own pending edits while another
form saves. Actions/readiness are disabled until every form has saved. Preview
can display unsaved existing-field edits, while new identities appear after create.

Catalog preview cards show localized category/product text, variant choices,
modifier bounds and a calculated total using the existing pricing validator.
Invalid or incomplete choices show no numeric total. Images show an explicit
unavailable placeholder until the physical media phase. The UI never claims
merchant price verification. Page previews use grouped Cards and SEO metadata.

Forward migration0009 adds least-privilege catalog grants to the existing isolated
CMS roles and create/save/clone audit actions. It preserves old SQL/history and
all content. Test/dev migration plans accept only reviewed9/10-row states. Dev
migration locks content and verifies equal row counts before/after; the previous
empty-database requirement is replaced only for this grant/audit-only transition.
No credential reset, application-superuser access or production migration.

New service/API checks authenticated database membership, exact input fields,
bounded text/body, route revision scope, Origin, and expected version/hash. Writes
and draft audits share a transaction. Runtime shares the existing CMS pool; no
new dependency or public API provider. Private asset storage metadata is omitted
from the browser response. Physical uploads, scheduling, email delivery, merchant
integration and dependency-advisory resolution remain separate phases.

Approved verification: lint/build, unit, full integration, catalog/page/auth/public
browser regressions, migration no-op/protection checks, bundle secret scan and
diff review. Fixtures remain test-only, synthetic and cleaned by tracked actor IDs.
Actual results are recorded in SECURITY_AND_QA.md after execution.

Rollback the application/UI files from this subphase and rebuild, while retaining
0009 SQL/metadata, migration manifests/verifiers and applied history. Keep private
envs, accounts and content. Restoring the prior privilege
boundary requires an inspected approved reverse migration; never delete0009 or
rewrite applied history. Commit/push follows standing approval; merge/deploy remain
separate operations.

## Subphase 3.4: private media library and original brand assets

Approved on 2026-10-17. Branch `feat/phase3-4-cms-media`. Reuse the immutable
Phase 2 media graph with real Staff/Owner authentication, revision versions,
frozen-state guards and normal Owner review/publication. No automatic publishing.

The shadcn media library at `/admin/media` accepts original JPEG/PNG/WebP and
conditionally MP4/WebM. Full image decoding validates MIME/dimensions; video
requires explicitly configured local FFmpeg and ffprobe, with bounded inspection,
codec/container checks and a full decode. Without those executables video upload
fails closed. YouTube ID registration requires an already registered image poster;
the visitor must consent before the external player is loaded.

Files are immutable original bytes under ignored `.media/dev` or `.media/test`,
outside `public`. UUID keys are server-generated and never returned in browser
DTOs. Uploads have streaming byte caps, idle/total time bounds and a concurrency
limit. File responses verify integrity, stream bytes with single-range support,
and use no-store/nosniff headers. Public access requires an exact live approved
page/catalog reference, including video/YouTube posters. Preview requires a CMS
session. No remote import, physical delete or in-CMS retouch is implemented.

Migration 0010 grants media asset/event INSERT and draft-reference UPDATE/DELETE
to isolated CMS roles, plus a narrow published-media SQL capability to the public
reader. Immutable asset/audit guards remain. Reviewed test/dev runners accept only
the 10-to-12-history-row transition (including the verified 11-row intermediate)
and no-op state. Dev content counts are checked
under locks. No production migration or deployment is authorized.

Original logo 01b is retained byte-for-byte; separately approved web/favicon/Apple
PNG derivatives replace the temporary lantern in the UI. See BRAND_ASSETS.md.
Verification commands/results and limitations are recorded in SECURITY_AND_QA.md.
Rollback application code while retaining applied migrations 0010/0011, their metadata,
history verifiers, private media files and credentials. Any privilege reversal is
a separate inspected migration. Standing verified commit/push workflow applies;
merge and deploy remain separate.

QA also found that the original poster trigger used FOR SHARE, which required
UPDATE privilege. Forward migration 0011 removes only that redundant lock from
the immutable-poster read. All mutation guards remain; no UPDATE grant on assets
is added. Prior applied SQL and history stay unchanged. Runtime pools are shared
per process across route bundles to respect the existing connection limits.

## Subphase 3.5: durable scheduled publication

Approved on 2026-10-17, branch `feat/phase3-5-scheduled-publishing`.
Owner schedules an exact approved page/catalog version and content hash. Staff
can read the queue but cannot schedule/cancel through forged API requests.
Shadcn forms use an explicitly labeled WIB wall clock; storage is UTC.
`/admin/publications` shows active jobs first, then recent history (100 total), safe failure reasons, retries,
revision links and optimistic Owner cancellation. The screen refreshes every
30 seconds while open. Closing the browser does not cancel a job.

Scheduling is an overlay on the approved revision, not an edit of its frozen
status/hash/approval. The root remains approved until successful publication.
One pending job per target; changing a due date requires cancel then schedule.
Due time must be future and at most 365 days away. The job seals the live pointer
at scheduling; a later publication makes that job obsolete. Manual publication
cancels pending jobs for that target, including an idempotent publish of its live
revision. Archiving cancels only that revision's pending job. Prior public content
remains until publication commits successfully.

Worker rechecks the original scheduling Owner's enabled DB membership, exact
approved revision and live baseline. It reuses existing hash/receipt/approval
workflows, rather than inventing a system Owner. Publication, job completion and
audit share one transaction. A shared advisory lock precedes target/root locks
on scheduler, worker, manual publish and archive. Concurrent workers cannot
double-publish; a crash rolls back or commits the entire result. Transient
persistence failures get at most three attempts, delayed 30 then 60 seconds.
Unavailable Owner/revision or changed live publication fails terminally. A DB
outage before job update leaves the durable job pending for a later invocation.

Migration 0012 adds jobs/events, frozen identity/append-only audit guards and
least-privilege CMS grants. QA found missing ON UPDATE RESTRICT on the three new
foreign keys; forward migration 0013 corrects them without rewriting 0012.
Reviewed runners accept history states 12, 13 and 14 with exact hashes/ownership.
Dev migration preserves content counts under locks. No auth write grant, public
table read, dependency, Railway action, production migration or deployment.

Foreground worker commands are documented in OPERATIONS.md. No actual development
jobs are run and no service/cron/Task Scheduler is registered in this phase;
tests execute the worker only against synthetic isolated test fixtures. A future
approved operational setup must keep it running and monitor delays/failures.
Email delivery/domain and FFmpeg installation remain separate unresolved tasks.

Rollback: stop the worker, then restore the previous application commit and
rebuild while retaining migrations 0012/0013, snapshots, verifiers and database
history. Retain jobs/events and existing content/media/configuration. Pending
jobs stay inert while the worker is stopped. Reconcile or cancel pending jobs
before restarting it. Removing tables/grants requires a separately reviewed
reverse migration; never rewrite an applied SQL file or delete migration history.


## Follow-up: Indonesian-only simple forms (ADR-034)

User approved removal of English switching/authoring and simplification across
pages/catalog on 2026-10-17. See ADR-034 for scope and compatibility/rollback.
UI has one Save all changes action next to review/Owner approval/publication;
required fields and feedback are visible in the same area. Existing fields and
English history are preserved; only Indonesian title/body are required for pages.
Catalog requires Indonesian names, placement and valid pricing; descriptions are
optional and standard variant creation is automatic for a new product.

Bounded batch saves reuse existing authenticated writers, version checks, frozen
revision guards and audits inside one transaction. New local aliases resolve only
from earlier creations within that save; forged workflow actions/root versions/
actors are rejected. A failed last operation rolls back earlier identities,
translations, media references, versions and audit rows. Existing workflow audit
and approval hashes are not reformatted. No database migration or dependency.

[Diamandemen ADR-038 dan penghapusan kode bahasa, 2026-10-18: tidak ada alihan; `/id` dan `/en` adalah 404 biasa dan URL tanpa prefix.] No
language selector or English output remains. Approved snapshots can contain legacy
English rows internally so their original hashes and signatures stay valid. No
new Owner publication or real development content edit is performed by the agent.

The user subsequently approved combining this follow-up with ADR-035 after the
other editing/QA session finished. Owner uses Setujui after saving, with an
optional WIB publication time; Staff keeps Kirim untuk review. Approval and
immediate publication are one atomic server operation, separate from Save all.
Final combined verification is recorded in SECURITY_AND_QA.md.

## Follow-up: direct page editing (ADR-036)

Approved 2026-10-17: website pages have one editor and immediate Save for Owner
and Staff, without user-facing drafts/review/approval or a scheduling page.
The page table links straight to /admin/pages/[pageKey]. Prior page data is
preserved as internal immutable snapshots; there is no migration or broader
database grant. Fixed templates, Indonesian content, shadcn, bounded media,
server sessions/membership/CSRF, optimistic conflicts and audit remain enforced.
Scheduling controls/API and worker CLI are retired; histories are retained.
Catalog review/Owner approval continues. See ADR-036 for rollback and QA record.
