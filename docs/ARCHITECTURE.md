# Architecture Proposal — verify before implementation

**Status: RECOMMENDED, not owner-approved final technical decision.** Low-cost self-hosted Next.js full-stack modular monolith. JavaScript/JSX App Router; Tailwind/Headless UI. PostgreSQL data. Server code runs with secrets in isolated environment; Next.js public pages render crawlable HTML. Interactive admin uses Axios/custom hooks as needed.

## Logical boundaries
- `public-site`: localized pages, menu, marketing/SEO, order CTA tracking.
- `cms`: auth, Owner/Staff authorization, form/rich-text/media, content workflows.
- `catalog`: immutable approved revisions, modifier/price business validation.
- `merchant-sync`: provider-specific adapters, mapping, preview, explicit send, retries/lock/idempotency, audit.
- `media`: upload validation, object storage, responsive derivatives, poster and video handling.
- `jobs`: scheduled publish, retries, backup/alerts.
- `observability`: server logs, task health, monitored failures, no PII tokens in logs.

## Suggested code organization (proposed)
`src/app/(site)/...` public routes (single language, no URL prefix, ADR-038); `src/app/admin/...` protected routes; `src/app/api/...` route handlers; `src/features/<feature>/{components,hooks,services,validators}`; `src/server/{auth,db,integrations,jobs}`; `src/lib`; `src/styles`; `tests/{unit,integration,e2e}`. Avoid treating route folders as the entire domain boundary.

## Architectural rules
- DB interactions/auth/admin mutations must run on server; no secrets in client component.
- Search-indexable text/content delivered server-first; choose cache/revalidation strategy with publishing acceptance tests.
- A saved draft cannot replace published content; approved revision promotion is atomic at DB level.
- Scheduled jobs must be durable across app restart; use persistent jobs and locking; cron must not be sole source of truth.
- Merchant sync records platform outcomes separately, prevents concurrent duplicate sends and supports safe retry; provider adapters isolated from CMS business entities.
- Uploaded rich text/embeds require server validation and safely rendered HTML. Video upload needs caps and storage cost analysis; avoid server-side transcoding on tiny VPS.
- Server render without merchant availability: no public API calls to merchant for each page request.
- Propose cache invalidation after publishing and product edits; verify stale content cannot leak.

## Technical decision gates before installing packages
1. Compare Drizzle vs Prisma for pure JS support, migration safety, docs and 2GB RAM.
2. Compare Auth.js vs Better Auth (or mature alternatives) for credentials auth, secure sessions, role enforcement, optional Owner MFA, reset email without paid plugins.
3. Confirm Next.js current release and Node LTS compatibility; pin lockfile and exact version, avoid TypeScript scaffolding.
4. Verify open-source license/feature restrictions for rich text Tiptap OSS and all libraries.
5. Calculate storage and delivery for self-hosted vs object storage within monthly cap; confirm safe media processing.
6. Compare VPS runtime memory with PostgreSQL, Node and staging ephemeral environment.
7. External API partner credentials/sandbox are blockers to merchant adapter implementation, not website launch.

## Source documentation
https://nextjs.org/docs/app/getting-started/installation
https://nextjs.org/docs/app/getting-started/deploying
https://playwright.dev/docs/intro
https://developers.openai.com/blog/skills-agents-sdk
