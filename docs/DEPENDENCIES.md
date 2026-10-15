# Dependency Selection — validation matrix (NOT install instructions)

All versions are pending selection. Codex must verify current official docs, OSS license, current project compatibility, API stability, JavaScript (not TS-only) ergonomics and 2GB VPS resource implications before proposal.

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
