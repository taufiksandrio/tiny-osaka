@AGENTS.md

# Claude Code — catatan singkat

## Peta project

- Publik: `src/app/(site)`, `src/features/public-site`
- Admin CMS: `src/app/admin`, `src/features/cms`, `src/app/api`
- Server: `src/server/{auth,catalog,cms,db,media,pages,public,publishing}`
- Skema & migrasi: `drizzle/`, `drizzle.config.mjs`
- Test: `tests/{unit,integration,e2e,*-e2e}`; semua script ada di `package.json`
- Skill domain: `.agents/skills/*/SKILL.md` (baca yang relevan saja)

## Sub-agen (`.claude/agents/`)

Alur: `pm` (spec di `docs/specs/`) → setujui user → `backend` → `frontend` → `qa`.
Agen berbagi konteks lewat file spec, bukan lewat prompt panjang.

## Hemat token

- Dokumen besar — jangan dibaca utuh, pakai Grep: `README.md`, `docs/DECISIONS.md`, `docs/SECURITY_AND_QA.md`, `docs/DATA_CONTRACTS.md`, `docs/PHASE2_PLAN.md`, `docs/PHASE3_PLAN.md`.
- Tugas kecil (satu file / beberapa baris) kerjakan langsung tanpa sub-agen.

## Alur fitur

Jika user meminta fitur ke agen pm:

1. Jalankan agen pm → tampilkan ringkasan spec → STOP, tunggu persetujuan.
2. Setelah user menyetujui, lanjutkan otomatis: backend (jika perlu) → frontend (jika perlu) → qa.
3. Jika qa menemukan bug, kirim ke agen yang relevan lalu ulangi qa (maks 2 putaran).
4. Laporkan ringkasan akhir. Jangan commit/push tanpa izin.
