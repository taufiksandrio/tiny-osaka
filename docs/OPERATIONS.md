# Operations & Deployment (requirements + proposals)

## Environments
- Development: local reproducible; safe seed data only.
- Staging: on-demand before release, separate database/assets/secrets from production and auth protected/noindex.
- Production: manual developer-approved deploy after QA; HTTPS behind reverse proxy; no public debug endpoints.

## Hosting
Target < Rp250,000/month, not guaranteed. Propose compact Linux VPS + Node.js Next.js server + PostgreSQL; Nginx reverse proxy; systemd process; object storage and transactional email in free/low tiers after current pricing verification. Verify server memory under build/restart load and domain renewal costs. Never share production/staging DB.

## Jobs
Durable scheduled publishing, retry queue and observability. Record job state in DB, run via cron/worker with locking; idempotent jobs; alert when scheduled publication is late or sync failed. Avoid duplicate job dispatch after restart.

## Backup
Confirmed weekly backup on SAME production VPS. This does not protect against VPS loss, disk failure or total compromise. Mark as accepted HIGH risk. Set retention/restore plan, verify restore in isolated environment and monitor disk capacity; recommend revisiting offsite later, but do not override owner requirement.

## Monitoring
Track HTTP uptime, application exceptions, scheduled job failures and merchant sync outcomes. Avoid logging secrets, user PII and API payloads containing sensitive fields. Escalation/alerts to developer.

## Production release checklist
PR approved; branch reviewed; database migration reversible or documented; unit/integration/E2E/build/security checks passed; pages render ID/EN, SEO and analytics verified; backup tested; merchant sync OFF without approved access; staging QA; explicit manual deploy confirmation and rollback strategy.
