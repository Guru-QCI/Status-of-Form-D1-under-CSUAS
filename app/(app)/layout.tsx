import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { appUser, role } = user

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <span className="text-base font-semibold text-slate-800 tracking-tight">
            CSUAS Form D1
          </span>
          <div className="flex items-center gap-6">
            {role === 'ADMIN' && (
              <Link
                href="/cb-master"
                className="text-sm text-slate-600 hover:text-slate-800 transition-colors"
              >
                CB Master
              </Link>
            )}
            {role === 'ADMIN' && (
              <Link
                href="/analytics"
                className="text-sm text-slate-600 hover:text-slate-800 transition-colors"
              >
                Analytics
              </Link>
            )}
            {(role === 'ADMIN' || role === 'CB_USER') && (
              <Link
                href="/applications"
                className="text-sm text-slate-600 hover:text-slate-800 transition-colors"
              >
                Applications
              </Link>
            )}
            {role === 'CB_USER' && (
              <Link
                href="/applications/new"
                className="text-sm text-slate-600 hover:text-slate-800 transition-colors"
              >
                New Application
              </Link>
            )}
            <span className="text-sm text-slate-600">
              {appUser.fullName} &mdash; {role}
            </span>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="text-sm text-slate-500 hover:text-slate-800 border border-slate-300
                           rounded px-3 py-1 hover:border-slate-400 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
