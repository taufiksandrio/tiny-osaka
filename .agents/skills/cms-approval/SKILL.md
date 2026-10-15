---
name: cms-approval
description: Implement or review secure fixed-template CMS, auth role permissions and revision-based review/publishing. Trigger for admin, page editor, scheduling, media or account changes.
---

# Cms Approval

1. Load requirements + security docs; map Owner vs Staff actions server-side.
2. Design statuses and revision model; staff edit/submit only, Owner approve/publish/schedule/archive.
3. Ensure approval is tied to immutable revision and edits never overwrite live copy prematurely.
4. Apply server-enforced 24h absolute/1h idle sessions, reset email/MFA, audit events, sanitize text/embeds and uploads.
5. Persistence and scheduler need atomic transitions, consistent time zone Asia/Jakarta and idempotence.
6. Write denial tests for forged staff API calls and time-bound publication. Seek approval before changes.
