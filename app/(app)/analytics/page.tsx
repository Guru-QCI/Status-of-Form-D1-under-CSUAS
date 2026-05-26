import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Stage, AppStatus } from '@prisma/client'
import { getStageTat } from '@/lib/tat'
import Analytics from './Analytics'

export const metadata = { title: 'Analytics — CSUAS Form D1 Portal' }

const TAT_STAGES = [
  Stage.APPLICATION_REVIEW,
  Stage.STAGE_1,
  Stage.STAGE_2,
  Stage.TECHNICAL_REVIEW_SOC,
  Stage.DGCA_REVIEW,
  Stage.QCI_AGREEMENT,
] as const

export default async function AnalyticsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
  twelveMonthsAgo.setDate(1)
  twelveMonthsAgo.setHours(0, 0, 0, 0)

  // Fetch everything in parallel
  const [
    cbsRaw,
    statusCountsRaw,
    stageCountsRaw,
    ncStageCountsRaw,
    tatAppsRaw,
    recentSubmissionsRaw,
  ] = await Promise.all([
    // Apps per CB
    prisma.cB.findMany({
      select: {
        name: true,
        _count: { select: { applications: { where: { deletedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    }),

    // Apps per status — single groupBy (1 query)
    prisma.application.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),

    // Apps per stage — single groupBy (1 query)
    prisma.application.groupBy({
      by: ['currentStage'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),

    // NCs per stage — single groupBy (1 query)
    prisma.nonConformity.groupBy({
      by: ['stage'],
      _count: { _all: true },
    }),

    // All apps for TAT computation
    prisma.application.findMany({
      where: { deletedAt: null },
      select: {
        submissionDate:           true,
        reviewDecisionDate:       true,
        stage1ScheduleFrom:       true,
        stage1ClosureDate:        true,
        stage2ScheduleFrom:       true,
        stage2ClosureDate:        true,
        socReviewDate:            true,
        socSubmittedDate:         true,
        dgcaReviewStartedAt:      true,
        tcIssuedDate:             true,
        qciAgreementInitiatedDate: true,
        qciAgreementCompletedDate: true,
      },
    }),

    // Monthly submissions (last 12 months)
    prisma.application.findMany({
      where: { deletedAt: null, submissionDate: { gte: twelveMonthsAgo } },
      select: { submissionDate: true },
    }),
  ])

  // Average TAT per stage (completed stages only)
  const avgTatPerStage = TAT_STAGES.map(stage => {
    const completed = tatAppsRaw
      .map(app => getStageTat(app, stage))
      .filter(t => t.isComplete && t.elapsed !== null)
    const avg =
      completed.length > 0
        ? Math.round(completed.reduce((sum, t) => sum + (t.elapsed ?? 0), 0) / completed.length)
        : null
    return { stage: stage as string, avg, completedCount: completed.length }
  })

  // Monthly submissions bucketed by year-month
  const monthBuckets: Record<string, number> = {}
  for (const app of recentSubmissionsRaw) {
    const key = app.submissionDate.toISOString().slice(0, 7)
    monthBuckets[key] = (monthBuckets[key] ?? 0) + 1
  }
  const monthlySubmissions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(twelveMonthsAgo)
    d.setMonth(d.getMonth() + i)
    const key = d.toISOString().slice(0, 7)
    return { month: key, count: monthBuckets[key] ?? 0 }
  })

  return (
    <Analytics
      totalApplications={stageCountsRaw.reduce((s, r) => s + r._count._all, 0)}
      appsByCb={cbsRaw.map(cb => ({ name: cb.name, count: cb._count.applications }))}
      appsByStatus={statusCountsRaw.map(r => ({ status: r.status as string, count: r._count._all }))}
      appsByStage={stageCountsRaw.map(r => ({ stage: r.currentStage as string, count: r._count._all }))}
      avgTatPerStage={avgTatPerStage}
      ncsByStage={ncStageCountsRaw.filter(r => r._count._all > 0).map(r => ({ stage: r.stage as string, count: r._count._all }))}
      monthlySubmissions={monthlySubmissions}
    />
  )
}
