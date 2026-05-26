'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type LoginResult = { error: string } | null

export async function loginUser(
  _prevState: unknown,
  formData: FormData,
): Promise<LoginResult> {
  const email    = (formData.get('email')    as string | null)?.trim().toLowerCase() ?? ''
  const password = (formData.get('password') as string | null) ?? ''

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const supabase = createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

  if (signInError) {
    // TODO (production): log raw signInError server-side; return generic message to user.
    const msg = signInError.message.toLowerCase()
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
      return { error: 'Email or password is incorrect.' }
    }
    if (msg.includes('email not confirmed')) {
      return {
        error:
          'Please confirm your email before logging in. Check your inbox for the confirmation link.',
      }
    }
    return { error: signInError.message }
  }

  // redirect() throws a NEXT_REDIRECT internally — nothing after this line executes.
  // TypeScript sees redirect() as returning `never`, so all code paths are satisfied.
  redirect('/dashboard')
}
