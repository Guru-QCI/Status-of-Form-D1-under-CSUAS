import { describe, it, expect } from 'vitest'
import { AppStatus, Stage } from '@prisma/client'
import {
  getDaysBetween,
  getStageTat,
  getTotalTat,
  type AppTatInput,
  type TotalTatInput,
} from '@/lib/tat'

const D = (s: string) => new Date(s)

const BASE: AppTatInput = {
  status:                    AppStatus.IN_PROGRESS,
  currentStage:              Stage.APPLICATION_REVIEW,
  submissionDate:            D('2026-01-01'),
  reviewDecisionDate:        null,
  stage1ScheduleFrom:        null,
  stage1ClosureDate:         null,
  stage2ScheduleFrom:        null,
  stage2ClosureDate:         null,
  socReviewDate:             null,
  socSubmittedDate:          null,
  dgcaReviewStartedAt:       null,
  tcIssuedDate:              null,
  qciAgreementInitiatedDate: null,
  qciAgreementCompletedDate: null,
}

// ─── getDaysBetween ────────────────────────────────────────────────────────────

describe('getDaysBetween', () => {
  it('returns null when start is null', () => {
    expect(getDaysBetween(null, D('2026-01-10'))).toBeNull()
  })
  it('returns null when end is null', () => {
    expect(getDaysBetween(D('2026-01-01'), null)).toBeNull()
  })
  it('returns 0 for the same instant', () => {
    expect(getDaysBetween(D('2026-01-10'), D('2026-01-10'))).toBe(0)
  })
  it('returns 1 for exactly 24 hours', () => {
    expect(getDaysBetween(D('2026-01-01T00:00:00Z'), D('2026-01-02T00:00:00Z'))).toBe(1)
  })
  it('returns 10 for a 10-day gap', () => {
    expect(getDaysBetween(D('2026-01-01'), D('2026-01-11'))).toBe(10)
  })
  it('floors fractional days (1 day + 12 hours → 1)', () => {
    expect(getDaysBetween(D('2026-01-01T00:00:00Z'), D('2026-01-02T12:00:00Z'))).toBe(1)
  })
})

// ─── getStageTat ───────────────────────────────────────────────────────────────

describe('getStageTat — APPLICATION_REVIEW', () => {
  it('is in-progress when reviewDecisionDate is null', () => {
    const r = getStageTat(BASE, Stage.APPLICATION_REVIEW)
    expect(r.isComplete).toBe(false)
    expect(r.elapsed).not.toBeNull()
  })
  it('is complete and elapsed = 10 when reviewDecisionDate is Jan 11', () => {
    const r = getStageTat({ ...BASE, reviewDecisionDate: D('2026-01-11') }, Stage.APPLICATION_REVIEW)
    expect(r.isComplete).toBe(true)
    expect(r.elapsed).toBe(10)
  })
})

describe('getStageTat — STAGE_1', () => {
  it('returns null elapsed when stage1ScheduleFrom is null', () => {
    expect(getStageTat(BASE, Stage.STAGE_1)).toEqual({ elapsed: null, isComplete: false })
  })
  it('is in-progress when stage1ClosureDate is null', () => {
    const r = getStageTat({ ...BASE, stage1ScheduleFrom: D('2026-01-20') }, Stage.STAGE_1)
    expect(r.isComplete).toBe(false)
    expect(r.elapsed).not.toBeNull()
  })
  it('is complete with elapsed = 15 when both dates set', () => {
    const r = getStageTat(
      { ...BASE, stage1ScheduleFrom: D('2026-01-20'), stage1ClosureDate: D('2026-02-04') },
      Stage.STAGE_1,
    )
    expect(r.isComplete).toBe(true)
    expect(r.elapsed).toBe(15)
  })
})

describe('getStageTat — STAGE_2', () => {
  it('returns null elapsed when stage2ScheduleFrom is null', () => {
    expect(getStageTat(BASE, Stage.STAGE_2)).toEqual({ elapsed: null, isComplete: false })
  })
  it('is complete with elapsed = 20', () => {
    const r = getStageTat(
      { ...BASE, stage2ScheduleFrom: D('2026-02-01'), stage2ClosureDate: D('2026-02-21') },
      Stage.STAGE_2,
    )
    expect(r.isComplete).toBe(true)
    expect(r.elapsed).toBe(20)
  })
})

describe('getStageTat — TECHNICAL_REVIEW_SOC', () => {
  it('returns null elapsed when socReviewDate is null', () => {
    expect(getStageTat(BASE, Stage.TECHNICAL_REVIEW_SOC)).toEqual({ elapsed: null, isComplete: false })
  })
  it('is complete when socSubmittedDate is set', () => {
    const r = getStageTat(
      { ...BASE, socReviewDate: D('2026-02-10'), socSubmittedDate: D('2026-02-17') },
      Stage.TECHNICAL_REVIEW_SOC,
    )
    expect(r.isComplete).toBe(true)
    expect(r.elapsed).toBe(7)
  })
})

describe('getStageTat — DGCA_REVIEW', () => {
  it('returns null elapsed when dgcaReviewStartedAt is null', () => {
    expect(getStageTat(BASE, Stage.DGCA_REVIEW)).toEqual({ elapsed: null, isComplete: false })
  })
  it('is complete when tcIssuedDate is set', () => {
    const r = getStageTat(
      { ...BASE, dgcaReviewStartedAt: D('2026-02-20'), tcIssuedDate: D('2026-03-02') },
      Stage.DGCA_REVIEW,
    )
    expect(r.isComplete).toBe(true)
    expect(r.elapsed).toBe(10)
  })
})

describe('getStageTat — QCI_AGREEMENT', () => {
  it('returns null elapsed when qciAgreementInitiatedDate is null', () => {
    expect(getStageTat(BASE, Stage.QCI_AGREEMENT)).toEqual({ elapsed: null, isComplete: false })
  })
  it('is complete when qciAgreementCompletedDate is set', () => {
    const r = getStageTat(
      {
        ...BASE,
        qciAgreementInitiatedDate:  D('2026-03-01'),
        qciAgreementCompletedDate:  D('2026-03-06'),
      },
      Stage.QCI_AGREEMENT,
    )
    expect(r.isComplete).toBe(true)
    expect(r.elapsed).toBe(5)
  })
})

describe('getStageTat — unmeasured stage', () => {
  it('returns null/false for POST_TC_SURVEILLANCE', () => {
    expect(getStageTat(BASE, Stage.POST_TC_SURVEILLANCE)).toEqual({ elapsed: null, isComplete: false })
  })
})

// ─── getTotalTat ───────────────────────────────────────────────────────────────

describe('getTotalTat', () => {
  const BASE_TOTAL: TotalTatInput = {
    status:                    AppStatus.IN_PROGRESS,
    currentStage:              Stage.APPLICATION_REVIEW,
    submissionDate:            D('2026-01-01'),
    reviewDecisionDate:        null,
    stage1ClosureDate:         null,
    stage2ClosureDate:         null,
    socSubmittedDate:          null,
    tcIssuedDate:              null,
    qciAgreementCompletedDate: null,
  }

  it('is not complete when status is IN_PROGRESS', () => {
    const r = getTotalTat(BASE_TOTAL)
    expect(r.isComplete).toBe(false)
    expect(r.elapsed).toBeGreaterThanOrEqual(0)
  })

  it('is complete when status is TC_ISSUED', () => {
    expect(getTotalTat({ ...BASE_TOTAL, status: AppStatus.TC_ISSUED }).isComplete).toBe(true)
  })

  it('is complete when currentStage is POST_TC_SURVEILLANCE', () => {
    expect(getTotalTat({ ...BASE_TOTAL, currentStage: Stage.POST_TC_SURVEILLANCE }).isComplete).toBe(true)
  })

  it('uses the latest end date for elapsed — tcIssuedDate (59 days)', () => {
    const r = getTotalTat({
      ...BASE_TOTAL,
      status:             AppStatus.TC_ISSUED,
      reviewDecisionDate: D('2026-01-20'),
      stage1ClosureDate:  D('2026-02-10'),
      tcIssuedDate:       D('2026-03-01'),
    })
    // Jan 1 → Mar 1 = 31 + 28 = 59 days
    expect(r.elapsed).toBe(59)
    expect(r.isComplete).toBe(true)
  })

  it('prefers qciAgreementCompletedDate over tcIssuedDate when later', () => {
    const r = getTotalTat({
      ...BASE_TOTAL,
      status:                    AppStatus.TC_ISSUED,
      currentStage:              Stage.POST_TC_SURVEILLANCE,
      tcIssuedDate:              D('2026-03-01'),
      qciAgreementCompletedDate: D('2026-04-01'),
    })
    // Jan 1 → Apr 1 = 31 + 28 + 31 = 90 days
    expect(r.elapsed).toBe(90)
    expect(r.isComplete).toBe(true)
  })
})
