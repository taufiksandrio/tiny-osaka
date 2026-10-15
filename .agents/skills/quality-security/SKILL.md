---
name: quality-security
description: Run or plan repeatable tests, security reviews and release quality gates. Trigger for PR review, bug fix, release, dependency update or security-sensitive changes.
---

# Quality Security

1. Build a checklist from docs/SECURITY_AND_QA.md for changed features.
2. Require lint/build, unit, integration and relevant Playwright E2E; prevent network calls to production APIs.
3. Review RBAC/CSRF/session/inputs/upload sanitization/secrets/logging and dependency vulnerabilities.
4. Check bilingual routes, CTA event duplicate handling, sitemap/publication state and mobile performance.
5. Report commands and honest passed/failed/not run, residual risks and rollback. Never auto-deploy.
