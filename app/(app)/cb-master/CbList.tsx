'use client'

import { useState, useTransition } from 'react'
import { deleteCb } from './actions'
import CbForm from './CbForm'

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

export default function CbList({ cbs }: { cbs: Cb[] }) {
  const [showCreate, setShowCreate]     = useState(false)
  const [editingCb, setEditingCb]       = useState<Cb | null>(null)
  const [deleteError, setDeleteError]   = useState<string | null>(null)
  const [isPending, startTransition]    = useTransition()

  function handleDelete(cb: Cb) {
    if (!confirm(`Delete "${cb.name}"? This cannot be undone.`)) return
    setDeleteError(null)
    startTransition(async () => {
      const result = await deleteCb(cb.id)
      if ('error' in result) setDeleteError(result.error)
    })
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-slate-500">{cbs.length} certification bod{cbs.length === 1 ? 'y' : 'ies'}</span>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700 transition-colors"
        >
          + Add CB
        </button>
      </div>

      {deleteError && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">NABCB</th>
              <th className="px-4 py-3 text-left font-medium">Expiry</th>
              <th className="px-4 py-3 text-left font-medium">Contact</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cbs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No certification bodies yet. Add one above.
                </td>
              </tr>
            )}
            {cbs.map((cb) => (
              <tr key={cb.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{cb.name}</td>
                <td className="px-4 py-3">
                  {cb.isNabcbAccredited ? (
                    <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Yes</span>
                  ) : (
                    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {cb.nabcbExpiryDate
                    ? new Date(cb.nabcbExpiryDate).toLocaleDateString('en-IN')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {cb.contactPersonName ?? '—'}
                  {cb.contactDesignation && (
                    <span className="ml-1 text-slate-400">({cb.contactDesignation})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{cb.contactEmail ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditingCb(cb)}
                    className="mr-2 text-slate-500 hover:text-slate-800 underline text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(cb)}
                    disabled={isPending}
                    className="text-red-500 hover:text-red-700 underline text-xs disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CbForm cb={null} onClose={() => setShowCreate(false)} />
      )}
      {editingCb && (
        <CbForm cb={editingCb} onClose={() => setEditingCb(null)} />
      )}
    </div>
  )
}
