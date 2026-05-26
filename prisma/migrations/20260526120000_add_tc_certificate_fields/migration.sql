-- Add TC document path to Application
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "tcDocumentPath" TEXT;

-- Add storage bucket tracking to Document
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "storageBucket" TEXT NOT NULL DEFAULT 'documents';

-- Create public tc-certificates storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tc-certificates',
  'tc-certificates',
  true,
  10485760,  -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for tc-certificates bucket (public read, CB/admin write)

-- Anyone can view TC certificates (public bucket)
CREATE POLICY "tc_certificates_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tc-certificates');

-- Admins can upload/replace TC certificates
CREATE POLICY "tc_certificates_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tc-certificates'
    AND (SELECT app.user_role()) = 'ADMIN'
  );

-- CB users can upload TC certificates for their own CB's applications
CREATE POLICY "tc_certificates_cb_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tc-certificates'
    AND (SELECT app.user_role()) = 'CB_USER'
    AND split_part(name, '/', 1) IN (
      SELECT id FROM "Application" WHERE "cbId" = (SELECT app.user_cb_id())
    )
  );

-- Admins can update/replace TC certificates
CREATE POLICY "tc_certificates_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'tc-certificates'
    AND (SELECT app.user_role()) = 'ADMIN'
  );

-- CB users can update TC certificates for their own CB's applications
CREATE POLICY "tc_certificates_cb_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'tc-certificates'
    AND (SELECT app.user_role()) = 'CB_USER'
    AND split_part(name, '/', 1) IN (
      SELECT id FROM "Application" WHERE "cbId" = (SELECT app.user_cb_id())
    )
  );
