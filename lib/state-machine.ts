import { Stage } from '@prisma/client'

export type EventType =
  | 'STAGE_ADVANCED'
  | 'NC_RAISED'
  | 'NC_CLEARED'
  | 'DGCA_OBSERVATION_RECORDED'
  | 'SURVEILLANCE_SCHEDULED'
  | 'SURVEILLANCE_CLOSED'
  | 'REVIEW_RECORDED'
  | 'STAGE_1_UPDATED'
  | 'STAGE_2_UPDATED'
  | 'SOC_UPDATED'
  | 'DGCA_REVIEW_STARTED'
  | 'QCI_AGREEMENT_UPDATED'
  | 'RESPONSE_RECORDED'
  | 'TC_CERTIFICATE_UPLOADED'

export type AppStateInput = {
  cbId: string
  status: string
  currentStage: Stage
  reviewDecisionDate: Date | null
  reviewDecision: string | null
  stage1ClosureDate: Date | null
  stage2ClosureDate: Date | null
  socSubmittedDate: Date | null
  qciAgreementStatus: string
}

export type UserStateInput = {
  role: string
  cbId: string | null
}

export const TRANSITIONS: Record<Stage, Stage[]> = {
  [Stage.APPLICATION_REVIEW]:   [Stage.STAGE_1],
  [Stage.STAGE_1]:              [Stage.STAGE_2],
  [Stage.STAGE_2]:              [Stage.TECHNICAL_REVIEW_SOC],
  [Stage.TECHNICAL_REVIEW_SOC]: [Stage.DGCA_REVIEW],
  [Stage.DGCA_REVIEW]:          [Stage.TC_ISSUED],
  [Stage.TC_ISSUED]:            [Stage.QCI_AGREEMENT],
  [Stage.QCI_AGREEMENT]:        [Stage.POST_TC_SURVEILLANCE],
  [Stage.POST_TC_SURVEILLANCE]: [],
}

export function nextStageFor(current: Stage): Stage | null {
  const targets = TRANSITIONS[current]
  return targets.length > 0 ? targets[0] : null
}

function openNcMsg(count: number): string {
  return `${count} non-conformit${count === 1 ? 'y is' : 'ies are'} open; clear all NCs before advancing.`
}

export function getBlockingReason(
  app: AppStateInput,
  targetStage: Stage,
  user: UserStateInput,
  openNcCount: number,
): string | null {
  if (!TRANSITIONS[app.currentStage].includes(targetStage)) {
    return `${targetStage} is not a valid transition from ${app.currentStage}.`
  }

  if (app.status !== 'IN_PROGRESS') {
    return `Application status is ${app.status}; only in-progress applications can be advanced.`
  }

  switch (targetStage) {
    case Stage.STAGE_1:
      if (user.role !== 'CB_USER')           return 'Only CB users can advance to Stage 1.'
      if (user.cbId !== app.cbId)            return 'You can only advance applications for your own CB.'
      if (openNcCount > 0)                   return openNcMsg(openNcCount)
      if (!app.reviewDecisionDate)           return 'Review decision date not set.'
      if (app.reviewDecision !== 'ACCEPTED') return 'Application review must be Accepted before advancing.'
      return null

    case Stage.STAGE_2:
      if (user.role !== 'CB_USER') return 'Only CB users can advance to Stage 2.'
      if (user.cbId !== app.cbId)  return 'You can only advance applications for your own CB.'
      if (openNcCount > 0)         return openNcMsg(openNcCount)
      if (!app.stage1ClosureDate)  return 'Stage 1 closure date not set.'
      return null

    case Stage.TECHNICAL_REVIEW_SOC:
      if (user.role !== 'CB_USER') return 'Only CB users can advance to Technical Review / SoC.'
      if (user.cbId !== app.cbId)  return 'You can only advance applications for your own CB.'
      if (openNcCount > 0)         return openNcMsg(openNcCount)
      if (!app.stage2ClosureDate)  return 'Stage 2 closure date not set.'
      return null

    case Stage.DGCA_REVIEW:
      if (user.role !== 'CB_USER' && user.role !== 'ADMIN') return 'Only CB users or admins can advance to DGCA Review.'
      if (user.role === 'CB_USER' && user.cbId !== app.cbId) return 'You can only advance applications for your own CB.'
      if (openNcCount > 0)       return openNcMsg(openNcCount)
      if (!app.socSubmittedDate) return 'SoC submitted date not set.'
      return null

    case Stage.TC_ISSUED:
      if (user.role !== 'CB_USER' && user.role !== 'ADMIN') return 'Only CB users or admins can mark TC as issued.'
      if (user.role === 'CB_USER' && user.cbId !== app.cbId) return 'You can only advance applications for your own CB.'
      if (openNcCount > 0)       return openNcMsg(openNcCount)
      return null

    case Stage.QCI_AGREEMENT:
      if (user.role !== 'ADMIN') return 'Only admins can advance to QCI Agreement.'
      if (openNcCount > 0)       return openNcMsg(openNcCount)
      return null

    case Stage.POST_TC_SURVEILLANCE:
      if (user.role !== 'ADMIN')                  return 'Only admins can advance to Post-TC Surveillance.'
      if (openNcCount > 0)                        return openNcMsg(openNcCount)
      if (app.qciAgreementStatus !== 'COMPLETED') return 'QCI–Manufacturer Agreement must be completed before advancing.'
      return null

    default:
      return `No transition rules defined for ${targetStage}.`
  }
}

export function canAdvance(
  app: AppStateInput,
  targetStage: Stage,
  user: UserStateInput,
  openNcCount: number,
): boolean {
  return getBlockingReason(app, targetStage, user, openNcCount) === null
}
