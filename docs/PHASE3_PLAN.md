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

The terminal asks for email, display name and a unique password20-128 characters
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
