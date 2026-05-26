'use client'

import { useState, useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import { createApplication } from './actions'

type Manufacturer = { id: string; name: string }

const MAX_FILE_BYTES  = 26_214_400   // 25 MB
const MAX_TOTAL_BYTES = 104_857_600  // 100 MB

const FILE_FIELDS = [
  { name: 'fileFormD1',        label: 'Form D1',       hint: 'Signed Form D1 submitted by the manufacturer' },
  { name: 'fileTechnicalFile', label: 'Technical File', hint: 'Technical documentation package' },
  { name: 'fileTestReport',    label: 'Test Report',    hint: 'Lab or type-testing report' },
  { name: 'fileCrmDocument',   label: 'CRM Document',   hint: 'Certification readiness matrix' },
] as const

function validateFileSizes(inputs: HTMLInputElement[]): string | null {
  let total = 0
  for (const input of inputs) {
    const file = input.files?.[0]
    if (!file) continue
    if (file.size > MAX_FILE_BYTES) {
      return `"${file.name}" exceeds the 25 MB per-file limit.`
    }
    total += file.size
  }
  if (total > MAX_TOTAL_BYTES) {
    return 'Total size of all files exceeds the 100 MB limit.'
  }
  return null
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700
                 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Submitting…' : 'Submit Application'}
    </button>
  )
}

export default function ApplicationForm({ manufacturers }: { manufacturers: Manufacturer[] }) {
  const [state, formAction] = useFormState(createApplication, null)
  const [manufacturerMode, setManufacturerMode] = useState<'existing' | 'new'>(
    manufacturers.length > 0 ? 'existing' : 'new',
  )
  const [fileSizeWarning, setFileSizeWarning] = useState<string | null>(null)
  const fileRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null])

  function handleFileChange() {
    const warning = validateFileSizes(
      fileRefs.current.filter((r): r is HTMLInputElement => r !== null),
    )
    setFileSizeWarning(warning)
  }

  return (
    <div className="max-w-2xl">
      {state && 'error' in state && (
        <div className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-8">

        {/* Section 1 — Manufacturer */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-200 pb-2">
            Manufacturer
          </h2>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="_manufacturerMode"
                value="existing"
                checked={manufacturerMode === 'existing'}
                onChange={() => setManufacturerMode('existing')}
                className="h-4 w-4 border-slate-300"
              />
              Use existing
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="_manufacturerMode"
                value="new"
                checked={manufacturerMode === 'new'}
                onChange={() => setManufacturerMode('new')}
                className="h-4 w-4 border-slate-300"
              />
              Add new
            </label>
          </div>

          {manufacturerMode === 'existing' ? (
            <div>
              <label htmlFor="manufacturerId" className="block text-sm font-medium text-slate-700 mb-1">
                Manufacturer <span className="text-red-500">*</span>
              </label>
              <select
                id="manufacturerId"
                name="manufacturerId"
                required
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                           focus:border-slate-500 focus:outline-none bg-white"
              >
                <option value="">— Select manufacturer —</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="newManufacturerName" className="block text-sm font-medium text-slate-700 mb-1">
                  Manufacturer Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="newManufacturerName"
                  type="text"
                  name="newManufacturerName"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                             focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="newManufacturerEmail" className="block text-sm font-medium text-slate-700 mb-1">
                  Contact Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="newManufacturerEmail"
                  type="email"
                  name="newManufacturerEmail"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                             focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="newManufacturerPhone" className="block text-sm font-medium text-slate-700 mb-1">
                  Contact Phone
                </label>
                <input
                  id="newManufacturerPhone"
                  type="tel"
                  name="newManufacturerPhone"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                             focus:border-slate-500 focus:outline-none"
                />
              </div>
            </div>
          )}
        </section>

        {/* Section 2 — Model details */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-200 pb-2">
            Model Details
          </h2>

          <div>
            <label htmlFor="modelName" className="block text-sm font-medium text-slate-700 mb-1">
              Model Name <span className="text-red-500">*</span>
            </label>
            <input
              id="modelName"
              type="text"
              name="modelName"
              required
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                         focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="modelVariant" className="block text-sm font-medium text-slate-700 mb-1">
              Model Variant
            </label>
            <input
              id="modelVariant"
              type="text"
              name="modelVariant"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                         focus:border-slate-500 focus:outline-none"
            />
          </div>
        </section>

        {/* Section 3 — Form D1 metadata */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-200 pb-2">
            Form D1 Metadata
          </h2>

          <div>
            <label htmlFor="formNumber" className="block text-sm font-medium text-slate-700 mb-1">
              Form Number <span className="text-red-500">*</span>
            </label>
            <input
              id="formNumber"
              type="text"
              name="formNumber"
              required
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                         focus:border-slate-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">CB-assigned application number</p>
          </div>

          <div>
            <label htmlFor="submissionDate" className="block text-sm font-medium text-slate-700 mb-1">
              Submission Date <span className="text-red-500">*</span>
            </label>
            <input
              id="submissionDate"
              type="date"
              name="submissionDate"
              required
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                         focus:border-slate-500 focus:outline-none"
            />
          </div>
        </section>

        {/* Section 4 — Mandatory documents */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-200 pb-2">
            Mandatory Documents
          </h2>

          {FILE_FIELDS.map((field, i) => (
            <div key={field.name} className="space-y-1">
              <label htmlFor={field.name} className="block text-sm font-medium text-slate-700">
                {field.label} <span className="text-red-500">*</span>
              </label>
              <input
                ref={(el) => { fileRefs.current[i] = el }}
                id={field.name}
                type="file"
                name={field.name}
                required
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3
                           file:rounded file:border file:border-slate-300 file:text-sm
                           file:bg-white file:text-slate-700 hover:file:bg-slate-50"
              />
              <p className="text-xs text-slate-500">{field.hint}</p>
            </div>
          ))}
        </section>

        {/* Warnings + actions */}
        {fileSizeWarning && (
          <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {fileSizeWarning}
          </div>
        )}

        <div className="flex items-center gap-4 pt-2">
          <SubmitButton />
          <Link
            href="/dashboard"
            className="text-sm text-slate-600 hover:text-slate-800 border border-slate-300
                       rounded px-4 py-2 hover:border-slate-400 transition-colors"
          >
            Cancel
          </Link>
        </div>

      </form>
    </div>
  )
}
