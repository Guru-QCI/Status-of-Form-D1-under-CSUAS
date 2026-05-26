import { Stage } from '@prisma/client'

// Minimal fields needed by getTotalTat (used by both detail and registry).
export type TotalTatInput = {
  submissionDate: Date
  reviewDecisionDate: Date | null
  stage1ClosureDate: Date | null
  stage2ClosureDate: Date | null
  socSubmittedDate: Date | null
  tcIssuedDate: Date | null
  qciAgreementCompletedDate: Date | null
}

// Full set of fields needed by getStageTat (detail page only).
export type AppTatInput = TotalTatInput & {
  stage1ScheduleFrom: Date | null
  stage2ScheduleFrom: Date | null
  socReviewDate: Date | null
  dgcaReviewStartedAt: Date | null
  qciAgreementInitiatedDate: Date | null
}

export type StageTatResult = { elapsed: number | null; isComplete: boolean }

export function getDaysBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

export function getStageTat(app: AppTatInput, stage: Stage): StageTatResult {
  let start: Date | null = null
  let end:   Date | null = null

  switch (stage) {
    case Stage.APPLICATION_REVIEW:
      start = app.submissionDate
      end   = app.reviewDecisionDate
      break
    case Stage.STAGE_1:
      start = app.stage1ScheduleFrom
      end   = app.stage1ClosureDate
      break
    case Stage.STAGE_2:
      start = app.stage2ScheduleFrom
      end   = app.stage2ClosureDate
      break
    case Stage.TECHNICAL_REVIEW_SOC:
      start = app.socReviewDate
      end   = app.socSubmittedDate
      break
    case Stage.DGCA_REVIEW:
      start = app.dgcaReviewStartedAt
      end   = app.tcIssuedDate
      break
    case Stage.QCI_AGREEMENT:
      start = app.qciAgreementInitiatedDate
      end   = app.qciAgreementCompletedDate
      break
    default:
      return { elapsed: null, isComplete: false }
  }

  if (!start) return { elapsed: null, isComplete: false }

  const isComplete = end !== null
  const elapsed    = getDaysBetween(start, end ?? new Date())
  return { elapsed, isComplete }
}

const END_DATE_KEYS: (keyof TotalTatInput)[] = [
  'reviewDecisionDate',
  'stage1ClosureDate',
  'stage2ClosureDate',
  'socSubmittedDate',
  'tcIssuedDate',
  'qciAgreementCompletedDate',
]

export function getTotalTat(app: TotalTatInput): { elapsed: number; isComplete: boolean } {
  const latestEnd = END_DATE_KEYS
    .map(k => app[k] as Date | null)
    .filter((d): d is Date => d !== null)
    .reduce<Date | null>((latest, d) => (!latest || d > latest ? d : latest), null)

  const isComplete = app.tcIssuedDate !== null || app.qciAgreementCompletedDate !== null
  const elapsed    = Math.max(0, getDaysBetween(app.submissionDate, latestEnd ?? new Date()) ?? 0)

  return { elapsed, isComplete }
}
