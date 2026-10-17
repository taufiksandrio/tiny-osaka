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

Scope: /admin/pages, bilingual fixed-template page editing, bounded structured
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
Kelola halaman website. Select a page, create a draft and save each locale.
Complete both locales before submit; Owner reviews the frozen candidate before
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
