'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Stage, AppStatus, ReminderKind } from '@prisma/client'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

type RecentAppRow = {
  id: string
  formNumber: string
  modelName: string
  modelVariant: string | null
  currentStage: Stage
  status: AppStatus
  submissionDate: string
  manufacturer: { name: string }
  cb: { name: string }
  isNew?: boolean
}

type PendingReminderRow = {
  id: string
  kind: ReminderKind
  dueAt: string
  message: string
  applicationId: string
  application: { formNumber: string; modelName: string }
}

type Kpis = {
  total: number
  inProgress: number
  tcIssued: number
  rejected: number
  withdrawn: number
  withOpenNcs: number
  overdueReminderCount: number
}

type Props = {
  kpis: Kpis
  recentApps: RecentAppRow[]
  pendingReminders: PendingReminderRow[]
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

const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  CB_DECISION_DAY_6:     'CB Decision (Day 6)',
  PROCESS_1_TO_4_DAY_60: 'Process 1–4 (Day 60)',
  DGCA_REVIEW_DAY_15:    'DGCA Review (Day 15)',
  NC_RESPONSE_OVERDUE:   'NC Response Overdue',
  QCI_AGREEMENT_PENDING: 'QCI Agreement Pending',
  QCI_AGREEMENT_OVERDUE: 'QCI Agreement Overdue',
  SURVEILLANCE_DUE:      'Surveillance Due',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: 'red' | 'blue' | 'green'
}) {
  const colors = {
    red:   'border-red-200 bg-red-50 text-red-700',
    blue:  'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-green-200 bg-green-50 text-green-700',
  }
  const base = accent
    ? colors[accent]
    : 'border-slate-200 bg-white text-slate-800'

  return (
    <div className={`rounded-lg border px-5 py-4 ${base}`}>
      <p className="text-2xl font-semibold font-mono">{value}</p>
      <p className="text-xs mt-1 font-medium uppercase tracking-wide opacity-70">{label}</p>
    </div>
  )
}

export default function AdminDashboard({ kpis, recentApps: initialApps, pendingReminders }: Props) {
  const [recentApps, setRecentApps] = useState<RecentAppRow[]>(initialApps)

  // ── Realtime: Application INSERT ──────────────────────────────────────────
  useEffect(() => {
    const client = getSupabaseBrowserClient()
    let channel: ReturnType<typeof client.channel> | null = null

    void (async () => {
      const { data } = await client.auth.getSession()
      const session = data.session
      if (!session) return

      // Global fetch headers don't propagate to the WS channel — must set JWT explicitly.
      client.realtime.setAuth(session.access_token)

      channel = client
        .channel('dashboard-application-inserts')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'Application' },
          (payload: { new: Record<string, unknown> }) => {
            console.log('[Realtime] Application INSERT:', payload)
            const r = payload.new
            const inserted: RecentAppRow = {
              id:             String(r.id),
              formNumber:     String(r.formNumber),
              modelName:      String(r.modelName),
              modelVariant:   r.modelVariant ? String(r.modelVariant) : null,
              currentStage:   String(r.currentStage) as Stage,
              status:         String(r.status) as AppStatus,
              submissionDate: String(r.submissionDate),
              manufacturer:   { name: '—' },
              cb:             { name: '—' },
              isNew:          true,
            }
            setRecentApps(prev =>
              [inserted, ...prev.map(a => ({ ...a, isNew: false }))].slice(0, 10)
            )
            setTimeout(() => {
              setRecentApps(prev =>
                prev.map(a => a.id === inserted.id ? { ...a, isNew: false } : a)
              )
            }, 4000)
          }
        )
        .subscribe((status: string) => {
          console.log('[Realtime] channel status:', status)
        })
    })()

    return () => {
      if (channel) client.removeChannel(channel)
    }
  }, [])

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Admin Dashboard</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <KpiCard label="Total Applications" value={kpis.total} />
        <KpiCard label="In Progress"        value={kpis.inProgress} accent="blue" />
        <KpiCard label="TC Issued"          value={kpis.tcIssued}   accent="green" />
        <KpiCard label="Rejected"           value={kpis.rejected} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <KpiCard label="Withdrawn"           value={kpis.withdrawn} />
        <KpiCard label="With Open NCs"       value={kpis.withOpenNcs} accent={kpis.withOpenNcs > 0 ? 'red' : undefined} />
        <KpiCard label="Overdue Reminders"   value={kpis.overdueReminderCount} accent={kpis.overdueReminderCount > 0 ? 'red' : undefined} />
      </div>

      {/* Recent Applications */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
          Recent Applications
        </h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Form No.</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">CB</th>
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
                  <tr
                    key={a.id}
                    className={`transition-colors ${
                      a.isNew
                        ? 'bg-blue-50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-3 font-mono">
                      <Link
                        href={`/applications/${a.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {a.formNumber}
                        {a.isNew && (
                          <span className="ml-1.5 inline-block rounded-full px-1.5 py-0.5
                                           text-xs font-semibold bg-blue-600 text-white">
                            new
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {a.modelName}
                      {a.modelVariant && (
                        <span className="ml-1 text-xs text-slate-400">({a.modelVariant})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{a.cb.name}</td>
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

      {/* Pending Reminders */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
          Pending Reminders{pendingReminders.length > 0 && ` (${pendingReminders.length})`}
        </h2>
        {pendingReminders.length === 0 ? (
          <p className="text-sm text-slate-400">No pending reminders.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Application</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingReminders.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-block rounded px-2 py-0.5 text-xs font-medium
                                       bg-amber-50 text-amber-700 border border-amber-200">
                        {REMINDER_KIND_LABELS[r.kind]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-600">
                      <Link href={`/applications/${r.applicationId}`} className="hover:underline">
                        {r.application.formNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(r.dueAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-sm truncate">
                      {r.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
