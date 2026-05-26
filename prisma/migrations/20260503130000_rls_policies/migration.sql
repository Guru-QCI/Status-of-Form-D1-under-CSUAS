-- ─── Step 3B-iii: Row-Level Security Policies ─────────────────────────────────
--
-- Live cross-tenant denial proof is deferred to Step 4 (Playwright e2e) because
-- no Supabase Auth users exist yet. Proof for this step: pg_policies returns the
-- expected rows. See DECISIONS.md "RLS live-denial test deferred to Step 4".

-- ─── Schema + helper functions ────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS app;

-- Returns the role of the current Supabase user as text (not the "Role" enum).
-- Returning text avoids blocking future enum migrations (see DECISIONS.md).
-- SECURITY DEFINER so it can read "AppUser" even after AppUser has RLS enabled.
CREATE OR REPLACE FUNCTION app.user_role()
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT role::text FROM "AppUser" WHERE id = auth.uid()::text
$$;

-- Returns the cbId of the current CB user, or NULL for other roles.
CREATE OR REPLACE FUNCTION app.user_cb_id()
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT "cbId" FROM "AppUser" WHERE id = auth.uid()::text
$$;

GRANT EXECUTE ON FUNCTION app.user_role()  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION app.user_cb_id() TO authenticated, anon;

-- ─── Grant DML to authenticated (RLS provides row-level control) ──────────────
-- Broad grants are intentional; RLS policies below are the enforcement layer.

GRANT SELECT, INSERT, UPDATE, DELETE ON "AppUser"              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CB"                   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Manufacturer"         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Application"          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Document"             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApplicationEvaluator" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "NonConformity"        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DgcaObservation"      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SurveillanceAudit"    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApplicationEvent"     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Reminder"             TO authenticated;

-- Views are owned by postgres (superuser) and not security_invoker, so they
-- bypass RLS on underlying tables. Column selection is the access control.
GRANT SELECT ON "public_application_timeline"  TO anon, authenticated;
GRANT SELECT ON "public_surveillance_schedule" TO anon, authenticated;

-- ─── Enable RLS ───────────────────────────────────────────────────────────────

ALTER TABLE "AppUser"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CB"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Manufacturer"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Application"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApplicationEvaluator" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NonConformity"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DgcaObservation"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SurveillanceAudit"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApplicationEvent"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reminder"             ENABLE ROW LEVEL SECURITY;

-- ─── Policies: AppUser ────────────────────────────────────────────────────────

CREATE POLICY "appuser_admin_all" ON "AppUser"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "appuser_self_select" ON "AppUser"
  FOR SELECT
  USING (id = auth.uid()::text);

CREATE POLICY "appuser_self_update" ON "AppUser"
  FOR UPDATE
  USING     (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

-- ─── Policies: CB (master data — all authenticated can read; admin writes) ────

CREATE POLICY "cb_admin_all" ON "CB"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "cb_authenticated_select" ON "CB"
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ─── Policies: Manufacturer (same pattern as CB) ──────────────────────────────

CREATE POLICY "manufacturer_admin_all" ON "Manufacturer"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "manufacturer_authenticated_select" ON "Manufacturer"
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ─── Policies: Application ────────────────────────────────────────────────────

CREATE POLICY "application_admin_all" ON "Application"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "application_cb_select" ON "Application"
  FOR SELECT
  USING (app.user_role() = 'CB_USER' AND "cbId" = app.user_cb_id());

CREATE POLICY "application_cb_insert" ON "Application"
  FOR INSERT
  WITH CHECK (app.user_role() = 'CB_USER' AND "cbId" = app.user_cb_id());

CREATE POLICY "application_cb_update" ON "Application"
  FOR UPDATE
  USING     (app.user_role() = 'CB_USER' AND "cbId" = app.user_cb_id())
  WITH CHECK (app.user_role() = 'CB_USER' AND "cbId" = app.user_cb_id());

-- ─── Policies: Document ───────────────────────────────────────────────────────

CREATE POLICY "document_admin_all" ON "Document"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "document_cb_select" ON "Document"
  FOR SELECT
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "document_cb_insert" ON "Document"
  FOR INSERT
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "document_cb_update" ON "Document"
  FOR UPDATE
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  )
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

-- ─── Policies: ApplicationEvaluator ──────────────────────────────────────────

CREATE POLICY "evaluator_admin_all" ON "ApplicationEvaluator"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "evaluator_cb_select" ON "ApplicationEvaluator"
  FOR SELECT
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "evaluator_cb_insert" ON "ApplicationEvaluator"
  FOR INSERT
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "evaluator_cb_update" ON "ApplicationEvaluator"
  FOR UPDATE
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  )
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

-- ─── Policies: NonConformity ──────────────────────────────────────────────────

CREATE POLICY "nc_admin_all" ON "NonConformity"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "nc_cb_select" ON "NonConformity"
  FOR SELECT
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "nc_cb_insert" ON "NonConformity"
  FOR INSERT
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "nc_cb_update" ON "NonConformity"
  FOR UPDATE
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  )
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

-- ─── Policies: DgcaObservation ────────────────────────────────────────────────

CREATE POLICY "dgca_obs_admin_all" ON "DgcaObservation"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "dgca_obs_cb_select" ON "DgcaObservation"
  FOR SELECT
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "dgca_obs_cb_insert" ON "DgcaObservation"
  FOR INSERT
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "dgca_obs_cb_update" ON "DgcaObservation"
  FOR UPDATE
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  )
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

-- ─── Policies: SurveillanceAudit ──────────────────────────────────────────────

CREATE POLICY "surveillance_admin_all" ON "SurveillanceAudit"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "surveillance_cb_select" ON "SurveillanceAudit"
  FOR SELECT
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "surveillance_cb_insert" ON "SurveillanceAudit"
  FOR INSERT
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "surveillance_cb_update" ON "SurveillanceAudit"
  FOR UPDATE
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  )
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

-- ─── Policies: ApplicationEvent ───────────────────────────────────────────────

CREATE POLICY "event_admin_all" ON "ApplicationEvent"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "event_cb_select" ON "ApplicationEvent"
  FOR SELECT
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

-- CB_USER may INSERT events (they write audit trail entries as they progress
-- applications). No UPDATE policy: audit trail rows are immutable (§12).
CREATE POLICY "event_cb_insert" ON "ApplicationEvent"
  FOR INSERT
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

-- ─── Policies: Reminder ───────────────────────────────────────────────────────

CREATE POLICY "reminder_admin_all" ON "Reminder"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');

CREATE POLICY "reminder_cb_select" ON "Reminder"
  FOR SELECT
  USING (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

CREATE POLICY "reminder_cb_insert" ON "Reminder"
  FOR INSERT
  WITH CHECK (
    app.user_role() = 'CB_USER' AND
    EXISTS (SELECT 1 FROM "Application" a
            WHERE a.id = "applicationId" AND a."cbId" = app.user_cb_id())
  );

-- ─── Trigger: protect qciSignedDate and qciSignedById (§4.1, §6 step 4) ──────
-- Column-level RLS does not exist in PostgreSQL; a BEFORE UPDATE trigger is the
-- correct enforcement mechanism. auth.uid() IS NULL when running as postgres
-- (migrations, seed) so the guard is skipped in that context.

CREATE OR REPLACE FUNCTION public.check_qci_sign_permission()
  RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW."qciSignedDate" IS DISTINCT FROM OLD."qciSignedDate"
          OR  NEW."qciSignedById" IS DISTINCT FROM OLD."qciSignedById")
     AND app.user_role() IS DISTINCT FROM 'ADMIN'
  THEN
    RAISE EXCEPTION 'Only QCI admins may set qciSignedDate or qciSignedById';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_qci_sign_admin
  BEFORE UPDATE ON "Application"
  FOR EACH ROW
  EXECUTE FUNCTION public.check_qci_sign_permission();
