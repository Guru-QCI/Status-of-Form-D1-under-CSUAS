import { describe, it, expect } from 'vitest'
import { Stage } from '@prisma/client'
import {
  getBlockingReason,
  canAdvance,
  nextStageFor,
  type AppStateInput,
  type UserStateInput,
} from '@/lib/state-machine'

const BASE: AppStateInput = {
  cbId:               'cb-1',
  status:             'IN_PROGRESS',
  currentStage:       Stage.APPLICATION_REVIEW,
  reviewDecisionDate: null,
  reviewDecision:     null,
  stage1ClosureDate:  null,
  stage2ClosureDate:  null,
  socSubmittedDate:   null,
  qciAgreementStatus: 'NOT_STARTED',
}

const CB1: UserStateInput = { role: 'CB_USER', cbId: 'cb-1' }
const CB2: UserStateInput = { role: 'CB_USER', cbId: 'cb-2' }
const ADMIN: UserStateInput = { role: 'ADMIN',   cbId: null  }

const D = (s: string) => new Date(s)

describe('nextStageFor', () => {
  it('returns null for terminal stages', () => {
    expect(nextStageFor(Stage.POST_TC_SURVEILLANCE)).toBeNull()
  })
  it('returns STAGE_1 from APPLICATION_REVIEW', () => {
    expect(nextStageFor(Stage.APPLICATION_REVIEW)).toBe(Stage.STAGE_1)
  })
  it('returns POST_TC_SURVEILLANCE from QCI_AGREEMENT', () => {
    expect(nextStageFor(Stage.QCI_AGREEMENT)).toBe(Stage.POST_TC_SURVEILLANCE)
  })
})

describe('getBlockingReason — common guards', () => {
  it('rejects an invalid transition target', () => {
    const r = getBlockingReason(BASE, Stage.STAGE_2, CB1, 0)
    expect(r).toMatch(/not a valid transition/)
  })

  it('blocks when status is not IN_PROGRESS', () => {
    const app = { ...BASE, status: 'REJECTED' }
    expect(getBlockingReason(app, Stage.STAGE_1, CB1, 0)).toMatch(/status is REJECTED/)
  })

  it('blocks every transition when open NCs > 0', () => {
    const app = { ...BASE, reviewDecisionDate: D('2026-01-10'), reviewDecision: 'ACCEPTED' }
    expect(getBlockingReason(app, Stage.STAGE_1, CB1, 3)).toMatch(/3 non-conformities/)
  })
})

describe('APPLICATION_REVIEW → STAGE_1', () => {
  const readyApp: AppStateInput = {
    ...BASE,
    reviewDecisionDate: D('2026-01-10'),
    reviewDecision:     'ACCEPTED',
  }

  it('ADMIN cannot advance (CB-only transition)', () => {
    expect(getBlockingReason(readyApp, Stage.STAGE_1, ADMIN, 0)).toMatch(/Only CB users/)
  })
  it('wrong-CB CB_USER cannot advance', () => {
    expect(getBlockingReason(readyApp, Stage.STAGE_1, CB2, 0)).toMatch(/own CB/)
  })
  it('blocks when reviewDecisionDate is missing', () => {
    const app = { ...readyApp, reviewDecisionDate: null }
    expect(getBlockingReason(app, Stage.STAGE_1, CB1, 0)).toMatch(/decision date/)
  })
  it('blocks when reviewDecision is REJECTED', () => {
    const app = { ...readyApp, reviewDecision: 'REJECTED' }
    expect(getBlockingReason(app, Stage.STAGE_1, CB1, 0)).toMatch(/Accepted/)
  })
  it('allows when all conditions met', () => {
    expect(getBlockingReason(readyApp, Stage.STAGE_1, CB1, 0)).toBeNull()
    expect(canAdvance(readyApp, Stage.STAGE_1, CB1, 0)).toBe(true)
  })
})

describe('STAGE_1 → STAGE_2', () => {
  const base: AppStateInput = { ...BASE, currentStage: Stage.STAGE_1 }

  it('ADMIN cannot advance', () => {
    expect(getBlockingReason({ ...base, stage1ClosureDate: D('2026-01-20') }, Stage.STAGE_2, ADMIN, 0))
      .toMatch(/Only CB users/)
  })
  it('blocks when stage1ClosureDate missing', () => {
    expect(getBlockingReason(base, Stage.STAGE_2, CB1, 0)).toMatch(/Stage 1 closure/)
  })
  it('allows when stage1ClosureDate present', () => {
    expect(getBlockingReason({ ...base, stage1ClosureDate: D('2026-01-20') }, Stage.STAGE_2, CB1, 0)).toBeNull()
  })
})

describe('STAGE_2 → TECHNICAL_REVIEW_SOC', () => {
  const base: AppStateInput = { ...BASE, currentStage: Stage.STAGE_2 }

  it('ADMIN cannot advance', () => {
    expect(getBlockingReason({ ...base, stage2ClosureDate: D('2026-02-01') }, Stage.TECHNICAL_REVIEW_SOC, ADMIN, 0))
      .toMatch(/Only CB users/)
  })
  it('blocks when stage2ClosureDate missing', () => {
    expect(getBlockingReason(base, Stage.TECHNICAL_REVIEW_SOC, CB1, 0)).toMatch(/Stage 2 closure/)
  })
  it('allows when stage2ClosureDate present', () => {
    expect(getBlockingReason({ ...base, stage2ClosureDate: D('2026-02-01') }, Stage.TECHNICAL_REVIEW_SOC, CB1, 0)).toBeNull()
  })
})

describe('TECHNICAL_REVIEW_SOC → DGCA_REVIEW', () => {
  const base: AppStateInput = { ...BASE, currentStage: Stage.TECHNICAL_REVIEW_SOC }

  it('CB_USER cannot advance (admin-only)', () => {
    expect(getBlockingReason({ ...base, socSubmittedDate: D('2026-02-10') }, Stage.DGCA_REVIEW, CB1, 0))
      .toMatch(/Only admins/)
  })
  it('blocks when socSubmittedDate missing', () => {
    expect(getBlockingReason(base, Stage.DGCA_REVIEW, ADMIN, 0)).toMatch(/SoC submitted/)
  })
  it('allows when socSubmittedDate present', () => {
    expect(getBlockingReason({ ...base, socSubmittedDate: D('2026-02-10') }, Stage.DGCA_REVIEW, ADMIN, 0)).toBeNull()
  })
})

describe('DGCA_REVIEW → TC_ISSUED', () => {
  const base: AppStateInput = { ...BASE, currentStage: Stage.DGCA_REVIEW }

  it('CB_USER cannot advance', () => {
    expect(getBlockingReason(base, Stage.TC_ISSUED, CB1, 0)).toMatch(/Only admins/)
  })
  it('ADMIN with 0 NCs can advance', () => {
    expect(getBlockingReason(base, Stage.TC_ISSUED, ADMIN, 0)).toBeNull()
  })
})

describe('TC_ISSUED → QCI_AGREEMENT', () => {
  const base: AppStateInput = { ...BASE, currentStage: Stage.TC_ISSUED }

  it('CB_USER cannot advance', () => {
    expect(getBlockingReason(base, Stage.QCI_AGREEMENT, CB1, 0)).toMatch(/Only admins/)
  })
  it('ADMIN can advance', () => {
    expect(getBlockingReason(base, Stage.QCI_AGREEMENT, ADMIN, 0)).toBeNull()
  })
})

describe('QCI_AGREEMENT → POST_TC_SURVEILLANCE', () => {
  const base: AppStateInput = { ...BASE, currentStage: Stage.QCI_AGREEMENT }

  it('CB_USER cannot advance', () => {
    expect(getBlockingReason({ ...base, qciAgreementStatus: 'COMPLETED' }, Stage.POST_TC_SURVEILLANCE, CB1, 0))
      .toMatch(/Only admins/)
  })
  it('blocks when qciAgreementStatus is NOT_STARTED', () => {
    expect(getBlockingReason(base, Stage.POST_TC_SURVEILLANCE, ADMIN, 0))
      .toMatch(/QCI.*Agreement must be completed/)
  })
  it('blocks when qciAgreementStatus is INITIATED', () => {
    expect(getBlockingReason({ ...base, qciAgreementStatus: 'INITIATED' }, Stage.POST_TC_SURVEILLANCE, ADMIN, 0))
      .toMatch(/QCI.*Agreement must be completed/)
  })
  it('allows when COMPLETED and 0 NCs', () => {
    expect(getBlockingReason({ ...base, qciAgreementStatus: 'COMPLETED' }, Stage.POST_TC_SURVEILLANCE, ADMIN, 0)).toBeNull()
    expect(canAdvance({ ...base, qciAgreementStatus: 'COMPLETED' }, Stage.POST_TC_SURVEILLANCE, ADMIN, 0)).toBe(true)
  })
  it('blocks when COMPLETED but open NCs exist', () => {
    expect(getBlockingReason({ ...base, qciAgreementStatus: 'COMPLETED' }, Stage.POST_TC_SURVEILLANCE, ADMIN, 1))
      .toMatch(/non-conformit/)
  })
})
