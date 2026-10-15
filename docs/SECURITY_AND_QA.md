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
