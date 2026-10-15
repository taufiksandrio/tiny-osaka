---
name: feature-planning
description: Produce an approval-gated, scoped plan before any code changes or installs. Trigger for every requested feature, bug, bootstrap or refactor.
---

# Feature Planning

1. Read AGENTS.md, requirement sections, current files/status read-only.
2. Specify intended behavior and identify existing baseline/known unknowns.
3. Propose smallest logical change, affected files, alternative and version/licensing implications.
4. Enumerate acceptance tests, monitoring/security/SEO implications and rollback.
5. Output exact proposed commands and STOP for explicit user approval. Never implement in the same response unless previously approved.
6. After approved edits, show exact diff/test results and request separate commit/deploy authorization.
