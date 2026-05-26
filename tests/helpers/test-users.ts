// tests/helpers/test-users.ts

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function makeAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Ensures a Supabase auth user exists for the given email.
 * Checks existence first so any real createUser error is surfaced,
 * not silently swallowed by a fallback.
 * Returns the auth UUID.
 */
export async function ensureTestAuthUser(
  email: string,
  password: string,
): Promise<string> {
  const admin = makeAdminClient()

  // NOTE: perPage: 1000 covers current test-DB scale; misses users
  // beyond page 1 if the auth table ever exceeds 1000 rows.
  const { data: listData, error: listError } =
    await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw new Error(`listUsers failed: ${listError.message}`)

  const existing = listData.users.find((u) => u.email === email)
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password })
    return existing.id
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser failed for ${email}: ${error.message}`)
  if (!data.user) throw new Error(`createUser returned no user for ${email}`)
  return data.user.id
}

/**
 * Signs in as the given user and returns the raw JWT access_token.
 * The token is used to construct per-user Supabase clients in tests,
 * so RLS is evaluated under the correct identity (not service role).
 */
export async function getJwtForTestUser(
  email: string,
  password: string,
): Promise<string> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signInWithPassword failed for ${email}: ${error.message}`)
  if (!data.session?.access_token) throw new Error(`No access_token returned for ${email}`)
  return data.session.access_token
}

/**
 * Deletes Supabase auth users matching the given emails.
 * Safe to call even if an email has no corresponding auth user (skipped).
 */
export async function cleanupTestAuthUsers(emails: string[]): Promise<void> {
  const admin = makeAdminClient()

  // NOTE: same perPage: 1000 limitation as ensureTestAuthUser.
  const { data: listData, error: listError } =
    await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw new Error(`listUsers failed: ${listError.message}`)

  const targets = listData.users.filter((u) => u.email && emails.includes(u.email))
  await Promise.all(targets.map((u) => admin.auth.admin.deleteUser(u.id)))
}
