'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { registerUser } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2 px-4 bg-steel-blue-600 bg-[#2563eb] text-white text-sm font-medium rounded
                 hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2
                 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? 'Submitting…' : 'Create account'}
    </button>
  )
}

export default function RegisterForm() {
  const [state, action] = useFormState(registerUser, null)

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm">
      {'error' in (state ?? {}) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {(state as { error: string }).error}
        </div>
      )}
      {'success' in (state ?? {}) && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
          {(state as { message: string }).message}
        </div>
      )}

      <form action={action} className="space-y-5">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-1">
            Full name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900
                       focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900
                       focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900
                       focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
          />
          <p className="mt-1 text-xs text-slate-400">Minimum 8 characters</p>
        </div>

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-xs text-slate-500">
        Already have an account?{' '}
        <a href="/login" className="text-[#2563eb] hover:underline">
          Sign in
        </a>
      </p>
    </div>
  )
}
