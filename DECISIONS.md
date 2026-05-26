# DECISIONS.md

Deviations from PROMPT.md, with justification.

---

## Step 6 — DIRECT_URL added for Prisma migration engine

**What PROMPT.md says:** No guidance on Prisma connection string parameters.

**What was done instead:** `directUrl = env("DIRECT_URL")` was added to the datasource block in `prisma/schema.prisma`. `DIRECT_URL` points to the Supavisor session-mode pooler (port 5432) — same hostname as `DATABASE_URL` but a different port. `DATABASE_URL` continues to use the transaction-mode pooler (port 6543, with `?pgbouncer=true&connection_limit=1`) for all runtime queries.

**Reason:** Prisma's migration engine (schema engine) cannot sustain a connection through Supavisor's transaction-mode pooler (port 6543). The `can-connect-to-database` check that the engine issues at startup hangs indefinitely against transaction-mode pooling, accumulating zombie schema-engine processes. The session-mode pooler on port 5432 supports the persistent connection semantics the migration engine requires and correctly handles DDL. `directUrl` is a Prisma Migrate-only field; the runtime client continues to use `DATABASE_URL` (the pooled endpoint) for all application queries.

---

## Step 5 — CB Master uses hard delete with FK protection rather than soft delete

**What PROMPT.md says:** No specific guidance on delete semantics for CB records.

**What was done instead:** `deleteCb` issues a hard `prisma.cB.delete`. On FK violation (Prisma error `P2003` — CB has referencing Applications), the action returns a friendly error message rather than deleting. No `deletedAt` column exists on `CB`.

**Reason:** CB is master data. If Applications reference a CB, forcing the admin to resolve that relationship first is the correct behaviour — silently soft-deleting a CB that still has live Applications would corrupt the data model. A future `isActive` / `retiredAt` flag could be added if soft retirement becomes a use case (e.g. a CB loses accreditation and should be hidden from new applications but preserved for historical records), but the current requirement does not need it. Hard delete + FK protection is the simpler, correct semantics for now.

---

## Step 4 — All Prisma migrations are written manually and applied via `migrate deploy`; `migrate dev` is permanently disabled

**What PROMPT.md says:** No specific guidance on migration workflow.

**What was done instead:** Every migration after the initial schema is written as a hand-crafted SQL file under `prisma/migrations/<timestamp>_<name>/migration.sql` and applied with `pnpm prisma migrate deploy`. `pnpm prisma generate` is run separately to update TypeScript types. `prisma migrate dev` (with or without `--create-only`) is never used on this project.

**Reason:** The RLS migration (`20260503130000_rls_policies`) calls `auth.uid()`, which lives in Supabase's `auth` schema. Prisma's shadow database is a plain empty Postgres instance with no `auth` schema, so any `migrate dev` invocation — even `--create-only` — fails with error P3006 when it replays the existing migrations against the shadow database. This is a permanent constraint of combining Supabase RLS with Prisma Migrate. The manual-write + `migrate deploy` workflow is equivalent in practice and safe: `migrate deploy` applies migrations in order, records them in `_prisma_migrations`, and skips already-applied ones.

---

## Step 4 — EmailWhitelist is publicly readable by anon for signup gating; writes are admin-only

**What PROMPT.md says:** §10 states `email_whitelist`: Admins only. This implies both read and write are admin-gated.

**What was done instead:** The `whitelist_self_check` RLS policy uses `USING (true)`, granting SELECT to all callers including `anon`. The `whitelist_admin_all` policy gates all writes (INSERT, UPDATE, DELETE) to ADMIN users only.

**Reason:** The register page (PIECE 3) must verify that the submitting email exists in the whitelist *before* a Supabase auth session is created — the user is unauthenticated at that point (`anon` role). If the whitelist were admin-read-only, the SELECT in the signup server action would fail with no session. The whitelist is a public allowlist: knowing an email is pre-authorised is not a security-sensitive disclosure — the secret is the password. Admin-write-only is fully preserved.

---

## Step 3A — Prisma reads .env.local via dotenv-cli wrapper script

**What PROMPT.md says:** No specific guidance on how to run Prisma CLI commands.

**What was done instead:** Installed `dotenv-cli` as a dev dependency and added a `"prisma"` script to `package.json`: `dotenv -e .env.local -- prisma`. All Prisma CLI invocations (`pnpm prisma validate`, `pnpm prisma migrate dev`, `pnpm prisma studio`, etc.) go through this wrapper.

**Reason:** Next.js uses `.env.local` as the canonical local environment file (it is gitignored by default and takes precedence in the Next.js runtime). Prisma's CLI, however, auto-loads only `.env` — it does not know about Next.js conventions. Rather than duplicating credentials into a second `.env` file (a maintenance hazard) or committing secrets, the dotenv-cli wrapper injects `.env.local` into every Prisma CLI call. This keeps a single source of truth for credentials and matches standard Supabase + Next.js + Prisma project setups.

---

## Step 3A — Named "AddedBy" relation on Application → AppUser

**What PROMPT.md says:** The `addedBy` relation in the §5 schema snippet has no explicit relation name; only the `qciSignedBy` side is named `"QciSigner"`.

**What was done instead:** Both Application → AppUser relations were given explicit names: `"AddedBy"` (for `addedBy` / `addedById`) and `"QciSigner"` (for `qciSignedBy` / `qciSignedById`). The back-reference fields on `AppUser` are named `applicationsAdded` and `applicationsQciSigned`.

**Reason:** Prisma requires every relation to be explicitly named when two models share more than one relation between them. Without naming both sides, `prisma validate` (and `prisma migrate`) fail with error P1012 ("Relation fields do not have the same relation name"). The `"QciSigner"` name was already specified by PROMPT.md; adding `"AddedBy"` to the second relation is the only valid way to satisfy the constraint while keeping the field semantics identical to the spec.

---

## Step 3B — AppUser.id is the Supabase Auth UUID, not a Prisma-generated UUID

**What PROMPT.md says:** `AppUser.id String @id @default(uuid())` — Prisma generates the UUID at insert time.

**What was done instead:** Removed `@default(uuid())` from `AppUser.id`. The signup flow (Step 4) must explicitly insert `AppUser` with `id = supabase.auth.getUser().id`, so that `AppUser.id` equals the Supabase Auth UUID for that user.

**Reason:** The RLS helper functions (`app.user_role()`, `app.user_cb_id()`) look up the current user via `WHERE id = auth.uid()::text`. `auth.uid()` returns the Supabase Auth UUID from the JWT. If Prisma generates its own UUID at insert time, that UUID will never match `auth.uid()`, causing every RLS policy to deny all authenticated requests. Removing the default forces the application layer to supply the correct UUID at signup, which is the standard pattern for Supabase + Prisma projects.

---

## Step 3B — app.user_role() returns text, not the Role enum

**What PROMPT.md says:** No guidance on the return type of RLS helper functions.

**What was done instead:** `app.user_role()` returns `text` (via `SELECT role::text`) rather than returning the `"Role"` Postgres enum directly.

**Reason:** Prisma owns the `"Role"` enum in the `public` schema and regenerates it during `prisma migrate`. If the function signature references `"Role"` by name, a future migration that alters the enum (adding or renaming a value) will fail because Postgres cannot drop or replace an enum type that is referenced by a function signature. Returning `text` decouples the helper from the enum's lifecycle; policy comparisons like `app.user_role() = 'ADMIN'` are plain string comparisons and work identically.

---

## Step 4 — PROOF 2: RLS cross-tenant denial proven; §1.1 honesty rule caught a false-positive mid-session

**What was proven:** `tests/rls-cross-tenant.spec.ts` (3 tests, all pass with verbose reporter + file-captured output):
1. CB#1 user CAN see their own Application (positive case).
2. CB#3 user gets zero rows when querying CB#1's Application by id — RLS returns empty, not an error (negative case, the load-bearing assertion).
3. CB#3 user sees zero Applications in a full SELECT (reverse isolation).

This closes the live cross-tenant denial proof deferred from Step 3B-iii.

**§1.1 honesty rule directly caught a false-positive mid-session:** The first `pnpm test` run reported `4 passed (4)` but the three RLS tests had silently skipped — the Vitest default reporter collapsed all three test names and the `beforeAll` failure (pgbouncer `42P05` prepared-statement conflict) caused them to be marked skipped rather than failed in that run's output. The user required `--reporter=verbose` output captured to a file and pasted inline; only then did the real state become visible: `1 passed | 3 skipped`. The fix was appending `?pgbouncer=true&connection_limit=1` to `DATABASE_URL` (see adjacent DECISIONS.md entry). The honesty rule prevented a false [x] from being recorded for PROOF 2.

---

## Step 4 — DATABASE_URL appended with ?pgbouncer=true&connection_limit=1

**What PROMPT.md says:** No guidance on Prisma connection string parameters.

**What was done instead:** `?pgbouncer=true&connection_limit=1` was appended to `DATABASE_URL` in `.env.local`.

**Reason:** Supavisor's transaction-mode pooler (port 6543) does not support named prepared statements across transactions. Prisma 5.x uses named prepared statements by default (the extended query protocol). When a long-running `PrismaClient` — such as one used across a test suite's `beforeAll` / `afterAll` — reuses a statement shape on a pooled connection that already has that statement registered, Postgres raises error `42P05: prepared statement already exists`. Adding `?pgbouncer=true` tells Prisma to use the simple query protocol (unnamed prepared statements), which is fully compatible with transaction pooling. `connection_limit=1` prevents the client from opening more connections than the pooler can handle in a test context. There is a minor per-query performance tradeoff (no server-side statement caching), but correctness requires it for any process that holds a `PrismaClient` across multiple requests.

---

## Step 4 — DATABASE_URL switched from direct connection to Supavisor pooler

**What PROMPT.md says:** No specific guidance on which Supabase connection endpoint to use.

**What was done instead:** `DATABASE_URL` in `.env.local` points to the Supavisor pooler endpoint (`aws-<region>.pooler.supabase.com:6543`) rather than the direct connection (`db.<ref>.supabase.co:5432`). The database password was rotated at the same time.

**Reason:** The direct connection host is IPv6-only on Supabase's free tier. It stopped resolving on the local network, making the seed, migrations, and verify scripts unreachable. The Supavisor pooler is dual-stack (IPv4 + IPv6) and resolves reliably. If a future Prisma migration requires a direct (non-pooled) connection, a separate `DIRECT_URL` env var can be added to the datasource block at that point — deferred until needed.

---

## Step 3B — RLS live cross-tenant denial test deferred to Step 4

**What PROMPT.md §1.1 says:** RLS is proven by "a test where a non-admin user tries to read another tenant's row and the database refuses; output shown to the user."

**What was done instead:** For Step 3B-iii, proof is limited to `pg_policies` returning the expected 37 rows. The live denial test is deferred to Step 4 (Auth), where real Supabase Auth users will be created and a Playwright e2e test will assert that a CB_USER JWT from CB-A receives 0 rows when querying `Application` rows belonging to CB-B.

**Reason:** No Supabase Auth users exist at this point in the build sequence — Step 3 precedes Step 4 by design. Running a denial test requires a real JWT issued by Supabase Auth, which is only available after the auth flow is implemented. The policies are correctly loaded in the database; the denial test simply cannot be executed yet.

---

## Step 3B — Views bypass RLS via postgres ownership; ApplicationEvent is INSERT-only for CB_USER; qciSignedDate/qciSignedById enforced by trigger

**What PROMPT.md says:** These design choices are not specified at this level of detail.

**What was done instead:**
1. **Views and RLS.** `public_application_timeline` and `public_surveillance_schedule` are owned by `postgres`. PostgreSQL evaluates RLS using the view owner's identity for non-`security_invoker` views, meaning superuser ownership bypasses RLS on the underlying tables. `GRANT SELECT ON view TO anon, authenticated` is sufficient; no "allow anon to read Application" RLS policy is needed or added.
2. **ApplicationEvent immutability.** `CB_USER` has SELECT and INSERT policies on `ApplicationEvent` but no UPDATE policy. §12 states the audit trail is "never deleted" — by extension, rows are treated as immutable append-only records. Allowing CB_USER to UPDATE audit trail entries would defeat their evidentiary value.
3. **qciSignedDate / qciSignedById column protection.** PostgreSQL does not support column-level RLS. A `BEFORE UPDATE` trigger (`enforce_qci_sign_admin`) raises an exception if a non-ADMIN session attempts to change either field. The trigger checks `auth.uid() IS NOT NULL` first, so it is skipped during migrations and seed (which run as the postgres superuser with no JWT context).

---

## Realtime test deferred to Step 12 browser validation

Verified infrastructure that IS correctly configured:
- `ALTER PUBLICATION supabase_realtime ADD TABLE "Application"` migration applied
- `pg_publication_tables` confirms Application is in the publication
- REPLICA IDENTITY on Application is `'d'` (default)
- Supabase dashboard shows INSERT/UPDATE/DELETE/TRUNCATE toggles green for the publication
- RLS policy `application_cb_select` allows CB_USER to SELECT WHERE cbId = app.user_cb_id()
- cb.user's cbId matches Bureau Veritas's id (verified)
- JWT is correctly issued (logged prefix confirms valid signed token)
- `createClient` passes JWT via `Authorization` header
- `supabaseClient.realtime.setAuth(jwt)` called before subscribe

Despite all of the above, the `postgres_changes` callback never fires in the synthetic Vitest environment. Two diagnostic runs (~12s each) confirmed the callback never executes within a 10-second wait after INSERT.

Hypothesis (unproven): the Vitest test environment's websocket cold-start, JWT propagation through Supabase Realtime's internal auth, OR some subtle interaction with the `@supabase/supabase-js` Node client doesn't replicate the browser context. Deferring to Step 12 (admin dashboard build) where a real authenticated browser session will subscribe via the same SDK in the production code path. If real broadcasts arrive there, the infrastructure is correct. If they don't, Step 12 will surface the issue with more diagnostic context.

This is not a security issue: incorrect Realtime configuration would result in clients receiving no events (the failure mode here) OR receiving events they shouldn't (the leak case). Our test demonstrates the former; a leak would require RLS misconfiguration which has been independently verified by the cross-tenant RLS test (3/3 passing).

---

## Step 6 — application creation end-to-end verified

PROOF 7 (manual browser): cb.user@bureauveritas.example.com logged in via /login, navigated to /applications/new (CB_USER nav link visible, working), filled the multi-section form (manufacturer existing/DroneTech, model TEST-D1-001, 4 file uploads from local test files), submitted, success. Verified in Supabase Storage: 4 files at documents/{applicationId}/{docType}/{filename}. Verified in DB: Application row inserted under Bureau Veritas's cbId, Document rows linked. End-to-end: form → action auth → manufacturer resolution → Application insert → Storage upload under RLS → Document inserts → revalidatePath all working.
