'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

type RegisterResult =
  | { success: true; message: string }
  | { error: string }

export async function registerUser(
  _prevState: unknown,
  formData: FormData,
): Promise<RegisterResult> {
  const email    = (formData.get('email')    as string | null)?.trim().toLowerCase() ?? ''
  const password = (formData.get('password') as string | null) ?? ''
  const fullName = (formData.get('fullName') as string | null)?.trim() ?? ''

  if (!email || !password || !fullName) {
    return { error: 'All fields are required.' }
  }

  // Check email whitelist — SELECT is open to anon (see DECISIONS.md).
  const whitelist = await prisma.emailWhitelist.findUnique({ where: { email } })
  if (!whitelist) {
    return {
      error: 'Your email is not authorized for this portal. Please contact your administrator.',
    }
  }

  const supabase = createClient()
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (signUpError) {
    // TODO (production): log raw signUpError server-side and return a generic message to the user.
    const msg = signUpError.message.toLowerCase()
    if (msg.includes('already registered') || msg.includes('already exists')) {
      return { error: 'This email is already registered. Please log in instead.' }
    }
    return { error: signUpError.message }
  }

  if (!signUpData.user) {
    return { error: 'Sign-up failed — no user returned. Please try again.' }
  }

  // Reconcile the AppUser row with the real Supabase auth UUID.
  //
  // Two cases require an update rather than a create:
  //   1. Dev/seed: the seed pre-creates AppUser rows with placeholder UUIDs
  //      (e.g. 00000000-...-001). The first real signup must overwrite the id
  //      so RLS helpers (app.user_role(), app.user_cb_id()) can resolve correctly.
  //   2. Re-registration: an admin deleted the Supabase auth user but the
  //      AppUser row survived. Re-linking restores access cleanly.
  //
  // CRITICAL: id must equal the Supabase auth UUID — the RLS bridge depends on it.
  const existing = await prisma.appUser.findUnique({ where: { email } })
  if (existing) {
    await prisma.appUser.update({
      where: { email },
      data: {
        id:       signUpData.user.id,
        fullName,
        role:     whitelist.role,
        cbId:     whitelist.cbId ?? null,
      },
    })
  } else {
    await prisma.appUser.create({
      data: {
        id:       signUpData.user.id,
        email,
        fullName,
        role:     whitelist.role,
        cbId:     whitelist.cbId ?? null,
      },
    })
  }

  return {
    success: true,
    message:
      'Account created. Check your email for a confirmation link, or log in directly if confirmation is disabled.',
  }
}
