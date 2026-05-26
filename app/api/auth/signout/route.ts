import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()

  try {
    await supabase.auth.signOut()
  } catch {
    // signOut failed; cookie may not be cleared but middleware will block
    // unauthenticated requests on the next page load anyway. Proceed with redirect.
  }

  // 303 See Other converts the POST to a GET, preventing the browser from
  // re-POSTing to /login on redirect (standard Post/Redirect/Get pattern).
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
