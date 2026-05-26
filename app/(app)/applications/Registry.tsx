'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { Stage, AppStatus } from '@prisma/client'
import { exportApplicationsCsv } from './actions'

type ApplicationRow = {
  id: string
  formNumber: string
  modelName: string
  modelVariant: string | null
  currentStage: Stage
  status: AppStatus
  submissionDate: string
  manufacturer: { name: string }
  cb: { name: string }
  addedBy: { fullName: string }
  daysElapsed: number | null
}

type SearchParams = {
  q?: string
  status?: string
  stage?: string
  sort?: string
  page?: string
}

type Props = {
  applications: ApplicationRow[]
  total: number
  page: number
  pageSize: number
  isAdmin: boolean
  searchParams: SearchParams
}

const STAGE_LABELS: Record<Stage, string> = {
  APPLICATION_REVIEW:   'Application Review',
  STAGE_1:              'Stage 1',
  STAGE_2:              'Stage 2',
  TECHNICAL_REVIEW_SOC: 'Technical Review / SOC',
  DGCA_REVIEW:          'DGCA Review',
  TC_ISSUED:            'TC Issued',
  QCI_AGREEMENT:        'QCI Agreement',
  POST_TC_SURVEILLANCE: 'Post-TC Surveillance',
}

const STATUS_LABELS: Record<AppStatus, string> = {
  IN_PROGRESS: 'In Progress',
  REJECTED:    'Rejected',
  TC_ISSUED:   'TC Issued',
  WITHDRAWN:   'Withdrawn',
}

const STATUS_BADGE_STYLES: Record<AppStatus, string> = {
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  REJECTED:    'bg-red-50 text-red-700',
  TC_ISSUED:   'bg-green-50 text-green-700',
  WITHDRAWN:   'bg-slate-100 text-slate-500',
}

export default function Registry({
  applications,
  total,
  page,
  pageSize,
  isAdmin,
  searchParams,
}: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting]     = useState(false)
  const [exportError, setExportError] = useState('')

  const pushParams = useCallback(
    (updates: Record<string, string | undefined>, resetPage = true) => {
      const params = new URLSearchParams()
      if (searchParams.q)      params.set('q',      searchParams.q)
      if (searchParams.status) params.set('status', searchParams.status)
      if (searchParams.stage)  params.set('stage',  searchParams.stage)
      if (searchParams.sort)   params.set('sort',   searchParams.sort)
      if (searchParams.page && !resetPage) params.set('page', searchParams.page)
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v)
        else   params.delete(k)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = searchInputRef.current?.value.trim()
    pushParams({ q: q || undefined })
  }

  async function handleExport() {
    setExporting(true)
    setExportError('')
    try {
      const result = await exportApplicationsCsv({
        q:      searchParams.q,
        status: searchParams.status,
        stage:  searchParams.stage,
      })
      if ('error' in result) {
        setExportError(result.error)
        return
      }
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `applications-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const colCount   = isAdmin ? 9 : 8

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Applications</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="text-sm border border-slate-300 rounded px-3 py-1.5 text-slate-600
                     hover:border-slate-400 hover:text-slate-800 disabled:opacity-50
                     transition-colors"
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <form
          key={searchParams.q ?? ''}
          onSubmit={handleSearchSubmit}
          className="flex gap-2"
        >
          <input
            ref={searchInputRef}
            type="text"
            defaultValue={searchParams.q ?? ''}
            placeholder="Search form no., model, manufacturer…"
            className="text-sm border border-slate-300 rounded px-3 py-1.5 w-72
                       focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <button
            type="submit"
            className="text-sm border border-slate-300 rounded px-3 py-1.5 text-slate-600
                       hover:border-slate-400 hover:text-slate-800 transition-colors"
          >
            Search
          </button>
        </form>

        <select
          value={searchParams.status ?? ''}
          onChange={e => pushParams({ status: e.target.value || undefined })}
          className="text-sm border border-slate-300 rounded px-3 py-1.5
                     focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="">All statuses</option>
          {Object.values(AppStatus).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={searchParams.stage ?? ''}
          onChange={e => pushParams({ stage: e.target.value || undefined })}
          className="text-sm border border-slate-300 rounded px-3 py-1.5
                     focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="">All stages</option>
          {Object.values(Stage).map(s => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={searchParams.sort ?? 'submissionDate_desc'}
          onChange={e => pushParams({ sort: e.target.value || undefined })}
          className="text-sm border border-slate-300 rounded px-3 py-1.5
                     focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="submissionDate_desc">Newest first</option>
          <option value="submissionDate_asc">Oldest first</option>
          <option value="formNumber_asc">Form # (A→Z)</option>
          <option value="formNumber_desc">Form # (Z→A)</option>
          <option value="status_asc">Status (A→Z)</option>
          <option value="status_desc">Status (Z→A)</option>
          <option value="daysElapsed_desc">Days elapsed (most first)</option>
          <option value="daysElapsed_asc">Days elapsed (fewest first)</option>
        </select>
      </div>

      {exportError && (
        <p className="text-sm text-red-600 mb-3">{exportError}</p>
      )}

      <p className="text-xs text-slate-500 mb-2">
        {total} application{total !== 1 ? 's' : ''}
        {totalPages > 1 ? ` — page ${page} of ${totalPages}` : ''}
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Form No.</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Manufacturer</th>
              {isAdmin && <th className="px-4 py-3">CB</th>}
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Submission Date</th>
              <th className="px-4 py-3 text-right">Days</th>
              <th className="px-4 py-3">Added By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {applications.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-slate-400">
                  No applications found.
                </td>
              </tr>
            ) : (
              applications.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono">
                    <Link
                      href={`/applications/${a.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {a.formNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {a.modelName}
                    {a.modelVariant && (
                      <span className="ml-1 text-xs text-slate-400">({a.modelVariant})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{a.manufacturer.name}</td>
                  {isAdmin && <td className="px-4 py-3 text-slate-700">{a.cb.name}</td>}
                  <td className="px-4 py-3 text-slate-700">{STAGE_LABELS[a.currentStage]}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_STYLES[a.status]}`}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {new Date(a.submissionDate).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {a.daysElapsed ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{a.addedBy.fullName}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            disabled={page <= 1}
            onClick={() => pushParams({ page: String(page - 1) }, false)}
            className="text-sm border border-slate-300 rounded px-3 py-1.5 text-slate-600
                       hover:border-slate-400 hover:text-slate-800 disabled:opacity-40
                       disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => pushParams({ page: String(page + 1) }, false)}
            className="text-sm border border-slate-300 rounded px-3 py-1.5 text-slate-600
                       hover:border-slate-400 hover:text-slate-800 disabled:opacity-40
                       disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
