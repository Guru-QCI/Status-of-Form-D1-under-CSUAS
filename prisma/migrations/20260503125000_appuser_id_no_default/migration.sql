-- Remove the server-side uuid default from AppUser.id.
-- The application layer (Step 4 signup flow) must supply id = auth.uid()
-- so that AppUser.id matches the Supabase Auth user UUID, allowing the
-- app.user_role() and app.user_cb_id() RLS helpers to work correctly.
-- Safe to run now: no AppUser rows exist yet.
ALTER TABLE "AppUser" ALTER COLUMN id DROP DEFAULT;
