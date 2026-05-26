import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppStatus, Stage } from '@prisma/client'
import { getTotalTat } from '@/lib/tat'
import Registry from './Registry'

export const metadata = { title: 'Applications — CSUAS Form D1 Portal' }

const PAGE_SIZE = 100

const APP_STATUS_VALUES = new Set(Object.values(AppStatus))
const STAGE_VALUES      = new Set(Object.values(Stage))

const SORT_MAP: Record<string, Record<string, 'asc' | 'desc'>> = {
  submissionDate_desc: { submissionDate: 'desc' },
  submissionDate_asc:  { submissionDate: 'asc' },
  formNumber_asc:      { formNumber: 'asc' },
  formNumber_desc:     { formNumber: 'desc' },
  status_asc:          { status: 'asc' },
  status_desc:         { status: 'desc' },
  // days elapsed maps to inverse submission date (oldest = most days)
  daysElapsed_desc:    { submissionDate: 'asc' },
  daysElapsed_asc:     { submissionDate: 'desc' },
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; stage?: string; sort?: string; page?: string }
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') redirect('/dashboard')

  const q      = searchParams.q?.trim() ?? ''
  const status = APP_STATUS_VALUES.has(searchParams.status as AppStatus)
    ? (searchParams.status as AppStatus)
    : undefined
  const stage  = STAGE_VALUES.has(searchParams.stage as Stage)
    ? (searchParams.stage as Stage)
    : undefined
  const sort   = searchParams.sort && SORT_MAP[searchParams.sort]
    ? searchParams.sort
    : 'submissionDate_desc'
  const page   = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  const where = {
    deletedAt: null,
    ...(q ? {
      OR: [
        { formNumber:   { contains: q, mode: 'insensitive' as const } },
        { modelName:    { contains: q, mode: 'insensitive' as const } },
        { manufacturer: { name: { contains: q, mode: 'insensitive' as const } } },
      ],
    } : {}),
    ...(status ? { status }              : {}),
    ...(stage  ? { currentStage: stage } : {}),
  }

  const [applications, total] = await Promise.all([
    prisma.application.findMany({
      where,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orderBy: SORT_MAP[sort] as any,
      skip:    (page - 1) * PAGE_SIZE,
      take:    PAGE_SIZE,
      select: {
        id:             true,
        formNumber:     true,
        modelName:      true,
        modelVariant:   true,
        currentStage:   true,
        status:         true,
        submissionDate:           true,
        reviewDecisionDate:       true,
        stage1ClosureDate:        true,
        stage2ClosureDate:        true,
        socSubmittedDate:         true,
        tcIssuedDate:             true,
        qciAgreementCompletedDate: true,
        manufacturer: { select: { name: true } },
        cb:           { select: { name: true } },
        addedBy:      { select: { fullName: true } },
      },
    }),
    prisma.application.count({ where }),
  ])

  return (
    <Registry
      applications={applications.map(a => ({
        id:             a.id,
        formNumber:     a.formNumber,
        modelName:      a.modelName,
        modelVariant:   a.modelVariant,
        currentStage:   a.currentStage,
        status:         a.status,
        submissionDate: a.submissionDate.toISOString(),
        manufacturer:   a.manufacturer,
        cb:             a.cb,
        addedBy:        a.addedBy,
        daysElapsed:    getTotalTat(a).elapsed,
      }))}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      isAdmin={user.role === 'ADMIN'}
      searchParams={{ q: searchParams.q, status: searchParams.status, stage: searchParams.stage, sort, page: searchParams.page }}
    />
  )
}
