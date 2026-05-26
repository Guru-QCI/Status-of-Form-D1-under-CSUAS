'use client'

import { useState, useEffect } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createCb, updateCb } from './actions'

type Cb = {
  id:                 string
  name:               string
  isNabcbAccredited:  boolean
  nabcbExpiryDate:    Date | null
  contactPersonName:  string | null
  contactDesignation: string | null
  contactEmail:       string | null
  contactPhone:       string | null
  address:            string | null
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700
                 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Saving…' : label}
    </button>
  )
}

export default function CbForm({
  cb,
  onClose,
}: {
  cb: Cb | null
  onClose: () => void
}) {
  const action = cb ? updateCb.bind(null, cb.id) : createCb
  const [state, formAction] = useFormState(action, null)
  const [accredited, setAccredited] = useState(cb?.isNabcbAccredited ?? false)

  // Format Date (or ISO string from server serialisation) to YYYY-MM-DD for <input type="date">
  const defaultExpiryDate = cb?.nabcbExpiryDate
    ? new Date(cb.nabcbExpiryDate).toISOString().split('T')[0]
    : ''

  // Dismiss modal on successful save — revalidatePath in the action has already
  // queued a server re-render of the CB list by the time this effect fires.
  useEffect(() => {
    if (state && 'success' in state && state.success) onClose()
  }, [state, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          {cb ? 'Edit CB' : 'Add CB'}
        </h2>

        {state && 'error' in state && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              defaultValue={cb?.name ?? ''}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                         focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isNabcbAccredited"
              name="isNabcbAccredited"
              checked={accredited}
              onChange={(e) => setAccredited(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <label htmlFor="isNabcbAccredited" className="text-sm text-slate-700">
              NABCB accredited
            </label>
          </div>

          {accredited && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                NABCB Accreditation Expiry Date
              </label>
              <input
                type="date"
                name="nabcbExpiryDate"
                defaultValue={defaultExpiryDate}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                           focus:border-slate-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Contact Person Name
            </label>
            <input
              type="text"
              name="contactPersonName"
              defaultValue={cb?.contactPersonName ?? ''}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                         focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Designation
            </label>
            <input
              type="text"
              name="contactDesignation"
              defaultValue={cb?.contactDesignation ?? ''}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                         focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Contact Email
            </label>
            <input
              type="email"
              name="contactEmail"
              defaultValue={cb?.contactEmail ?? ''}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                         focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Contact Phone
            </label>
            <input
              type="tel"
              name="contactPhone"
              defaultValue={cb?.contactPhone ?? ''}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                         focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Address
            </label>
            <textarea
              name="address"
              rows={2}
              defaultValue={cb?.address ?? ''}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm
                         focus:border-slate-500 focus:outline-none resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-slate-600 hover:text-slate-800 border border-slate-300
                         rounded px-4 py-2 hover:border-slate-400 transition-colors"
            >
              Cancel
            </button>
            <SubmitButton label={cb ? 'Save changes' : 'Create CB'} />
          </div>

        </form>
      </div>
    </div>
  )
}
