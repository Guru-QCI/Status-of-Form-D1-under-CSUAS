'use server'

import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppStatus, Stage } from '@prisma/client'

const APP_STATUS_VALUES = new Set(Object.values(AppStatus))
const STAGE_VALUES      = new Set(Object.values(Stage))

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

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export async function exportApplicationsCsv(params: {
  q?: string
  status?: string
  stage?: string
}): Promise<{ csv: string } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const q      = params.q?.trim() ?? ''
  const status = APP_STATUS_VALUES.has(params.status as AppStatus)
    ? (params.status as AppStatus)
    : undefined
  const stage  = STAGE_VALUES.has(params.stage as Stage)
    ? (params.stage as Stage)
    : undefined

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

  const applications = await prisma.application.findMany({
    where,
    orderBy: { submissionDate: 'desc' },
    select: {
      formNumber:     true,
      modelName:      true,
      modelVariant:   true,
      currentStage:   true,
      status:         true,
      submissionDate: true,
      manufacturer: { select: { name: true } },
      cb:           { select: { name: true } },
      addedBy:      { select: { fullName: true } },
    },
  })

  const isAdmin = user.role === 'ADMIN'

  const headers = [
    'Form Number',
    'Model Name',
    'Model Variant',
    'Stage',
    'Status',
    'Submission Date',
    'Manufacturer',
    ...(isAdmin ? ['CB Name'] : []),
    'Added By',
  ]

  const rows = applications.map(a => [
    a.formNumber,
    a.modelName,
    a.modelVariant ?? '',
    STAGE_LABELS[a.currentStage],
    STATUS_LABELS[a.status],
    a.submissionDate.toISOString().split('T')[0],
    a.manufacturer.name,
    ...(isAdmin ? [a.cb.name] : []),
    a.addedBy.fullName,
  ])

  const csv = [headers, ...rows]
    .map(row => row.map(v => csvEscape(String(v))).join(','))
    .join('\n')

  return { csv }
}
