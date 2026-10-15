---
name: release-operations
description: Plan or carry out approved staging QA, Linux VPS release, backups and monitoring. Trigger for deployment, scheduled jobs, production incident or migration.
---

# Release Operations

1. Read docs/OPERATIONS.md; confirm exact environment and secrets separation.
2. Staging is on demand, isolated and noindexed; run acceptance tests and capture report.
3. Production release requires explicit fresh permission; migrations/backups/rollback must be stated.
4. Weekly backup is same VPS only and cannot recover total VPS loss. Validate restore and monitor disk.
5. Monitor uptime, errors, publishing jobs and sync outcomes; use safe log redaction.
6. Never commit/push/deploy or mutate production without explicit user approval.
