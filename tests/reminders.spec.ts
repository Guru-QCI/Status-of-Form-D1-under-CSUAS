import { describe, it, expect } from 'vitest'
import { ReminderKind, AppStatus, QciAgreementStatus } from '@prisma/client'
import { computeReminders, type AppForReminder } from '@/lib/reminders'

// Fixed point in time for all tests
const NOW = new Date('2026-03-01T12:00:00Z')

const BASE: AppForReminder = {
  id:                 'app-1',
  formNumber:         'D1/001/2025',
  modelName:          'Drone X',
  status:             AppStatus.IN_PROGRESS,
  submissionDate:     new Date('2026-01-01T00:00:00Z'),
  reviewDecision:     null,
  socSubmittedDate:   null,
  tcIssuedDate:       null,
  qciAgreementStatus: QciAgreementStatus.NOT_STARTED,
  manufacturer:       { contactEmail: 'mfr@example.com' },
  cb:                 { contactEmail: 'cb@example.com', isNabcbAccredited: false },
  cbUserEmails:       [],
  ncs:                [],
  surveillances:      [],
}

function kinds(rs: ReturnType<typeof computeReminders>): ReminderKind[] {
  return rs.map(r => r.kind)
}

// ─── CB_DECISION_DAY_6 ─────────────────────────────────────────────────────────

describe('CB_DECISION_DAY_6', () => {
  it('fires when 6+ days since submission with no review decision', () => {
    // submissionDate Jan 1, now Mar 1 = 59 days → dueAt Jan 7 → fires
    expect(kinds(computeReminders(BASE, [], NOW))).toContain(ReminderKind.CB_DECISION_DAY_6)
  })
  it('does not fire before day 6', () => {
    // submissionDate Feb 27, dueAt = Mar 5, now Mar 1 → not yet
    const app = { ...BASE, submissionDate: new Date('2026-02-27T00:00:00Z') }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.CB_DECISION_DAY_6)
  })
  it('does not fire when reviewDecision is set', () => {
    const app = { ...BASE, reviewDecision: 'ACCEPTED' }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.CB_DECISION_DAY_6)
  })
  it('does not fire for a REJECTED application', () => {
    const app = { ...BASE, status: AppStatus.REJECTED }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.CB_DECISION_DAY_6)
  })
})

// ─── PROCESS_1_TO_4_DAY_60 ────────────────────────────────────────────────────

describe('PROCESS_1_TO_4_DAY_60', () => {
  it('fires when 60+ days since submission with no SoC', () => {
    // submissionDate Dec 31 → dueAt Mar 1 → now >= dueAt
    const app = { ...BASE, submissionDate: new Date('2025-12-31T00:00:00Z') }
    expect(kinds(computeReminders(app, [], NOW))).toContain(ReminderKind.PROCESS_1_TO_4_DAY_60)
  })
  it('does not fire before day 60', () => {
    // submissionDate Jan 1 → dueAt Mar 2, now Mar 1 → not yet
    expect(kinds(computeReminders(BASE, [], NOW))).not.toContain(ReminderKind.PROCESS_1_TO_4_DAY_60)
  })
  it('does not fire when socSubmittedDate is set', () => {
    const app = {
      ...BASE,
      submissionDate:   new Date('2025-12-01T00:00:00Z'),
      socSubmittedDate: new Date('2026-02-01T00:00:00Z'),
    }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.PROCESS_1_TO_4_DAY_60)
  })
})

// ─── DGCA_REVIEW_DAY_15 ───────────────────────────────────────────────────────

describe('DGCA_REVIEW_DAY_15', () => {
  it('fires when 15+ days since SoC with no TC', () => {
    // socSubmittedDate Feb 10, now Mar 1 = 19 days
    const app = { ...BASE, socSubmittedDate: new Date('2026-02-10T00:00:00Z') }
    expect(kinds(computeReminders(app, [], NOW))).toContain(ReminderKind.DGCA_REVIEW_DAY_15)
  })
  it('does not fire before day 15', () => {
    // socSubmittedDate Feb 25, now Mar 1 = 4 days
    const app = { ...BASE, socSubmittedDate: new Date('2026-02-25T00:00:00Z') }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.DGCA_REVIEW_DAY_15)
  })
  it('does not fire when TC is already issued', () => {
    const app = {
      ...BASE,
      socSubmittedDate: new Date('2026-01-01T00:00:00Z'),
      tcIssuedDate:     new Date('2026-02-01T00:00:00Z'),
    }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.DGCA_REVIEW_DAY_15)
  })
})

// ─── NC_RESPONSE_OVERDUE ──────────────────────────────────────────────────────

describe('NC_RESPONSE_OVERDUE', () => {
  it('fires once per NC that is overdue without response', () => {
    const app = {
      ...BASE,
      ncs: [
        { raisedDate: new Date('2026-01-10T00:00:00Z'), manufacturerResponseDate: null, closedDate: null },
        { raisedDate: new Date('2026-01-20T00:00:00Z'), manufacturerResponseDate: null, closedDate: null },
      ],
    }
    const rs = computeReminders(app, [], NOW).filter(r => r.kind === ReminderKind.NC_RESPONSE_OVERDUE)
    expect(rs).toHaveLength(2)
  })
  it('does not fire when manufacturer has responded', () => {
    const app = {
      ...BASE,
      ncs: [{
        raisedDate:               new Date('2026-01-01T00:00:00Z'),
        manufacturerResponseDate: new Date('2026-01-10T00:00:00Z'),
        closedDate:               null,
      }],
    }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.NC_RESPONSE_OVERDUE)
  })
  it('does not fire when NC is closed', () => {
    const app = {
      ...BASE,
      ncs: [{
        raisedDate:               new Date('2026-01-01T00:00:00Z'),
        manufacturerResponseDate: null,
        closedDate:               new Date('2026-01-20T00:00:00Z'),
      }],
    }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.NC_RESPONSE_OVERDUE)
  })
  it('does not fire for recent NCs (< 15 days)', () => {
    // raised Feb 25, dueAt Mar 12, now Mar 1 → not yet
    const app = {
      ...BASE,
      ncs: [{
        raisedDate:               new Date('2026-02-25T00:00:00Z'),
        manufacturerResponseDate: null,
        closedDate:               null,
      }],
    }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.NC_RESPONSE_OVERDUE)
  })
})

// ─── QCI_AGREEMENT_PENDING ────────────────────────────────────────────────────

describe('QCI_AGREEMENT_PENDING', () => {
  const tcApp = { ...BASE, tcIssuedDate: new Date('2026-02-01T00:00:00Z') }

  it('fires when TC issued, NOT_STARTED, and past day 1', () => {
    expect(kinds(computeReminders(tcApp, [], NOW))).toContain(ReminderKind.QCI_AGREEMENT_PENDING)
  })
  it('does not fire when qciAgreementStatus is INITIATED', () => {
    const app = { ...tcApp, qciAgreementStatus: QciAgreementStatus.INITIATED }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.QCI_AGREEMENT_PENDING)
  })
  it('does not fire when qciAgreementStatus is COMPLETED', () => {
    const app = { ...tcApp, qciAgreementStatus: QciAgreementStatus.COMPLETED }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.QCI_AGREEMENT_PENDING)
  })
  it('dueAt is startOfDay(now)', () => {
    const r = computeReminders(tcApp, [], NOW).find(r => r.kind === ReminderKind.QCI_AGREEMENT_PENDING)!
    expect(r.dueAt.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })
})

// ─── QCI_AGREEMENT_OVERDUE ────────────────────────────────────────────────────

describe('QCI_AGREEMENT_OVERDUE', () => {
  it('fires when not COMPLETED after 7 days', () => {
    // tcIssuedDate Feb 1, now Mar 1 = 28 days
    const app = { ...BASE, tcIssuedDate: new Date('2026-02-01T00:00:00Z') }
    expect(kinds(computeReminders(app, [], NOW))).toContain(ReminderKind.QCI_AGREEMENT_OVERDUE)
  })
  it('does not fire before day 7', () => {
    // tcIssuedDate Feb 28, now Mar 1 = 1 day
    const app = { ...BASE, tcIssuedDate: new Date('2026-02-28T00:00:00Z') }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.QCI_AGREEMENT_OVERDUE)
  })
  it('does not fire when COMPLETED', () => {
    const app = {
      ...BASE,
      tcIssuedDate:       new Date('2026-01-01T00:00:00Z'),
      qciAgreementStatus: QciAgreementStatus.COMPLETED,
    }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.QCI_AGREEMENT_OVERDUE)
  })
  it('fires for INITIATED status (not yet complete)', () => {
    const app = {
      ...BASE,
      tcIssuedDate:       new Date('2026-02-01T00:00:00Z'),
      qciAgreementStatus: QciAgreementStatus.INITIATED,
    }
    expect(kinds(computeReminders(app, [], NOW))).toContain(ReminderKind.QCI_AGREEMENT_OVERDUE)
  })
})

// ─── SURVEILLANCE_DUE ─────────────────────────────────────────────────────────

describe('SURVEILLANCE_DUE', () => {
  const nabcbApp = {
    ...BASE,
    cb: { contactEmail: 'cb@example.com', isNabcbAccredited: true },
  }

  it('does not fire for non-NABCB CBs', () => {
    const app = {
      ...BASE,
      surveillances: [{ plannedFrom: new Date('2026-03-31T00:00:00Z'), yearOfAudit: 1 }],
    }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.SURVEILLANCE_DUE)
  })
  it('fires within the 30-day lead window (plannedFrom = Mar 31)', () => {
    // dueAt = startOfDay(Mar 31 − 30) = Mar 1 → now Mar 1 12:00 >= Mar 1 00:00
    const app = {
      ...nabcbApp,
      surveillances: [{ plannedFrom: new Date('2026-03-31T00:00:00Z'), yearOfAudit: 1 }],
    }
    expect(kinds(computeReminders(app, [], NOW))).toContain(ReminderKind.SURVEILLANCE_DUE)
  })
  it('does not fire outside the lead window (plannedFrom = Apr 1)', () => {
    // dueAt = startOfDay(Apr 1 − 30) = Mar 2 → now Mar 1 < Mar 2
    const app = {
      ...nabcbApp,
      surveillances: [{ plannedFrom: new Date('2026-04-01T00:00:00Z'), yearOfAudit: 1 }],
    }
    expect(kinds(computeReminders(app, [], NOW))).not.toContain(ReminderKind.SURVEILLANCE_DUE)
  })
  it('fires one reminder per surveillance in window', () => {
    const app = {
      ...nabcbApp,
      surveillances: [
        { plannedFrom: new Date('2026-03-15T00:00:00Z'), yearOfAudit: 1 },
        { plannedFrom: new Date('2026-03-31T00:00:00Z'), yearOfAudit: 2 },
      ],
    }
    const rs = computeReminders(app, [], NOW).filter(r => r.kind === ReminderKind.SURVEILLANCE_DUE)
    expect(rs).toHaveLength(2)
  })
})
