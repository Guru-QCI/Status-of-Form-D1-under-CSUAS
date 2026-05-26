# RESUME.md

Status: **Step 15 complete (80 unit tests across state-machine, tat, reminders pure logic). All foundational work and feature work done. PAUSED before Step 16 — user is consulting QCI IT about production infrastructure choice (database location, storage, auth, data residency). Resume Step 16 (deploy) once decision is made. Step 17 (docs including MIGRATION.md) follows.**

## What's done
- Step 1 (Bootstrap): Next.js 14.2.35 + TypeScript 5.9 + Tailwind 3.4 + shadcn/ui layout + Prisma 5.22 scaffolded. `pnpm typecheck` / `pnpm test` / `pnpm dev` all pass.
- Step 2 (Provision backend): Supabase project reachable with real credentials.
  - PROOF 1: `supabase.auth.admin.listUsers` → `{ "users_returned": 0 }` (success, no users yet)
  - PROOF 2: Direct Postgres via `pg` → `PostgreSQL 17.6 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`
- Step 3 (Schema + RLS + seed): Live database fully provisioned.
  - PROOF 1 (3B): 12 tables in public schema (11 schema + `_prisma_migrations`) — `scripts/verify-tables.ts`
  - PROOF 2 (3B): 2 views (`public_application_timeline`, `public_surveillance_schedule`) — `scripts/verify-views.ts`
  - PROOF 3 (3B): 37 RLS policies across all 11 tables — `scripts/verify-policies.ts`
  - PROOF 4 (3C): 9 seed rows confirmed — `scripts/verify-seed.ts`:
    - CB: 3 rows (Bureau Veritas NABCB-accredited, Indian Register Quality Systems, Test CB Beta)
    - AppUser: 4 rows (ADMIN, 2× CB_USER, PUBLIC)
    - Manufacturer: 1 row (DroneTech India Pvt. Ltd.)
    - EmailWhitelist: 4 rows
- Step 4 (Auth + role resolution): Full auth flow live.
  - PROOF 1: Real login at localhost:3000 → session cookie set → /dashboard accessible with correct name/role displayed.
  - PROOF 2: RLS cross-tenant denial — `tests/rls-cross-tenant.spec.ts` 3/3 pass.
- Step 5 (CB Master): Admin CRUD for CB records confirmed by browser proof.
- Step 6 (New Application form): Mandatory uploads + real-time insert broadcast confirmed.
- Step 7 (Registry): Search, filter, sort, paginate, CSV export confirmed.
- Step 8 (Detail page): Timeline stepper, NCs, documents tab, evaluators, DGCA observations confirmed.
- Step 9 (Process state machine): Re-submission linking, QCI agreement, auto-stage-advance confirmed.
- Step 10 (TAT calculators): Status badges, overdue red highlighting, daysElapsed column confirmed.
- Step 11 (Reminder engine): `lib/reminders.ts` pure computation, `/api/cron/reminders` with Bearer auth, `lib/email.ts` Resend wrapper, Detail.tsx Reminders section. Cron returns `{"ok":true}` confirmed.
- Step 12 (Dashboard): Admin KPI cards + Realtime subscription + CB dashboard confirmed.
- Step 13 (Analytics): `/analytics` with recharts pie + bar charts, TAT averages, NC counts confirmed.
- Step 14 (Surveillance): State machine extended to POST_TC_SURVEILLANCE, `scheduleSurveillance`/`closeSurveillance` actions, Detail.tsx Surveillance section confirmed.
- Step 15 (Tests): 80 unit tests passing — `tests/state-machine.spec.ts` (29), `tests/tat.spec.ts` (25), `tests/reminders.spec.ts` (26). Duration 399ms.

## What's next
Step 16 (Deploy) — pending QCI IT infrastructure decision (database location, storage, auth, data residency).
Step 17 (Docs) — `README.md`, `RUNBOOK.md`, `DECISIONS.md`, `MIGRATION.md`.

## To resume
Open Claude Code in this folder and say: "Continue from RESUME.md — start Step 16."
