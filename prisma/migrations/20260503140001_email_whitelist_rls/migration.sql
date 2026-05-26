-- RLS for EmailWhitelist
-- "whitelist_self_check" allows any caller (including anon) to SELECT all rows.
-- This is intentional: the whitelist is a public allowlist — knowing an email
-- is on it is not a secret; the password is. The signup page needs this SELECT
-- to gate registrations before a Supabase auth session exists.
-- "whitelist_admin_all" is the only write path; all mutations require ADMIN role.

ALTER TABLE "EmailWhitelist" ENABLE ROW LEVEL SECURITY;

GRANT SELECT                 ON "EmailWhitelist" TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON "EmailWhitelist" TO authenticated;

CREATE POLICY "whitelist_self_check" ON "EmailWhitelist"
  FOR SELECT
  USING (true);

CREATE POLICY "whitelist_admin_all" ON "EmailWhitelist"
  FOR ALL
  USING     (app.user_role() = 'ADMIN')
  WITH CHECK (app.user_role() = 'ADMIN');
