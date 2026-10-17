# Operations & Deployment (requirements + proposals)

## Environments
- Development: local reproducible; safe seed data only.
- Staging: on-demand before release, separate database/assets/secrets from production and auth protected/noindex.
- Production: manual developer-approved deploy after QA; HTTPS behind reverse proxy; no public debug endpoints.

## Hosting
Target < Rp250,000/month, not guaranteed. Propose compact Linux VPS + Node.js Next.js server + PostgreSQL; Nginx reverse proxy; systemd process; object storage and transactional email in free/low tiers after current pricing verification. Verify server memory under build/restart load and domain renewal costs. Never share production/staging DB.

## Jobs
Durable scheduled publishing, retry queue and observability. Record job state in DB, run via cron/worker with locking; idempotent jobs; alert when scheduled publication is late or sync failed. Avoid duplicate job dispatch after restart.

Phase 3.5 implements a foreground local dev/test worker; it is not automatically
started by Next.js. Scheduled jobs remain pending until it is explicitly run.
After separately authorizing execution against local development content:

```powershell
npm run publishing:once
npm run publishing:watch
```

Both load ignored `.env.cms.local`, use the isolated local CMS role (one DB
connection) and reject cloud/production URLs. `--once` consumes at most 25 due
jobs; `--watch` repeats bounded batches every 5 seconds. Ctrl+C stops the worker.
No browser session or migrator/admin credential is used. No public worker HTTP
endpoint exists. Never expose a worker trigger to the internet.

Synthetic test-only execution may use explicit environment files:

```powershell
$env:PUBLIC_DATABASE_TARGET = 'test'
node --conditions=react-server --env-file=.env.cms.local scripts/publication-worker.mjs --once
Remove-Item Env:PUBLIC_DATABASE_TARGET
```

Use only after test fixtures are cleaned; do not mix concurrent QA runs. Test
and dev credentials must remain in private local files. Do not log environment
values. The CLI emits job ID/version/status, attempt count, next time and safe
failure code; database exceptions are redacted. Monitor nonzero process exits,
terminal failed jobs, and `status='scheduled' AND next_attempt_at < now()` delayed
jobs through the authenticated queue or trusted read-only operator query. Failed
jobs require investigation and a new Owner schedule; no infinite retry/reset UI.
There is no configured external alert channel yet. Review late jobs after downtime
before restarting a worker. Service/cron registration, production credentials,
monitoring delivery and any Railway linking/deployment require separate approval.

## Backup

Phase 3.4 local media lives under `.media/dev` (development) and `.media/test`
(isolated QA), outside public assets and ignored by Git. Preserve the development
directory across app rebuilds/checkouts. A future approved production backup must
capture both database and media bytes consistently; Git is not a media backup.
Do not prune immutable files automatically. A process crash between immutable
file creation and metadata commit can leave an orphan; investigate against the
database before any separately approved cleanup. Rejected uploads and failures
before completed metadata registration remove only their own new files. If a
COMMIT acknowledgement is lost, retain the bytes for reconciliation rather than
delete a possibly committed asset.

Video is optional until the operator installs trusted FFmpeg and ffprobe and sets
absolute `FFMPEG_PATH` / `FFPROBE_PATH` in private `.env.local`. The application
never downloads binaries. Check with
`node --conditions=react-server --env-file=.env.local scripts/check-media-prerequisites.mjs`.
Missing tools disable video upload; fake MIME metadata cannot bypass inspection.
Supported delivery codecs are H.264/AAC in MP4 and VP8/VP9/AV1 with Opus/Vorbis
in WebM; no transcoding is performed. Poster images must be uploaded first.
Confirmed weekly backup on SAME production VPS. This does not protect against VPS loss, disk failure or total compromise. Mark as accepted HIGH risk. Set retention/restore plan, verify restore in isolated environment and monitor disk capacity; recommend revisiting offsite later, but do not override owner requirement.

## Monitoring
Track HTTP uptime, application exceptions, scheduled job failures and merchant sync outcomes. Avoid logging secrets, user PII and API payloads containing sensitive fields. Escalation/alerts to developer.

## Production release checklist
PR approved; branch reviewed; database migration reversible or documented; unit/integration/E2E/build/security checks passed; pages render ID/EN, SEO and analytics verified; backup tested; merchant sync OFF without approved access; staging QA; explicit manual deploy confirmation and rollback strategy.
