'use client'

import Link from 'next/link'
import { Stage, AppStatus } from '@prisma/client'

type CbRecentApp = {
  id: string
  formNumber: string
  modelName: string
  modelVariant: string | null
  currentStage: Stage
  status: AppStatus
  submissionDate: string
  manufacturer: { name: string }
}

type CbKpis = {
  total: number
  inProgress: number
  tcIssued: number
  rejected: number
}

type Props = {
  cbName: string
  kpis: CbKpis
  recentApps: CbRecentApp[]
}

const STAGE_LABELS: Record<Stage, string> = {
  APPLICATION_REVIEW:   'Application Review',
  STAGE_1:              'Stage 1',
  STAGE_2:              'Stage 2',
  TECHNICAL_REVIEW_SOC: 'Technical Review / SoC',
  DGCA_REVIEW:          'DGCA Review',
  TC_ISSUED:            'TC Issued',
  QCI_AGREEMENT:        'QCI Agreement',
  POST_TC_SURVEILLANCE: 'Post-TC Surveillance',
}

const STATUS_BADGE: Record<AppStatus, string> = {
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  REJECTED:    'bg-red-50 text-red-700',
  TC_ISSUED:   'bg-green-50 text-green-700',
  WITHDRAWN:   'bg-slate-100 text-slate-500',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent?: 'blue' | 'green' | 'red' }) {
  const colors = {
    blue:  'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    red:   'border-red-200 bg-red-50 text-red-700',
  }
  const base = accent ? colors[accent] : 'border-slate-200 bg-white text-slate-800'
  return (
    <div className={`rounded-lg border px-5 py-4 ${base}`}>
      <p className="text-2xl font-semibold font-mono">{value}</p>
      <p className="text-xs mt-1 font-medium uppercase tracking-wide opacity-70">{label}</p>
    </div>
  )
}

export default function CbDashboard({ cbName, kpis, recentApps }: Props) {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Dashboard</h1>
      <p className="text-sm text-slate-500 mb-6">{cbName}</p>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <KpiCard label="Total"       value={kpis.total} />
        <KpiCard label="In Progress" value={kpis.inProgress} accent="blue" />
        <KpiCard label="TC Issued"   value={kpis.tcIssued}   accent="green" />
        <KpiCard label="Rejected"    value={kpis.rejected}   accent={kpis.rejected > 0 ? 'red' : undefined} />
      </div>

      {/* Recent Applications */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
          Recent Applications
        </h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Form No.</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Manufacturer</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentApps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No applications yet.
                  </td>
                </tr>
              ) : (
                recentApps.map(a => (
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
                    <td className="px-4 py-3 text-slate-600 text-xs">{a.manufacturer.name}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                      {STAGE_LABELS[a.currentStage]}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs
                                        font-medium ${STATUS_BADGE[a.status]}`}>
                        {a.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatDate(a.submissionDate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          Showing last 10 · <Link href="/applications" className="hover:underline text-slate-500">View all</Link>
        </p>
      </section>
    </div>
  )
}
