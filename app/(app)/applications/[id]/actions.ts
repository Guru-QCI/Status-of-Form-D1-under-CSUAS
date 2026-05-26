'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSignedUrl } from '@/lib/storage'
import { Stage, QciAgreementStatus, ReviewDecision, RejectionCategory, AppStatus } from '@prisma/client'
import { nextStageFor, getBlockingReason } from '@/lib/state-machine'
import type { EventType } from '@/lib/state-machine'

export async function getDocumentSignedUrl(
  documentId: string,
): Promise<{ url: string } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      storagePath: true,
      application: { select: { cbId: true } },
    },
  })

  if (!doc) return { error: 'Document not found.' }

  if (user.role === 'CB_USER' && doc.application.cbId !== user.cbId) {
    return { error: 'Forbidden.' }
  }

  return generateSignedUrl(doc.storagePath, 60)
}

// ─── advanceStage ─────────────────────────────────────────────────────────────

export async function advanceStage(
  applicationId: string,
): Promise<{ success: true; newStage: Stage } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      cbId:               true,
      status:             true,
      currentStage:       true,
      reviewDecisionDate: true,
      reviewDecision:     true,
      stage1ClosureDate:  true,
      stage2ClosureDate:  true,
      socSubmittedDate:   true,
      qciAgreementStatus: true,
      _count: { select: { ncs: { where: { closedDate: null } } } },
    },
  })
  if (!app) return { error: 'Application not found.' }

  const targetStage = nextStageFor(app.currentStage)
  if (!targetStage) return { error: 'No further stage transitions available.' }

  const openNcCount = app._count.ncs
  const blocking = getBlockingReason(
    {
      cbId:               app.cbId,
      status:             app.status,
      currentStage:       app.currentStage,
      reviewDecisionDate: app.reviewDecisionDate,
      reviewDecision:     app.reviewDecision ?? null,
      stage1ClosureDate:  app.stage1ClosureDate,
      stage2ClosureDate:  app.stage2ClosureDate,
      socSubmittedDate:   app.socSubmittedDate,
      qciAgreementStatus: app.qciAgreementStatus,
    },
    targetStage,
    { role: user.role, cbId: user.cbId ?? null },
    openNcCount,
  )
  if (blocking) return { error: blocking }

  const prevStage = app.currentStage
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        currentStage: targetStage,
        ...(targetStage === Stage.TC_ISSUED
          ? { tcIssuedDate: now }
          : {}),
        ...(targetStage === Stage.QCI_AGREEMENT
          ? { qciAgreementStatus: QciAgreementStatus.INITIATED, qciAgreementInitiatedDate: now }
          : {}),
      },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'STAGE_ADVANCED' satisfies EventType,
        payload:   { from: prevStage, to: targetStage },
        actorId:   user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${applicationId}`)
  return { success: true, newStage: targetStage }
}

// ─── raiseNonConformity ───────────────────────────────────────────────────────

export async function raiseNonConformity(
  applicationId: string,
  description: string,
): Promise<{ success: true; ncId: string } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const desc = description.trim()
  if (!desc) return { error: 'Description is required.' }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, currentStage: true, cbId: true },
  })
  if (!app) return { error: 'Application not found.' }
  if (user.role === 'CB_USER' && app.cbId !== user.cbId) {
    return { error: 'You can only raise NCs for your own CB.' }
  }

  const { id: ncId } = await prisma.$transaction(async (tx) => {
    const iteration = await tx.nonConformity.count({
      where: { applicationId, stage: app.currentStage },
    })
    const nc = await tx.nonConformity.create({
      data: {
        applicationId,
        stage:       app.currentStage,
        iteration:   iteration + 1,
        raisedDate:  new Date(),
        description: desc,
      },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'NC_RAISED' satisfies EventType,
        payload:   { ncId: nc.id, description: desc },
        actorId:   user.appUser.id,
      },
    })
    return nc
  })

  revalidatePath(`/applications/${applicationId}`)
  return { success: true, ncId }
}

// ─── clearNonConformity ───────────────────────────────────────────────────────

export async function clearNonConformity(
  ncId: string,
  closureEvidence?: string,
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const nc = await prisma.nonConformity.findUnique({
    where: { id: ncId },
    select: {
      applicationId: true,
      closedDate:    true,
      application:   { select: { cbId: true } },
    },
  })
  if (!nc) return { error: 'Non-conformity not found.' }
  if (nc.closedDate) return { error: 'This non-conformity is already cleared.' }
  if (user.role === 'CB_USER' && nc.application.cbId !== user.cbId) {
    return { error: 'You can only clear NCs for your own CB.' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.nonConformity.update({
      where: { id: ncId },
      data: {
        closedDate:          new Date(),
        closureEvidencePath: closureEvidence?.trim() || null,
      },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId: nc.applicationId,
        eventType: 'NC_CLEARED' satisfies EventType,
        payload:   { ncId },
        actorId:   user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${nc.applicationId}`)
  return { success: true }
}

// ─── recordDgcaObservation ────────────────────────────────────────────────────

export async function recordDgcaObservation(
  applicationId: string,
  observation: string,
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN') return { error: 'Only admins can record DGCA observations.' }

  const obs = observation.trim()
  if (!obs) return { error: 'Observation text is required.' }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true },
  })
  if (!app) return { error: 'Application not found.' }

  await prisma.applicationEvent.create({
    data: {
      applicationId,
      eventType: 'DGCA_OBSERVATION_RECORDED' satisfies EventType,
      payload:   { observation: obs },
      actorId:   user.appUser.id,
    },
  })

  revalidatePath(`/applications/${applicationId}`)
  return { success: true }
}

// ─── scheduleSurveillance ─────────────────────────────────────────────────────

export async function scheduleSurveillance(
  applicationId: string,
  yearOfAudit: number,
  plannedFrom: string,
  plannedTo: string,
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN') return { error: 'Only admins can schedule surveillance.' }

  const from = new Date(plannedFrom)
  const to   = new Date(plannedTo)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return { error: 'Invalid dates.' }
  if (to <= from) return { error: 'Planned end must be after planned start.' }
  if (!Number.isInteger(yearOfAudit) || yearOfAudit < 1) return { error: 'Year of audit must be a positive integer.' }

  const app = await prisma.application.findUnique({
    where:  { id: applicationId },
    select: { id: true, cb: { select: { isNabcbAccredited: true } } },
  })
  if (!app) return { error: 'Application not found.' }
  if (!app.cb.isNabcbAccredited) return { error: 'Surveillance only applies to NABCB-accredited CBs.' }

  await prisma.$transaction(async (tx) => {
    await tx.surveillanceAudit.create({
      data: { applicationId, yearOfAudit, plannedFrom: from, plannedTo: to },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'SURVEILLANCE_SCHEDULED' satisfies EventType,
        payload:   { yearOfAudit, plannedFrom, plannedTo },
        actorId:   user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${applicationId}`)
  return { success: true }
}

// ─── closeSurveillance ────────────────────────────────────────────────────────

export async function closeSurveillance(
  surveillanceId: string,
  actualFrom: string,
  actualTo: string,
  outcome?: string,
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const from = new Date(actualFrom)
  const to   = new Date(actualTo)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return { error: 'Invalid dates.' }
  if (to <= from) return { error: 'Actual end must be after actual start.' }

  const surv = await prisma.surveillanceAudit.findUnique({
    where:  { id: surveillanceId },
    select: { applicationId: true, actualTo: true, application: { select: { cbId: true } } },
  })
  if (!surv) return { error: 'Surveillance record not found.' }
  if (surv.actualTo) return { error: 'This surveillance is already closed.' }
  if (user.role === 'CB_USER' && surv.application.cbId !== user.cbId) {
    return { error: 'You can only close surveillance for your own CB.' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.surveillanceAudit.update({
      where: { id: surveillanceId },
      data:  { actualFrom: from, actualTo: to, outcome: outcome?.trim() || null },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId: surv.applicationId,
        eventType: 'SURVEILLANCE_CLOSED' satisfies EventType,
        payload:   { surveillanceId, actualFrom, actualTo, outcome: outcome?.trim() || null },
        actorId:   user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${surv.applicationId}`)
  return { success: true }
}

// ─── recordManufacturerResponse ──────────────────────────────────────────────

export async function recordManufacturerResponse(
  ncId: string,
  responseSummary?: string,
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const nc = await prisma.nonConformity.findUnique({
    where:  { id: ncId },
    select: {
      applicationId:           true,
      closedDate:              true,
      manufacturerResponseDate: true,
      stage:                   true,
      application:             { select: { cbId: true } },
    },
  })
  if (!nc) return { error: 'Non-conformity not found.' }
  if (nc.stage === Stage.DGCA_REVIEW) {
    return { error: 'At DGCA Review stage, NCs are closed directly when CB responds — there is no separate response step.' }
  }
  if (nc.closedDate)               return { error: 'This non-conformity is already cleared.' }
  if (nc.manufacturerResponseDate) return { error: 'Response already recorded for this NC.' }
  if (user.role === 'CB_USER' && nc.application.cbId !== user.cbId) {
    return { error: 'You can only record responses for your own CB.' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.nonConformity.update({
      where: { id: ncId },
      data:  { manufacturerResponseDate: new Date() },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId: nc.applicationId,
        eventType: 'RESPONSE_RECORDED' satisfies EventType,
        payload: {
          ncId,
          responseSummary:  responseSummary?.trim() || null,
          respondingParty: 'manufacturer',
        },
        actorId: user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${nc.applicationId}`)
  return { success: true }
}

// ─── saveApplicationReview ────────────────────────────────────────────────────

export async function saveApplicationReview(
  applicationId: string,
  fields: {
    reviewerName: string
    reviewerDesignation: string
    reviewerOrg: string
    reviewDecisionDate: string
    reviewDecision: 'ACCEPTED' | 'REJECTED'
    rejectionCategory?: string | null
    rejectionReason?: string | null
  },
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const name  = fields.reviewerName.trim()
  const desig = fields.reviewerDesignation.trim()
  const org   = fields.reviewerOrg.trim()
  if (!name)  return { error: 'Reviewer name is required.' }
  if (!desig) return { error: 'Reviewer designation is required.' }
  if (!org)   return { error: 'Reviewer organisation is required.' }

  const decisionDate = new Date(fields.reviewDecisionDate)
  if (isNaN(decisionDate.getTime())) return { error: 'Review decision date is required.' }

  if (fields.reviewDecision === 'REJECTED' && !fields.rejectionCategory) {
    return { error: 'Rejection category is required when rejecting.' }
  }

  const app = await prisma.application.findUnique({
    where:  { id: applicationId },
    select: { cbId: true, currentStage: true },
  })
  if (!app) return { error: 'Application not found.' }
  if (app.currentStage !== Stage.APPLICATION_REVIEW) {
    return { error: 'This form is only available in the Application Review stage.' }
  }
  if (user.role === 'CB_USER' && app.cbId !== user.cbId) {
    return { error: 'You can only edit applications for your own CB.' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        reviewerName:        name,
        reviewerDesignation: desig,
        reviewerOrg:         org,
        reviewDecisionDate:  decisionDate,
        reviewDecision:      fields.reviewDecision as ReviewDecision,
        rejectionCategory:   fields.reviewDecision === 'REJECTED'
          ? fields.rejectionCategory as RejectionCategory
          : null,
        rejectionReason:     fields.reviewDecision === 'REJECTED'
          ? (fields.rejectionReason?.trim() || null)
          : null,
        ...(fields.reviewDecision === 'REJECTED' ? { status: AppStatus.REJECTED } : {}),
      },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'REVIEW_RECORDED' satisfies EventType,
        payload: {
          reviewerName:   name,
          reviewDecision: fields.reviewDecision,
          ...(fields.reviewDecision === 'REJECTED'
            ? { rejectionCategory: fields.rejectionCategory }
            : {}),
        },
        actorId: user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${applicationId}`)
  return { success: true }
}

// ─── saveStage1 ───────────────────────────────────────────────────────────────

export async function saveStage1(
  applicationId: string,
  fields: {
    stage1ScheduleFrom: string
    stage1ScheduleTo: string
    stage1ClosureDate: string
  },
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const app = await prisma.application.findUnique({
    where:  { id: applicationId },
    select: { cbId: true, currentStage: true },
  })
  if (!app) return { error: 'Application not found.' }
  if (app.currentStage !== Stage.STAGE_1) {
    return { error: 'This form is only available in the Stage 1 stage.' }
  }
  if (user.role === 'CB_USER' && app.cbId !== user.cbId) {
    return { error: 'You can only edit applications for your own CB.' }
  }

  const parseDate = (s: string) => (s ? new Date(s) : null)

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        stage1ScheduleFrom: parseDate(fields.stage1ScheduleFrom),
        stage1ScheduleTo:   parseDate(fields.stage1ScheduleTo),
        stage1ClosureDate:  parseDate(fields.stage1ClosureDate),
      },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'STAGE_1_UPDATED' satisfies EventType,
        payload: {
          stage1ScheduleFrom: fields.stage1ScheduleFrom || null,
          stage1ScheduleTo:   fields.stage1ScheduleTo   || null,
          stage1ClosureDate:  fields.stage1ClosureDate  || null,
        },
        actorId: user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${applicationId}`)
  return { success: true }
}

// ─── saveStage2 ───────────────────────────────────────────────────────────────

export async function saveStage2(
  applicationId: string,
  fields: {
    stage2ScheduleFrom: string
    stage2ScheduleTo: string
    stage2ClosureDate: string
  },
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const app = await prisma.application.findUnique({
    where:  { id: applicationId },
    select: { cbId: true, currentStage: true },
  })
  if (!app) return { error: 'Application not found.' }
  if (app.currentStage !== Stage.STAGE_2) {
    return { error: 'This form is only available in the Stage 2 stage.' }
  }
  if (user.role === 'CB_USER' && app.cbId !== user.cbId) {
    return { error: 'You can only edit applications for your own CB.' }
  }

  const parseDate = (s: string) => (s ? new Date(s) : null)

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        stage2ScheduleFrom: parseDate(fields.stage2ScheduleFrom),
        stage2ScheduleTo:   parseDate(fields.stage2ScheduleTo),
        stage2ClosureDate:  parseDate(fields.stage2ClosureDate),
      },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'STAGE_2_UPDATED' satisfies EventType,
        payload: {
          stage2ScheduleFrom: fields.stage2ScheduleFrom || null,
          stage2ScheduleTo:   fields.stage2ScheduleTo   || null,
          stage2ClosureDate:  fields.stage2ClosureDate  || null,
        },
        actorId: user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${applicationId}`)
  return { success: true }
}

// ─── saveSoC ──────────────────────────────────────────────────────────────────

export async function saveSoC(
  applicationId: string,
  fields: {
    socReviewDate: string
    socSubmittedDate: string
  },
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') return { error: 'Forbidden.' }

  const app = await prisma.application.findUnique({
    where:  { id: applicationId },
    select: { cbId: true, currentStage: true },
  })
  if (!app) return { error: 'Application not found.' }
  if (app.currentStage !== Stage.TECHNICAL_REVIEW_SOC) {
    return { error: 'This form is only available in the Technical Review / SoC stage.' }
  }
  if (user.role === 'CB_USER' && app.cbId !== user.cbId) {
    return { error: 'You can only edit applications for your own CB.' }
  }

  const parseDate = (s: string) => (s ? new Date(s) : null)

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        socReviewDate:    parseDate(fields.socReviewDate),
        socSubmittedDate: parseDate(fields.socSubmittedDate),
      },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'SOC_UPDATED' satisfies EventType,
        payload: {
          socReviewDate:    fields.socReviewDate    || null,
          socSubmittedDate: fields.socSubmittedDate || null,
        },
        actorId: user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${applicationId}`)
  return { success: true }
}

// ─── saveDgcaReview ───────────────────────────────────────────────────────────

export async function saveDgcaReview(
  applicationId: string,
  fields: { dgcaReviewStartedAt: string },
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN') return { error: 'Only admins can update the DGCA Review stage.' }

  const app = await prisma.application.findUnique({
    where:  { id: applicationId },
    select: { id: true, currentStage: true },
  })
  if (!app) return { error: 'Application not found.' }
  if (app.currentStage !== Stage.DGCA_REVIEW) {
    return { error: 'This form is only available in the DGCA Review stage.' }
  }

  const parseDate = (s: string) => (s ? new Date(s) : null)

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data:  { dgcaReviewStartedAt: parseDate(fields.dgcaReviewStartedAt) },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'DGCA_REVIEW_STARTED' satisfies EventType,
        payload:   { dgcaReviewStartedAt: fields.dgcaReviewStartedAt || null },
        actorId:   user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${applicationId}`)
  return { success: true }
}

// ─── saveQciAgreement ─────────────────────────────────────────────────────────

export async function saveQciAgreement(
  applicationId: string,
  fields: {
    qciAgreementDraftSentDate: string
    manufacturerSignedDate: string
    qciAgreementCompletedDate: string
  },
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthenticated.' }
  if (user.role !== 'ADMIN') return { error: 'Only admins can update the QCI Agreement.' }

  const app = await prisma.application.findUnique({
    where:  { id: applicationId },
    select: { id: true, currentStage: true, qciAgreementInitiatedDate: true },
  })
  if (!app) return { error: 'Application not found.' }
  if (app.currentStage !== Stage.QCI_AGREEMENT) {
    return { error: 'This form is only available in the QCI Agreement stage.' }
  }

  const parseDate = (s: string) => (s ? new Date(s) : null)
  const completedDate  = parseDate(fields.qciAgreementCompletedDate)
  const mfrSignedDate  = parseDate(fields.manufacturerSignedDate)
  const draftSentDate  = parseDate(fields.qciAgreementDraftSentDate)

  let newStatus: QciAgreementStatus
  if (completedDate)     newStatus = QciAgreementStatus.COMPLETED
  else if (mfrSignedDate) newStatus = QciAgreementStatus.MANUFACTURER_SIGNED
  else if (app.qciAgreementInitiatedDate) newStatus = QciAgreementStatus.INITIATED
  else newStatus = QciAgreementStatus.NOT_STARTED

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        qciAgreementDraftSentDate: draftSentDate,
        manufacturerSignedDate:    mfrSignedDate,
        qciAgreementCompletedDate: completedDate,
        qciAgreementStatus:        newStatus,
      },
    })
    await tx.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'QCI_AGREEMENT_UPDATED' satisfies EventType,
        payload: {
          qciAgreementDraftSentDate: fields.qciAgreementDraftSentDate  || null,
          manufacturerSignedDate:    fields.manufacturerSignedDate      || null,
          qciAgreementCompletedDate: fields.qciAgreementCompletedDate  || null,
          newStatus,
        },
        actorId: user.appUser.id,
      },
    })
  })

  revalidatePath(`/applications/${applicationId}`)
  return { success: true }
}
