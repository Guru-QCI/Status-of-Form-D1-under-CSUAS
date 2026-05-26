import LoginForm from './LoginForm'

export const metadata = { title: 'Sign In — CSUAS Form D1 Portal' }

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">
            Sign in to CSUAS Form D1 Portal
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor the live status of Form D1 applications
          </p>
        </div>
        <LoginForm />
        <p className="mt-4 text-center text-xs text-slate-500">
          Don&apos;t have an account?{' '}
          <a href="/register" className="text-[#2563eb] hover:underline">
            Register
          </a>
        </p>
      </div>
    </main>
  )
}
