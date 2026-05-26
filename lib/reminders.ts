import { ReminderKind, AppStatus, QciAgreementStatus } from '@prisma/client'

const DAY_MS = 24 * 60 * 60 * 1000

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export type NcForReminder = {
  raisedDate: Date
  manufacturerResponseDate: Date | null
  closedDate: Date | null
}

export type SurveillanceForReminder = {
  plannedFrom: Date
  yearOfAudit: number
}

export type AppForReminder = {
  id: string
  formNumber: string
  modelName: string
  status: AppStatus
  submissionDate: Date
  reviewDecision: string | null
  socSubmittedDate: Date | null
  tcIssuedDate: Date | null
  qciAgreementStatus: QciAgreementStatus
  manufacturer: { contactEmail: string }
  cb: { contactEmail: string | null; isNabcbAccredited: boolean }
  cbUserEmails: string[]
  ncs: NcForReminder[]
  surveillances: SurveillanceForReminder[]
}

export type CandidateReminder = {
  kind: ReminderKind
  dueAt: Date
  message: string
  recipients: string[]
}

const NC_RESPONSE_WINDOW_DAYS = 15
const QCI_TARGET_DAYS         = 7
const SURVEILLANCE_LEAD_DAYS  = 30

function fmt(d: Date): string {
  return d.toISOString().split('T')[0]
}

function compact(arr: (string | null | undefined)[]): string[] {
  return arr.filter((s): s is string => !!s)
}

export function computeReminders(
  app: AppForReminder,
  adminEmails: string[],
  now: Date = new Date(),
): CandidateReminder[] {
  const results: CandidateReminder[] = []
  const cbEmails        = compact([app.cb.contactEmail, ...app.cbUserEmails])
  const cbAndAdmin      = [...cbEmails, ...adminEmails]
  const allStakeholders = [...cbAndAdmin, app.manufacturer.contactEmail]

  // 1. CB_DECISION_DAY_6
  if (app.status === AppStatus.IN_PROGRESS && app.reviewDecision === null) {
    const dueAt = startOfDay(addDays(app.submissionDate, 6))
    if (now >= dueAt) {
      results.push({
        kind: ReminderKind.CB_DECISION_DAY_6,
        dueAt,
        message: `Application ${app.formNumber} (${app.modelName}): no CB review decision after 6 days. Submitted on ${fmt(app.submissionDate)}.`,
        recipients: cbAndAdmin,
      })
    }
  }

  // 2. PROCESS_1_TO_4_DAY_60
  if (app.status === AppStatus.IN_PROGRESS && app.socSubmittedDate === null) {
    const dueAt = startOfDay(addDays(app.submissionDate, 60))
    if (now >= dueAt) {
      results.push({
        kind: ReminderKind.PROCESS_1_TO_4_DAY_60,
        dueAt,
        message: `Application ${app.formNumber} (${app.modelName}): 60 days from submission (${fmt(app.submissionDate)}) without SoC submission — Processes 1–4 not complete.`,
        recipients: allStakeholders,
      })
    }
  }

  // 3. DGCA_REVIEW_DAY_15
  if (app.socSubmittedDate !== null && app.tcIssuedDate === null) {
    const dueAt = startOfDay(addDays(app.socSubmittedDate, 15))
    if (now >= dueAt) {
      results.push({
        kind: ReminderKind.DGCA_REVIEW_DAY_15,
        dueAt,
        message: `Application ${app.formNumber} (${app.modelName}): DGCA review pending 15 days since SoC submission on ${fmt(app.socSubmittedDate)}.`,
        recipients: adminEmails,
      })
    }
  }

  // 4. NC_RESPONSE_OVERDUE — one entry per overdue NC
  for (const nc of app.ncs) {
    if (nc.manufacturerResponseDate === null && nc.closedDate === null) {
      const dueAt = startOfDay(addDays(nc.raisedDate, NC_RESPONSE_WINDOW_DAYS))
      if (now >= dueAt) {
        results.push({
          kind: ReminderKind.NC_RESPONSE_OVERDUE,
          dueAt,
          message: `Application ${app.formNumber}: NC raised on ${fmt(nc.raisedDate)} has no manufacturer response after ${NC_RESPONSE_WINDOW_DAYS} days.`,
          recipients: allStakeholders,
        })
      }
    }
  }

  // 5. QCI_AGREEMENT_PENDING — daily re-fire until INITIATED; each calendar day is a distinct DB record
  if (app.tcIssuedDate !== null && app.qciAgreementStatus === QciAgreementStatus.NOT_STARTED) {
    const firstFire = startOfDay(addDays(app.tcIssuedDate, 1))
    if (now >= firstFire) {
      results.push({
        kind: ReminderKind.QCI_AGREEMENT_PENDING,
        dueAt: startOfDay(now),
        message: `Application ${app.formNumber} (${app.modelName}): QCI–Manufacturer Agreement not yet initiated. TC issued on ${fmt(app.tcIssuedDate)}.`,
        recipients: allStakeholders,
      })
    }
  }

  // 6. QCI_AGREEMENT_OVERDUE — day 7 from TC issuance if not COMPLETED
  if (app.tcIssuedDate !== null && app.qciAgreementStatus !== QciAgreementStatus.COMPLETED) {
    const dueAt = startOfDay(addDays(app.tcIssuedDate, QCI_TARGET_DAYS))
    if (now >= dueAt) {
      results.push({
        kind: ReminderKind.QCI_AGREEMENT_OVERDUE,
        dueAt,
        message: `Application ${app.formNumber} (${app.modelName}): QCI–Manufacturer Agreement overdue — ${QCI_TARGET_DAYS} days since TC issuance on ${fmt(app.tcIssuedDate)}. Status: ${app.qciAgreementStatus}.`,
        recipients: allStakeholders,
      })
    }
  }

  // 7. SURVEILLANCE_DUE — 30 days before each planned audit (NABCB-accredited CBs only)
  if (app.cb.isNabcbAccredited) {
    for (const surv of app.surveillances) {
      const dueAt = startOfDay(addDays(surv.plannedFrom, -SURVEILLANCE_LEAD_DAYS))
      if (now >= dueAt) {
        results.push({
          kind: ReminderKind.SURVEILLANCE_DUE,
          dueAt,
          message: `Application ${app.formNumber} (${app.modelName}): surveillance audit year ${surv.yearOfAudit} starts ${fmt(surv.plannedFrom)} — ${SURVEILLANCE_LEAD_DAYS}-day preparation window now open.`,
          recipients: cbAndAdmin,
        })
      }
    }
  }

  return results
}
