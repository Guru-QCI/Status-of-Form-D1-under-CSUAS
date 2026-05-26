import RegisterForm from './RegisterForm'

export const metadata = { title: 'Register — CSUAS Form D1 Portal' }

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">
            Status of Form D1 under CSUAS
          </h1>
          <p className="mt-1 text-sm text-slate-500">Create your portal account</p>
        </div>
        <RegisterForm />
      </div>
    </main>
  )
}
