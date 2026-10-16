# Dependency Selection — validation matrix (NOT install instructions)

The matrix below is a candidate checklist, not a list of installed packages.
Approved selections are recorded in ADRs and the sections below; remaining
choices are pending. Verify official docs, OSS license, project compatibility,
API stability, JavaScript ergonomics and 2GB VPS resource implications before
each installation proposal.

| Capability | Candidate(s) | Evaluation gate |
|---|---|---|
| Framework | Next.js App Router + React | JS/JSX setup, Node LTS, SSR, self-host |
| UI | Tailwind CSS + Headless UI | accessible component patterns and themes |
| DB | PostgreSQL | relational constraints, hosting footprint |
| Data layer | Drizzle vs Prisma | JS support, migrations, licensing, deploy RAM |
| Authentication | Better Auth vs Auth.js | credentials, reset email, optional TOTP MFA, sessions and RBAC |
| Editor | Tiptap OSS or comparable | rich text + sanitization + limited fixed templates, licensing |
| Validation | Zod | server shared validation and JS use |
| CMS fetch | Axios + custom hooks | authentication/CSRF and no leak |
| Tests | Vitest, Playwright | JS E2E, integration, CI |
| Storage | R2-compatible object storage or equivalent | free tier, video egress, MIME upload, cost |
| Mail | transactional provider or SMTP | verified sender, free tier, abuse controls |
| Jobs | cron + DB job state | durable, idempotent, no new redis needed |
| Observability | structured logs + health checks | reliable alerting, free/open source |

Do not select an auth dependency merely because it has a popular starter template; verify ALL owner MFA, reset, cookie and account provisioning requirements. Do not install all candidate tools at once.

## Phase 2A selection record (before installation)

Approved on 2026-10-15 for design/documentation under ADR-006. PostgreSQL 18.6
is already installed locally; no ORM/driver dependency is added by this task.

| Package | Exact candidate | License | Role / verification remaining |
|---|---|---|---|
| drizzle-orm | 0.45.4 | Apache-2.0 | Runtime data layer; validate JS schema and pg adapter against local PostgreSQL |
| drizzle-kit | 0.31.11 | MIT | Development migration tooling; validate JS/MJS config and generated SQL |
| pg | 8.23.1 | MIT | Runtime PostgreSQL driver; declared Node >=16 supports the project's Node 22.16 baseline |

Version/license/pg engine metadata were checked using read-only `npm view`.
This does not constitute installation, lockfile resolution, vulnerability audit,
tested compatibility or measured VPS memory usage. Recheck metadata and audit
at installation; upstream transitive issues may require a new proposal.

[Drizzle configuration documentation](https://orm.drizzle.team/docs/drizzle-config-file)
supports JS or TS configuration; examples may target a newer release, so test
the exact pinned stable combination rather than copying RC installation commands.
[Drizzle PostgreSQL documentation](https://orm.drizzle.team/docs/get-started-postgresql)
documents the node-postgres adapter. Application/schema source remains JS/MJS;
TypeScript tooling inside a dependency is not application TypeScript source.

Alternative evaluated: Prisma 7.10.0 (Apache-2.0), whose declared Node ranges
include Node 22.16. The modern `prisma-client` generator emits TypeScript and
legacy `prisma-client-js` is deprecated in the
[Prisma generator documentation](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators).
This increases adaptation work for the repository's JS-only source rule; it
does not mean Prisma cannot be used by JavaScript applications. No performance
comparison was run. Avoid selecting prerelease versions just because a registry
tag or documentation example suggests them.

Auth, validation, media/storage and unit-test libraries remain pending; do not
install them as part of the ORM selection. Existing toolchain approvals and
unresolved peer/audit findings remain recorded in ADR-001 through ADR-005.

## ORM foundation installation (ADR-007)

The selected drizzle-orm 0.45.4, pg 8.23.1 and drizzle-kit 0.31.11 are now
installed and pinned in package.json/package-lock.json. Added server-only 0.0.1
(MIT) as a runtime import boundary. Node's built-in test runner adds no package.
No existing lockfile package version changed or path was removed; npm added 102
paths including optional cross-platform packages. The large text diff reflects
those additions and JSON key ordering, not an approved general dependency update.

Actual checks on 2026-10-15: seven configuration/import tests, Kit version check,
lint and build passed. Production audit passed with zero findings. Full audit
failed (exit 1): five existing high entries and four new moderate entries in
drizzle-kit -> @esbuild-kit/esm-loader -> @esbuild-kit/core-utils -> esbuild
0.18.20. The latter two esbuild-kit packages also emit deprecation warnings.
The esbuild advisory concerns development server request exposure:
[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
Do not treat the four affected-package entries as four independent flaws.

No audit fix, override or suggested downgrade to drizzle-kit 0.18.1 was applied.
The findings are open and require a separately reviewed resolution before release;
installation approval does not authorize a security exception. No Studio or
esbuild development server is started by this foundation. Existing ESLint peer
warnings remain under ADR-001. Real DB authentication, generated SQL, schema
constraints and migration compatibility are not verified by these import tests.

ADR-008 follow-up: real local authentication and Drizzle connectivity now pass
four integration cases using separate application LOGIN roles. PostgreSQL rejects
cross-database CONNECT in both directions; role checks confirm no administrative,
database/schema creation, TEMP or role membership privileges. No packages changed
in that follow-up, and no audit rerun or migration compatibility claim is implied.

## Phase 2 public QA, 2026-10-16

Project dependencies and lockfile unchanged in this public integration package.
User explicitly approved temporary npm exec Lighthouse 12.8.2 (Apache-2.0,
Node >=18.16, tested on Node 22.16). It is cached outside the project dependency
tree; no permanent dependency was installed. Reports are ignored test artifacts.

Fresh npm audit --omit=dev passed with zero vulnerabilities. Full npm audit
returned exit 1: the existing nine affected-package entries (five high in the
braces/micromatch/fast-glob/Next ESLint chain, four moderate in the Drizzle Kit
esbuild chain). No audit fix --force, override or suggested major downgrade was
applied. Release remains blocked on a reviewed dependency resolution.

## Phase 3.1 authentication dependency review (2026-10-16)

Approved exact dependencies: better-auth1.7.10 and @better-auth/drizzle-adapter
1.7.10, both MIT. Registry peer ranges match the existing Next16/React19, pg8 and
DrizzleORM0.45.4/Kit0.31.11. No auth CLI, mail SDK, QR library or additional
frontend HTTP dependency was installed. Use library password/session/MFA crypto.

Fresh full npm audit returned exit1 with the existing nine affected-package
entries (5 high ESLint chain,4 moderate Drizzle Kit/esbuild chain).
npm audit --omit=dev now returns exit1 with those4 moderate entries because
Better Auth declares Drizzle Kit as an optional peer; npm marks the already
installed dev tool chain devOptional. This is a change in runtime audit exposure
and must not be reported as a clean --omit=dev audit.
npm audit --omit=dev --omit=optional returned zero findings. That additional
result diagnoses the optional peer chain; it is not a production installation
policy or an approval to bypass the standard audit. No package was omitted,
removed, downgraded or force-fixed. Deployment installation policy and existing
advisory resolution remain separate reviewed release work.
