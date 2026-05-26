-- Creates private storage buckets, the app.application_belongs_to_my_cb()
-- helper, and RLS policies on storage.objects for CB_USER and ADMIN.
--
-- Path convention for the documents bucket: {applicationId}/{docType}/{filename}
-- split_part(name, '/', 1) extracts the applicationId from the object path.

-- ── Buckets ───────────────────────────────────────────────────────────────────
-- 26214400 bytes = 25 MB file size limit per object.
-- DO UPDATE ensures the limit is applied even if buckets were created earlier
-- with no limit (file_size_limit = NULL = unlimited).

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('documents',    'documents',    false, 26214400),
  ('surveillance', 'surveillance', false, 26214400)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

-- ── Helper ────────────────────────────────────────────────────────────────────
-- Returns true when the given application_id belongs to the calling user's CB.
-- SECURITY DEFINER so it can read "Application" past RLS.
-- Compares a.id::text rather than casting the input to uuid, so a malformed
-- path segment (non-UUID) simply returns false instead of raising an exception.

CREATE OR REPLACE FUNCTION app.application_belongs_to_my_cb(application_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Application" a
    WHERE a.id::text = application_id
    AND   a."cbId"   = app.user_cb_id()
  )
$$;

-- ── Storage policies — CB_USER ────────────────────────────────────────────────
-- CB_USER may SELECT/INSERT/UPDATE objects in the documents bucket
-- only for Applications belonging to their own CB.
-- Three separate policies (one per operation) for precise audit surface.

CREATE POLICY "cb_user_documents_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND app.user_role() = 'CB_USER'
    AND app.application_belongs_to_my_cb(split_part(name, '/', 1))
  );

CREATE POLICY "cb_user_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND app.user_role() = 'CB_USER'
    AND app.application_belongs_to_my_cb(split_part(name, '/', 1))
  );

CREATE POLICY "cb_user_documents_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND app.user_role() = 'CB_USER'
    AND app.application_belongs_to_my_cb(split_part(name, '/', 1))
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND app.user_role() = 'CB_USER'
    AND app.application_belongs_to_my_cb(split_part(name, '/', 1))
  );

-- ── Storage policies — ADMIN ──────────────────────────────────────────────────
-- ADMIN has unrestricted access to both buckets.
-- Two policies (one per bucket) so each bucket's access is independently auditable.

CREATE POLICY "admin_documents_all" ON storage.objects
  FOR ALL TO authenticated
  USING    (bucket_id = 'documents'    AND app.user_role() = 'ADMIN')
  WITH CHECK (bucket_id = 'documents' AND app.user_role() = 'ADMIN');

CREATE POLICY "admin_surveillance_all" ON storage.objects
  FOR ALL TO authenticated
  USING    (bucket_id = 'surveillance'    AND app.user_role() = 'ADMIN')
  WITH CHECK (bucket_id = 'surveillance' AND app.user_role() = 'ADMIN');
