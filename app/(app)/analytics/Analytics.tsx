'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

type Props = {
  totalApplications: number
  appsByCb:          Array<{ name: string; count: number }>
  appsByStatus:      Array<{ status: string; count: number }>
  appsByStage:       Array<{ stage: string; count: number }>
  avgTatPerStage:    Array<{ stage: string; avg: number | null; completedCount: number }>
  ncsByStage:        Array<{ stage: string; count: number }>
  monthlySubmissions: Array<{ month: string; count: number }>
}

const STAGE_LABELS: Record<string, string> = {
  APPLICATION_REVIEW:   'Application Review',
  STAGE_1:              'Stage 1',
  STAGE_2:              'Stage 2',
  TECHNICAL_REVIEW_SOC: 'Technical Review / SoC',
  DGCA_REVIEW:          'DGCA Review',
  TC_ISSUED:            'TC Issued',
  QCI_AGREEMENT:        'QCI Agreement',
  POST_TC_SURVEILLANCE: 'Post-TC Surveillance',
}

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'In Progress',
  REJECTED:    'Rejected',
  TC_ISSUED:   'TC Issued',
  WITHDRAWN:   'Withdrawn',
}

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: '#3b82f6',
  REJECTED:    '#ef4444',
  TC_ISSUED:   '#22c55e',
  WITHDRAWN:   '#94a3b8',
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
      {children}
    </h2>
  )
}

function StatTable({
  rows,
  labelHeader,
  valueHeader,
}: {
  rows: Array<{ label: string; value: string | number }>
  labelHeader: string
  valueHeader: string
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3">{labelHeader}</th>
            <th className="px-4 py-3 text-right">{valueHeader}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 text-slate-700">{r.label}</td>
              <td className="px-4 py-2.5 text-right font-mono text-slate-800">{r.value}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-6 text-center text-slate-400">No data.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

export default function Analytics({
  totalApplications,
  appsByCb,
  appsByStatus,
  appsByStage,
  avgTatPerStage,
  ncsByStage,
  monthlySubmissions,
}: Props) {
  const pieData = appsByStatus
    .filter(r => r.count > 0)
    .map(r => ({ name: STATUS_LABELS[r.status] ?? r.status, value: r.count, key: r.status }))

  const barData = monthlySubmissions.map(r => ({
    month: fmtMonth(r.month),
    count: r.count,
  }))

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Analytics</h1>
      <p className="text-sm text-slate-500 mb-8">
        {totalApplications} application{totalApplications !== 1 ? 's' : ''} total
      </p>

      {/* Row 1: Status pie + Monthly bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <section>
          <SectionHeading>Status Distribution</SectionHeading>
          <div className="bg-white rounded-lg border border-slate-200 p-4" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key] ?? '#cbd5e1'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Applications']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section>
          <SectionHeading>Monthly Submissions (Last 12 Months)</SectionHeading>
          <div className="bg-white rounded-lg border border-slate-200 p-4" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} width={28} />
                <Tooltip
                  contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0' }}
                  formatter={(value) => [value, 'Applications']}
                />
                <Bar dataKey="count" fill="#64748b" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Row 2: Apps per CB + Apps per Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <section>
          <SectionHeading>Applications per CB</SectionHeading>
          <StatTable
            labelHeader="Certification Body"
            valueHeader="Applications"
            rows={appsByCb.map(r => ({ label: r.name, value: r.count }))}
          />
        </section>

        <section>
          <SectionHeading>Applications per Stage</SectionHeading>
          <StatTable
            labelHeader="Stage"
            valueHeader="Count"
            rows={appsByStage
              .filter(r => r.count > 0)
              .map(r => ({ label: STAGE_LABELS[r.stage] ?? r.stage, value: r.count }))}
          />
        </section>
      </div>

      {/* Row 3: Avg TAT per Stage + NCs per Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <SectionHeading>Average TAT per Stage (completed stages)</SectionHeading>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">Avg Days</th>
                  <th className="px-4 py-3 text-right">Sample</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {avgTatPerStage.map(r => (
                  <tr key={r.stage} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-700">
                      {STAGE_LABELS[r.stage] ?? r.stage}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                      {r.avg !== null ? r.avg : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                      {r.completedCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <SectionHeading>Non-Conformities per Stage</SectionHeading>
          <StatTable
            labelHeader="Stage"
            valueHeader="NCs"
            rows={ncsByStage.map(r => ({ label: STAGE_LABELS[r.stage] ?? r.stage, value: r.count }))}
          />
          {ncsByStage.length === 0 && (
            <p className="text-sm text-slate-400 mt-2">No non-conformities recorded.</p>
          )}
        </section>
      </div>
    </div>
  )
}
