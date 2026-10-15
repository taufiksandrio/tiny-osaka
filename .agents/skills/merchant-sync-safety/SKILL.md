---
name: merchant-sync-safety
description: Analyze or implement officially authorized GoFood/GrabFood API integration with manual Owner-only synchronization. Trigger for import, product mapping, sync toggles, retry or API changes.
---

# Merchant Sync Safety

1. Verify exact merchant API eligibility, docs and sandbox scope; merchant app login alone is insufficient.
2. Default OFF, never call real merchant write API without extra explicit approval.
3. Model canonical CMS products then adapters per provider; record external ID, expected revision/hash and separate results.
4. Separate Save, Approve, Preview Sync, Confirm Send; support per-provider toggles, safe retry/idempotency.
5. Require manual diff/confirmation for replacing catalogs or destructive payload semantics; reject unknown fields.
6. Mock HTTP and error scenarios (partial success, timeout, auth failure, rate limits). No live sync in unit/E2E.
7. Document compatibility and rollback constraints; stop for approval.
