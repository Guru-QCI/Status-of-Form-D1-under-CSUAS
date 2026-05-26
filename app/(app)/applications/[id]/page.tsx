import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Stage } from '@prisma/client'
import { nextStageFor, getBlockingReason } from '@/lib/state-machine'
import { getStageTat, getTotalTat } from '@/lib/tat'
import { computeReminders } from '@/lib/reminders'
import Detail from './Detail'

const TAT_STAGES = [
  Stage.APPLICATION_REVIEW,
  Stage.STAGE_1,
  Stage.STAGE_2,
  Stage.TECHNICAL_REVIEW_SOC,
  Stage.DGCA_REVIEW,
  Stage.TC_ISSUED,
  Stage.QCI_AGREEMENT,
] as const

export default async function ApplicationDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'ADMIN' && user.role !== 'CB_USER') redirect('/dashboard')

  const application = await prisma.application.findUnique({
    where: { id: params.id },
    select: {
      id:            true,
      formNumber:    true,
      modelName:     true,
      modelVariant:  true,
      attemptNumber: true,
      cbId:          true,
      currentStage:  true,
      status:        true,
      submissionDate:             true,
      reviewerName:               true,
      reviewerDesignation:        true,
      reviewerOrg:                true,
      reviewDecisionDate:         true,
      reviewDecision:             true,
      rejectionCategory:          true,
      rejectionReason:            true,
      stage1ScheduleFrom:         true,
      stage1ScheduleTo:           true,
      stage1ClosureDate:          true,
      stage2ScheduleFrom:         true,
      stage2ScheduleTo:           true,
      stage2ClosureDate:          true,
      socReviewDate:              true,
      socSubmittedDate:           true,
      dgcaReviewStartedAt:        true,
      tcIssuedDate:               true,
      qciAgreementStatus:         true,
      qciAgreementInitiatedDate:  true,
      qciAgreementDraftSentDate:  true,
      manufacturerSignedDate:     true,
      qciSignedDate:              true,
      qciAgreementCompletedDate:  true,
      manufacturer: { select: { name: true, contactEmail: true } },
      cb:           { select: { name: true, contactEmail: true, isNabcbAccredited: true } },
      addedBy:      { select: { fullName: true } },
      documents: {
        orderBy: { uploadedAt: 'asc' },
        select: { id: true, type: true, fileName: true, uploadedAt: true },
      },
      ncs: {
        orderBy: { raisedDate: 'asc' },
        select: {
          id: true, stage: true, iteration: true,
          raisedDate: true, description: true, closedDate: true,
          manufacturerResponseDate: true,
        },
      },
      surveillances: {
        orderBy: { yearOfAudit: 'asc' },
        select: {
          id: true, yearOfAudit: true,
          plannedFrom: true, plannedTo: true,
          actualFrom: true, actualTo: true,
          outcome: true,
        },
      },
      events: {
        orderBy: { occurredAt: 'desc' },
        select: { id: true, eventType: true, payload: true, actorId: true, occurredAt: true },
      },
      _count: { select: { ncs: { where: { closedDate: null } } } },
    },
  })

  if (!application) notFound()

  const nextStage = nextStageFor(application.currentStage)
  const blocking  = nextStage
    ? getBlockingReason(
        {
          cbId:               application.cbId,
          status:             application.status,
          currentStage:       application.currentStage,
          reviewDecisionDate:  application.reviewDecisionDate,
          reviewDecision:      application.reviewDecision ?? null,
          stage1ClosureDate:   application.stage1ClosureDate,
          stage2ClosureDate:   application.stage2ClosureDate,
          socSubmittedDate:    application.socSubmittedDate,
          qciAgreementStatus:  application.qciAgreementStatus,
        },
        nextStage,
        { role: user.role, cbId: user.cbId ?? null },
        application._count.ncs,
      )
    : null

  const tatSummary = {
    stages: TAT_STAGES.map(stage => ({ stage, ...getStageTat(application, stage) })),
    total:  getTotalTat(application),
  }

  const reminders = computeReminders(
    {
      id:                 application.id,
      formNumber:         application.formNumber,
      modelName:          application.modelName,
      status:             application.status,
      submissionDate:     application.submissionDate,
      reviewDecision:     application.reviewDecision ?? null,
      socSubmittedDate:   application.socSubmittedDate,
      tcIssuedDate:       application.tcIssuedDate,
      qciAgreementStatus: application.qciAgreementStatus,
      manufacturer:       application.manufacturer,
      cb: {
        contactEmail:      application.cb.contactEmail ?? null,
        isNabcbAccredited: application.cb.isNabcbAccredited,
      },
      cbUserEmails:  [],
      ncs:           application.ncs,
      surveillances: application.surveillances,
    },
    [],
  )

  return (
    <Detail
      application={{
        ...application,
        submissionDate:             application.submissionDate.toISOString(),
        reviewDecisionDate:         application.reviewDecisionDate?.toISOString()        ?? null,
        stage1ScheduleFrom:         application.stage1ScheduleFrom?.toISOString()        ?? null,
        stage1ScheduleTo:           application.stage1ScheduleTo?.toISOString()          ?? null,
        stage1ClosureDate:          application.stage1ClosureDate?.toISOString()         ?? null,
        stage2ScheduleFrom:         application.stage2ScheduleFrom?.toISOString()        ?? null,
        stage2ScheduleTo:           application.stage2ScheduleTo?.toISOString()          ?? null,
        stage2ClosureDate:          application.stage2ClosureDate?.toISOString()         ?? null,
        socReviewDate:              application.socReviewDate?.toISOString()             ?? null,
        socSubmittedDate:           application.socSubmittedDate?.toISOString()          ?? null,
        dgcaReviewStartedAt:        application.dgcaReviewStartedAt?.toISOString()       ?? null,
        tcIssuedDate:               application.tcIssuedDate?.toISOString()              ?? null,
        qciAgreementInitiatedDate:  application.qciAgreementInitiatedDate?.toISOString() ?? null,
        qciAgreementDraftSentDate:  application.qciAgreementDraftSentDate?.toISOString() ?? null,
        manufacturerSignedDate:     application.manufacturerSignedDate?.toISOString()    ?? null,
        qciSignedDate:              application.qciSignedDate?.toISOString()             ?? null,
        qciAgreementCompletedDate:  application.qciAgreementCompletedDate?.toISOString() ?? null,
        documents: application.documents.map(d => ({
          ...d,
          uploadedAt: d.uploadedAt.toISOString(),
        })),
        ncs: application.ncs.map(nc => ({
          ...nc,
          raisedDate:               nc.raisedDate.toISOString(),
          closedDate:               nc.closedDate?.toISOString() ?? null,
          manufacturerResponseDate: nc.manufacturerResponseDate?.toISOString() ?? null,
        })),
        events: application.events.map(e => ({
          ...e,
          occurredAt: e.occurredAt.toISOString(),
        })),
      }}
      isAdmin={user.role === 'ADMIN'}
      userCbId={user.cbId ?? null}
      cbIsNabcbAccredited={application.cb.isNabcbAccredited}
      openNcCount={application._count.ncs}
      nextStage={nextStage}
      blockingReason={blocking}
      tatSummary={tatSummary}
      surveillances={application.surveillances.map(s => ({
        id:          s.id,
        yearOfAudit: s.yearOfAudit,
        plannedFrom: s.plannedFrom.toISOString(),
        plannedTo:   s.plannedTo.toISOString(),
        actualFrom:  s.actualFrom?.toISOString() ?? null,
        actualTo:    s.actualTo?.toISOString()   ?? null,
        outcome:     s.outcome ?? null,
      }))}
      reminders={reminders.map(r => ({
        kind:    r.kind,
        dueAt:   r.dueAt.toISOString(),
        message: r.message,
      }))}
    />
  )
}
