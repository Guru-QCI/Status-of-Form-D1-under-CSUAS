import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppStatus } from '@prisma/client'
import AdminDashboard from './AdminDashboard'
import CbDashboard from './CbDashboard'

export const metadata = { title: 'Dashboard — CSUAS Form D1 Portal' }

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { role, cbId } = user

  if (role === 'PUBLIC') redirect('/login')

  // ── ADMIN ──────────────────────────────────────────────────────────────────
  if (role === 'ADMIN') {
    const now = new Date()

    const [
      total,
      inProgress,
      tcIssued,
      rejected,
      withdrawn,
      withOpenNcs,
      overdueReminderCount,
      recentAppsRaw,
      pendingRemindersRaw,
    ] = await Promise.all([
      prisma.application.count({ where: { deletedAt: null } }),
      prisma.application.count({ where: { deletedAt: null, status: AppStatus.IN_PROGRESS } }),
      prisma.application.count({ where: { deletedAt: null, status: AppStatus.TC_ISSUED } }),
      prisma.application.count({ where: { deletedAt: null, status: AppStatus.REJECTED } }),
      prisma.application.count({ where: { deletedAt: null, status: AppStatus.WITHDRAWN } }),
      prisma.application.count({
        where: { deletedAt: null, ncs: { some: { closedDate: null } } },
      }),
      prisma.reminder.count({ where: { sentAt: null, dueAt: { lt: now } } }),
      prisma.application.findMany({
        where:   { deletedAt: null },
        orderBy: { submissionDate: 'desc' },
        take:    10,
        select: {
          id: true, formNumber: true, modelName: true, modelVariant: true,
          currentStage: true, status: true, submissionDate: true,
          manufacturer: { select: { name: true } },
          cb:           { select: { name: true } },
        },
      }),
      prisma.reminder.findMany({
        where:   { sentAt: null },
        orderBy: { dueAt: 'asc' },
        take:    20,
        select: {
          id: true, kind: true, dueAt: true, message: true,
          applicationId: true,
          application: { select: { formNumber: true, modelName: true } },
        },
      }),
    ])

    return (
      <AdminDashboard
        kpis={{ total, inProgress, tcIssued, rejected, withdrawn, withOpenNcs, overdueReminderCount }}
        recentApps={recentAppsRaw.map(a => ({
          ...a,
          submissionDate: a.submissionDate.toISOString(),
        }))}
        pendingReminders={pendingRemindersRaw.map(r => ({
          id:            r.id,
          kind:          r.kind,
          dueAt:         r.dueAt.toISOString(),
          message:       r.message,
          applicationId: r.applicationId,
          application:   r.application,
        }))}
      />
    )
  }

  // ── CB_USER ────────────────────────────────────────────────────────────────
  const cbWhere = { deletedAt: null as null, cbId: cbId! }

  const [total, inProgress, tcIssued, rejected, cbRecord, recentAppsRaw] = await Promise.all([
    prisma.application.count({ where: cbWhere }),
    prisma.application.count({ where: { ...cbWhere, status: AppStatus.IN_PROGRESS } }),
    prisma.application.count({ where: { ...cbWhere, status: AppStatus.TC_ISSUED } }),
    prisma.application.count({ where: { ...cbWhere, status: AppStatus.REJECTED } }),
    prisma.cB.findUnique({ where: { id: cbId! }, select: { name: true } }),
    prisma.application.findMany({
      where:   cbWhere,
      orderBy: { submissionDate: 'desc' },
      take:    10,
      select: {
        id: true, formNumber: true, modelName: true, modelVariant: true,
        currentStage: true, status: true, submissionDate: true,
        manufacturer: { select: { name: true } },
      },
    }),
  ])

  return (
    <CbDashboard
      cbName={cbRecord?.name ?? ''}
      kpis={{ total, inProgress, tcIssued, rejected }}
      recentApps={recentAppsRaw.map(a => ({
        ...a,
        submissionDate: a.submissionDate.toISOString(),
      }))}
    />
  )
}
