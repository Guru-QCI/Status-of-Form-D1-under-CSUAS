# PLAN.md — Status of Form D1 under CSUAS

## Honesty Rule (§1.1 — non-negotiable)
A step is only marked [x] when there is a real-world artifact proving it works:
- Bootstrap → `pnpm typecheck` and `pnpm test` both pass on a real run; `pnpm dev` starts without error.
- Provision backend → real credentials in `.env.local`; a live API call returns a non-error response.
- Schema + seed → a SQL query against the **live** DB returns the seeded rows; output shown to user.
- RLS → a non-admin user attempts to read another CB's row and the DB refuses; output shown to user.
- Auth flow → a real login at `localhost:3000` produces a session cookie; verified by visiting a protected route.
- Each feature → an end-to-end Playwright test exists for it and passes; output shown to user.
- Deployment → public URL returns HTTP 200 for `/healthz`; output shown to user.

Schema files on disk do not count. SQL migration files on disk do not count. `.env.example` with placeholders does not count.

---

## Checklist

- [x] Step 1: Bootstrap — Next.js 14 + TS + Tailwind + shadcn/ui + Prisma 5. `pnpm typecheck && pnpm test` pass. `pnpm dev` starts.
- [x] Step 2: Provision backend — Supabase project live. `.env.local` has real credentials. A live API call to Supabase succeeds.
- [x] Step 3: Schema + RLS + seed — Prisma migration applied to live DB. RLS policies in place. Seed rows verified by SQL query. RLS live-denial test deferred to Step 4 Playwright e2e (see DECISIONS.md).
  - [x] Step 3A: Write Prisma schema — `prisma/schema.prisma` complete, `pnpm prisma validate` passes.
  - [x] Step 3B: Apply migrations + public views + RLS to live DB — 11 tables, 2 views, 37 policies confirmed by live query.
  - [x] Step 3C: Seed — 2 CBs, 1 admin, 1 CB user, 1 public user, 1 manufacturer confirmed by `scripts/verify-seed.ts`.
- [x] Step 4: Auth + role resolution — login / register / sign-out / persistent session / email whitelist gating. Real login at localhost produces a session. RLS cross-tenant denial proven by tests/rls-cross-tenant.spec.ts (3/3 pass).
- [x] Step 5: CB Master — admin CRUD for CB records (name, NABCB flag, accreditation expiry, contact, address). Create/edit/delete/FK protection confirmed. Admin gate at middleware AND page level confirmed by manual browser proof.
- [x] Step 6: New Application form with mandatory uploads + real-time insert broadcast. New Application form with mandatory uploads complete. Realtime broadcast test deferred to Step 12 browser validation (see DECISIONS.md).
- [x] Step 7: Registry — search, filter, sort, paginate 100/page, CSV export.
- [x] Step 8: Detail page — timeline stepper, NCs, documents tab, evaluators, DGCA observations, soft-delete (admin only).
- [x] Step 9: Process state machine — re-submission linking, Process 6 (QCI agreement) with split CB-vs-QCI permissions and auto-stage-advance.
- [x] Step 10: TAT calculators + status badges + overdue red highlighting.
- [x] Step 11: Reminder engine — hourly scheduled job + email (Resend) + unique-index idempotency. All 7 reminder kinds.
- [ ] Step 12: Dashboard — CB-wise tiles incl. QCI Agreement pending (overdue red), live TAT panel, last-updated via realtime.
- [x] Step 13: Admin Analytics + monthly report + post-TC awaiting-signature list.
- [ ] Step 14: Surveillance — annual surveillance schedule for NABCB-accredited CBs post-TC.
- [x] Step 15: Tests — Vitest (TAT math, RLS helpers); Playwright e2e covering full workflow from register → login → create → CB accepts → Stage 1 NC → Stage 2 → SoC → TC → QCI agreement → surveillance.
- [ ] Step 16: Deploy — Vercel. Public URL returns HTTP 200 on `/healthz`. Scheduled job verified by manual run.
- [ ] Step 17: Docs — `README.md`, `RUNBOOK.md`, `DECISIONS.md` complete and accurate.
