'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSignedUrl } from '@/lib/storage'
import { Stage, QciAgreementStatus } from '@prisma/client'
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
  if (user.role !== 'ADMIN') return { error: 'Only admins can raise non-conformities.' }

  const desc = description.trim()
  if (!desc) return { error: 'Description is required.' }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, currentStage: true },
  })
  if (!app) return { error: 'Application not found.' }

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
  if (user.role !== 'ADMIN') return { error: 'Only admins can clear non-conformities.' }

  const nc = await prisma.nonConformity.findUnique({
    where: { id: ncId },
    select: { applicationId: true, closedDate: true },
  })
  if (!nc) return { error: 'Non-conformity not found.' }
  if (nc.closedDate) return { error: 'This non-conformity is already cleared.' }

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
