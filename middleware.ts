/**
 * Next.js Middleware — default-deny auth gate.
 *
 * Only paths explicitly listed in PUBLIC_PATHS are reachable without a valid
 * Supabase session. Every other path requires authentication.
 * Failure mode: a new route missing from PUBLIC_PATHS becomes inaccessible
 * (loud, immediately noticed) rather than accidentally exposed to the public
 * (silent, security bug). Add routes here only when they are intentionally public.
 */
import { refreshSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register', '/api/auth/callback', '/api/cron']

export async function middleware(request: NextRequest) {
  // refreshSession() calls supabase.auth.getUser() (not getSession) and returns
  // the (possibly token-refreshed) response with updated Set-Cookie headers.
  const { supabaseResponse, user } = await refreshSession(request)

  const { pathname } = request.nextUrl

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  // Default-deny: unauthenticated request to a non-public path → /login.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Root path always redirects — authenticated users go to /dashboard, guests to /login.
  // (The guest branch is dead code when the default-deny block above is present,
  // but kept explicit for clarity and resilience against future reordering.)
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = user ? '/dashboard' : '/login'
    return NextResponse.redirect(url)
  }

  // Redirect already-logged-in users away from auth pages.
  if (user && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Pass through with the (possibly refreshed) session cookie.
  return supabaseResponse
}

export const config = {
  // Run on all paths except Next.js internals and static files (anything with a dot).
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)',],
}
