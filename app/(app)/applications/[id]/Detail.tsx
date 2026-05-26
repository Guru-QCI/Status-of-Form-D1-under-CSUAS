'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useRef } from 'react'
import { Stage, AppStatus, DocType, ReminderKind, ReviewDecision, RejectionCategory, QciAgreementStatus } from '@prisma/client'
import { STAGE_ORDER } from '@/lib/tat'
import {
  getDocumentSignedUrl,
  advanceStage,
  raiseNonConformity,
  clearNonConformity,
  recordDgcaObservation,
  scheduleSurveillance,
  closeSurveillance,
  recordManufacturerResponse,
  saveApplicationReview,
  saveStage1,
  saveStage2,
  saveSoC,
  saveDgcaReview,
  saveQciAgreement,
  uploadTcCertificate,
} from './actions'

type DocumentRow = {
  id: string
  type: DocType
  fileName: string
  uploadedAt: string
}

type NonConformityRow = {
  id: string
  stage: Stage
  iteration: number
  raisedDate: string
  description: string
  closedDate: string | null
  manufacturerResponseDate: string | null
}

type EventRow = {
  id: string
  eventType: string
  payload: unknown
  actorId: string
  occurredAt: string
}

type TatStageSummary = { stage: Stage; elapsed: number | null; isComplete: boolean }
type TatSummary      = { stages: TatStageSummary[]; total: { elapsed: number; isComplete: boolean } }

type ReminderRow = {
  kind: ReminderKind
  dueAt: string
  message: string
}

type SurveillanceRow = {
  id: string
  yearOfAudit: number
  plannedFrom: string
  plannedTo: string
  actualFrom: string | null
  actualTo: string | null
  outcome: string | null
}

type ApplicationDetail = {
  id: string
  formNumber: string
  modelName: string
  modelVariant: string | null
  attemptNumber: number
  cbId: string
  currentStage: Stage
  status: AppStatus
  submissionDate: string
  // Application Review
  reviewerName: string | null
  reviewerDesignation: string | null
  reviewerOrg: string | null
  reviewDecisionDate: string | null
  reviewDecision: ReviewDecision | null
  rejectionCategory: RejectionCategory | null
  rejectionReason: string | null
  // Stage 1
  stage1ScheduleFrom: string | null
  stage1ScheduleTo: string | null
  stage1ClosureDate: string | null
  // Stage 2
  stage2ScheduleFrom: string | null
  stage2ScheduleTo: string | null
  stage2ClosureDate: string | null
  // SoC
  socReviewDate: string | null
  socSubmittedDate: string | null
  // DGCA
  dgcaReviewStartedAt: string | null
  tcIssuedDate: string | null
  tcDocumentPath: string | null
  // QCI Agreement
  qciAgreementStatus: QciAgreementStatus
  qciAgreementInitiatedDate: string | null
  qciAgreementDraftSentDate: string | null
  manufacturerSignedDate: string | null
  qciSignedDate: string | null
  qciAgreementCompletedDate: string | null
  // Relations
  manufacturer: { name: string; contactEmail: string }
  cb: { name: string }
  addedBy: { fullName: string }
  documents: DocumentRow[]
  ncs: NonConformityRow[]
  events: EventRow[]
}

type Props = {
  application: ApplicationDetail
  isAdmin: boolean
  userCbId: string | null
  cbIsNabcbAccredited: boolean
  openNcCount: number
  nextStage: Stage | null
  blockingReason: string | null
  tatSummary: TatSummary
  surveillances: SurveillanceRow[]
  reminders: ReminderRow[]
  tcCertificateUrl: string | null
}

const STAGE_LABELS: Record<Stage, string> = {
  APPLICATION_REVIEW:   'Application Review',
  STAGE_1:              'Stage 1',
  STAGE_2:              'Stage 2',
  TECHNICAL_REVIEW_SOC: 'Technical Review / SoC',
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

const STATUS_BADGE_STYLES: Record<AppStatus, string> = {
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border border-blue-200',
  REJECTED:    'bg-red-50 text-red-700 border border-red-200',
  TC_ISSUED:   'bg-green-50 text-green-700 border border-green-200',
  WITHDRAWN:   'bg-slate-100 text-slate-500 border border-slate-200',
}

const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  CB_DECISION_DAY_6:     'CB Decision (Day 6)',
  PROCESS_1_TO_4_DAY_60: 'Process 1–4 (Day 60)',
  DGCA_REVIEW_DAY_15:    'DGCA Review (Day 15)',
  NC_RESPONSE_OVERDUE:   'NC Response Overdue',
  QCI_AGREEMENT_PENDING: 'QCI Agreement Pending',
  QCI_AGREEMENT_OVERDUE: 'QCI Agreement Overdue',
  SURVEILLANCE_DUE:      'Surveillance Due',
}

const DOC_TYPE_LABELS: Record<DocType, string> = {
  FORM_D1:                           'Form D1',
  TECHNICAL_FILE:                    'Technical File',
  TEST_REPORT:                       'Test Report',
  CRM_DOCUMENT:                      'CRM Document',
  NC_CLOSURE_EVIDENCE:               'NC Closure Evidence',
  SOC:                               'Statement of Compliance',
  TYPE_CERTIFICATE:                  'Type Certificate',
  QCI_MANUFACTURER_AGREEMENT_DRAFT:  'QCI Agreement (Draft)',
  QCI_MANUFACTURER_AGREEMENT_SIGNED: 'QCI Agreement (Signed)',
  SURVEILLANCE_REPORT:               'Surveillance Report',
  OTHER:                             'Other',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
      {children}
    </h2>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <dt className="w-44 flex-shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  )
}

export default function Detail({
  application: a,
  isAdmin,
  userCbId,
  cbIsNabcbAccredited,
  openNcCount,
  nextStage,
  blockingReason,
  tatSummary,
  surveillances,
  reminders,
  tcCertificateUrl,
}: Props) {
  const router = useRouter()

  const [advancing, setAdvancing]       = useState(false)
  const [advanceError, setAdvanceError] = useState('')

  const [ncDesc, setNcDesc]     = useState('')
  const [raisingNc, setRaisingNc] = useState(false)
  const [ncError, setNcError]   = useState('')

  const [clearingNcId, setClearingNcId]   = useState<string | null>(null)
  const [clearNcError, setClearNcError]   = useState('')
  const [respondingNcId, setRespondingNcId] = useState<string | null>(null)
  const [responseError,  setResponseError]  = useState('')

  const [obsText, setObsText]           = useState('')
  const [recordingObs, setRecordingObs] = useState(false)
  const [obsError, setObsError]         = useState('')

  const [downloading, setDownloading]       = useState<Record<string, boolean>>({})
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({})

  const [schedYear, setSchedYear]   = useState('')
  const [schedFrom, setSchedFrom]   = useState('')
  const [schedTo, setSchedTo]       = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [schedError, setSchedError] = useState('')

  const [expandedCloseId, setExpandedCloseId]           = useState<string | null>(null)
  const [closeActualFrom, setCloseActualFrom]           = useState<Record<string, string>>({})
  const [closeActualTo, setCloseActualTo]               = useState<Record<string, string>>({})
  const [closeOutcome, setCloseOutcome]                 = useState<Record<string, string>>({})
  const [closingSurvId, setClosingSurvId]               = useState<string | null>(null)
  const [closeSurvError, setCloseSurvError]             = useState('')

  // ── Application Review form ──
  const [rvName,      setRvName]      = useState(a.reviewerName       ?? '')
  const [rvDesig,     setRvDesig]     = useState(a.reviewerDesignation ?? '')
  const [rvOrg,       setRvOrg]       = useState(a.reviewerOrg        ?? '')
  const [rvDate,      setRvDate]      = useState(a.reviewDecisionDate  ? a.reviewDecisionDate.slice(0, 10) : '')
  const [rvDecision,  setRvDecision]  = useState<'ACCEPTED' | 'REJECTED' | ''>(a.reviewDecision ?? '')
  const [rvRejCat,    setRvRejCat]    = useState(a.rejectionCategory   ?? '')
  const [rvRejReason, setRvRejReason] = useState(a.rejectionReason     ?? '')
  const [savingReview, setSavingReview] = useState(false)
  const [reviewError,  setReviewError]  = useState('')
  const [reviewOk,     setReviewOk]     = useState('')

  // ── Stage 1 form ──
  const [s1From,    setS1From]    = useState(a.stage1ScheduleFrom ? a.stage1ScheduleFrom.slice(0, 10) : '')
  const [s1To,      setS1To]      = useState(a.stage1ScheduleTo   ? a.stage1ScheduleTo.slice(0, 10)   : '')
  const [s1Closure, setS1Closure] = useState(a.stage1ClosureDate  ? a.stage1ClosureDate.slice(0, 10)  : '')
  const [savingS1, setSavingS1] = useState(false)
  const [s1Error,  setS1Error]  = useState('')
  const [s1Ok,     setS1Ok]     = useState('')

  // ── Stage 2 form ──
  const [s2From,    setS2From]    = useState(a.stage2ScheduleFrom ? a.stage2ScheduleFrom.slice(0, 10) : '')
  const [s2To,      setS2To]      = useState(a.stage2ScheduleTo   ? a.stage2ScheduleTo.slice(0, 10)   : '')
  const [s2Closure, setS2Closure] = useState(a.stage2ClosureDate  ? a.stage2ClosureDate.slice(0, 10)  : '')
  const [savingS2, setSavingS2] = useState(false)
  const [s2Error,  setS2Error]  = useState('')
  const [s2Ok,     setS2Ok]     = useState('')

  // ── SoC form ──
  const [socRevDate, setSocRevDate] = useState(a.socReviewDate    ? a.socReviewDate.slice(0, 10)    : '')
  const [socSubDate, setSocSubDate] = useState(a.socSubmittedDate ? a.socSubmittedDate.slice(0, 10) : '')
  const [savingSoC, setSavingSoC] = useState(false)
  const [socError,  setSocError]  = useState('')
  const [socOk,     setSocOk]     = useState('')

  // ── DGCA Review form ──
  const [dgcaStarted,  setDgcaStarted]  = useState(a.dgcaReviewStartedAt ? a.dgcaReviewStartedAt.slice(0, 10) : '')
  const [savingDgca,   setSavingDgca]   = useState(false)
  const [dgcaError,    setDgcaError]    = useState('')
  const [dgcaOk,       setDgcaOk]       = useState('')

  // ── QCI Agreement form ──
  const [qciDraftSent,  setQciDraftSent]  = useState(a.qciAgreementDraftSentDate ? a.qciAgreementDraftSentDate.slice(0, 10) : '')
  const [qciMfrSigned,  setQciMfrSigned]  = useState(a.manufacturerSignedDate    ? a.manufacturerSignedDate.slice(0, 10)    : '')
  const [qciCompleted,  setQciCompleted]  = useState(a.qciAgreementCompletedDate ? a.qciAgreementCompletedDate.slice(0, 10) : '')
  const [savingQci,     setSavingQci]     = useState(false)
  const [qciError,      setQciError]      = useState('')
  const [qciOk,         setQciOk]         = useState('')

  // ── TC Certificate upload ──
  const tcFileRef   = useRef<HTMLInputElement>(null)
  const [tcUploading, setTcUploading] = useState(false)
  const [tcUploadError, setTcUploadError] = useState('')

  async function handleUploadTc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setTcUploading(true)
    setTcUploadError('')
    const fd = new FormData()
    fd.set('file', file)
    try {
      const result = await uploadTcCertificate(a.id, fd)
      if ('error' in result) setTcUploadError(result.error)
      else router.refresh()
    } finally {
      setTcUploading(false)
      if (tcFileRef.current) tcFileRef.current.value = ''
    }
  }

  async function handleAdvanceStage() {
    setAdvancing(true)
    setAdvanceError('')
    try {
      const result = await advanceStage(a.id)
      if ('error' in result) setAdvanceError(result.error)
      else router.refresh()
    } finally {
      setAdvancing(false)
    }
  }

  async function handleRaiseNc(e: React.FormEvent) {
    e.preventDefault()
    if (!ncDesc.trim()) return
    setRaisingNc(true)
    setNcError('')
    try {
      const result = await raiseNonConformity(a.id, ncDesc)
      if ('error' in result) setNcError(result.error)
      else { setNcDesc(''); router.refresh() }
    } finally {
      setRaisingNc(false)
    }
  }

  async function handleClearNc(ncId: string) {
    setClearingNcId(ncId)
    setClearNcError('')
    setResponseError('')
    try {
      const result = await clearNonConformity(ncId)
      if ('error' in result) setClearNcError(result.error)
      else router.refresh()
    } finally {
      setClearingNcId(null)
    }
  }

  async function handleRecordResponse(ncId: string) {
    setRespondingNcId(ncId)
    setResponseError('')
    setClearNcError('')
    try {
      const result = await recordManufacturerResponse(ncId)
      if ('error' in result) setResponseError(result.error)
      else router.refresh()
    } finally {
      setRespondingNcId(null)
    }
  }

  async function handleRecordObs(e: React.FormEvent) {
    e.preventDefault()
    if (!obsText.trim()) return
    setRecordingObs(true)
    setObsError('')
    try {
      const result = await recordDgcaObservation(a.id, obsText)
      if ('error' in result) setObsError(result.error)
      else { setObsText(''); router.refresh() }
    } finally {
      setRecordingObs(false)
    }
  }

  async function handleDownload(docId: string) {
    setDownloading(prev => ({ ...prev, [docId]: true }))
    setDownloadErrors(prev => ({ ...prev, [docId]: '' }))
    try {
      const result = await getDocumentSignedUrl(docId)
      if ('error' in result) {
        setDownloadErrors(prev => ({ ...prev, [docId]: result.error }))
        return
      }
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloading(prev => ({ ...prev, [docId]: false }))
    }
  }

  async function handleScheduleSurveillance(e: React.FormEvent) {
    e.preventDefault()
    const year = parseInt(schedYear, 10)
    if (!schedFrom || !schedTo || isNaN(year)) return
    setScheduling(true)
    setSchedError('')
    try {
      const result = await scheduleSurveillance(a.id, year, schedFrom, schedTo)
      if ('error' in result) setSchedError(result.error)
      else { setSchedYear(''); setSchedFrom(''); setSchedTo(''); router.refresh() }
    } finally {
      setScheduling(false)
    }
  }

  async function handleCloseSurveillance(survId: string) {
    const from    = closeActualFrom[survId] ?? ''
    const to      = closeActualTo[survId]   ?? ''
    const outcome = closeOutcome[survId]    ?? ''
    if (!from || !to) return
    setClosingSurvId(survId)
    setCloseSurvError('')
    try {
      const result = await closeSurveillance(survId, from, to, outcome || undefined)
      if ('error' in result) setCloseSurvError(result.error)
      else { setExpandedCloseId(null); router.refresh() }
    } finally {
      setClosingSurvId(null)
    }
  }

  async function handleSaveReview(e: React.FormEvent) {
    e.preventDefault()
    if (!rvDecision) return
    setSavingReview(true); setReviewError(''); setReviewOk('')
    try {
      const result = await saveApplicationReview(a.id, {
        reviewerName:      rvName,
        reviewerDesignation: rvDesig,
        reviewerOrg:       rvOrg,
        reviewDecisionDate: rvDate,
        reviewDecision:    rvDecision as 'ACCEPTED' | 'REJECTED',
        rejectionCategory: rvDecision === 'REJECTED' ? (rvRejCat || null) : null,
        rejectionReason:   rvDecision === 'REJECTED' ? (rvRejReason || null) : null,
      })
      if ('error' in result) setReviewError(result.error)
      else { setReviewOk('Saved.'); router.refresh() }
    } finally { setSavingReview(false) }
  }

  async function handleSaveS1(e: React.FormEvent) {
    e.preventDefault()
    setSavingS1(true); setS1Error(''); setS1Ok('')
    try {
      const result = await saveStage1(a.id, {
        stage1ScheduleFrom: s1From,
        stage1ScheduleTo:   s1To,
        stage1ClosureDate:  s1Closure,
      })
      if ('error' in result) setS1Error(result.error)
      else { setS1Ok('Saved.'); router.refresh() }
    } finally { setSavingS1(false) }
  }

  async function handleSaveS2(e: React.FormEvent) {
    e.preventDefault()
    setSavingS2(true); setS2Error(''); setS2Ok('')
    try {
      const result = await saveStage2(a.id, {
        stage2ScheduleFrom: s2From,
        stage2ScheduleTo:   s2To,
        stage2ClosureDate:  s2Closure,
      })
      if ('error' in result) setS2Error(result.error)
      else { setS2Ok('Saved.'); router.refresh() }
    } finally { setSavingS2(false) }
  }

  async function handleSaveSoC(e: React.FormEvent) {
    e.preventDefault()
    setSavingSoC(true); setSocError(''); setSocOk('')
    try {
      const result = await saveSoC(a.id, {
        socReviewDate:    socRevDate,
        socSubmittedDate: socSubDate,
      })
      if ('error' in result) setSocError(result.error)
      else { setSocOk('Saved.'); router.refresh() }
    } finally { setSavingSoC(false) }
  }

  async function handleSaveDgca(e: React.FormEvent) {
    e.preventDefault()
    setSavingDgca(true); setDgcaError(''); setDgcaOk('')
    try {
      const result = await saveDgcaReview(a.id, { dgcaReviewStartedAt: dgcaStarted })
      if ('error' in result) setDgcaError(result.error)
      else { setDgcaOk('Saved.'); router.refresh() }
    } finally { setSavingDgca(false) }
  }

  async function handleSaveQci(e: React.FormEvent) {
    e.preventDefault()
    setSavingQci(true); setQciError(''); setQciOk('')
    try {
      const result = await saveQciAgreement(a.id, {
        qciAgreementDraftSentDate: qciDraftSent,
        manufacturerSignedDate:    qciMfrSigned,
        qciAgreementCompletedDate: qciCompleted,
      })
      if ('error' in result) setQciError(result.error)
      else { setQciOk('Saved.'); router.refresh() }
    } finally { setSavingQci(false) }
  }

  const dgcaObservations = a.events.filter(e => e.eventType === 'DGCA_OBSERVATION_RECORDED')
  const canAdvanceStage  = nextStage !== null && blockingReason === null
  const canEditCbStages  = isAdmin || userCbId === a.cbId

  return (
    <div className="max-w-4xl">
      {/* Back */}
      <Link
        href="/applications"
        className="inline-flex items-center gap-1 text-sm text-slate-500
                   hover:text-slate-700 transition-colors mb-6"
      >
        ← Applications
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-mono text-xs text-slate-400 mb-1">{a.formNumber}</p>
          <h1 className="text-2xl font-semibold text-slate-800">
            {a.modelName}
            {a.modelVariant && (
              <span className="ml-2 text-base font-normal text-slate-400">
                ({a.modelVariant})
              </span>
            )}
          </h1>
          {a.attemptNumber > 1 && (
            <p className="text-xs text-slate-400 mt-1">Attempt {a.attemptNumber}</p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="inline-block rounded px-2.5 py-1 text-xs font-medium
                           bg-slate-100 text-slate-600 border border-slate-200">
            {STAGE_LABELS[a.currentStage]}
          </span>
          <span className={`inline-block rounded px-2.5 py-1 text-xs font-medium
                            ${STATUS_BADGE_STYLES[a.status]}`}>
            {STATUS_LABELS[a.status]}
          </span>
        </div>
      </div>

      {/* Stage Advance Panel */}
      {nextStage && (
        <section className="mb-8">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
            {canAdvanceStage ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-slate-600">
                  Ready to advance to{' '}
                  <span className="font-medium text-slate-800">
                    {STAGE_LABELS[nextStage]}
                  </span>
                </p>
                <button
                  onClick={handleAdvanceStage}
                  disabled={advancing}
                  className="flex-shrink-0 text-sm bg-slate-800 text-white rounded
                             px-4 py-1.5 hover:bg-slate-700 disabled:opacity-50
                             transition-colors"
                >
                  {advancing
                    ? 'Advancing…'
                    : a.currentStage === Stage.DGCA_REVIEW
                      ? 'Mark TC Issued by DGCA'
                      : `Advance to ${STAGE_LABELS[nextStage]}`}
                </button>
              </div>
            ) : (
              <p className="text-sm text-amber-800 bg-amber-50 rounded p-3
                            border border-amber-200">
                <span className="font-medium">Cannot advance: </span>
                {blockingReason}
              </p>
            )}
            {advanceError && (
              <p className="text-sm text-red-600 mt-2">{advanceError}</p>
            )}
          </div>
        </section>
      )}

      {/* Stage Data */}

      {canEditCbStages && a.currentStage === Stage.APPLICATION_REVIEW && (
        <section className="mb-8">
          <SectionHeading>Application Review</SectionHeading>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <form onSubmit={handleSaveReview} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Reviewer Name *</span>
                  <input
                    type="text" value={rvName} required
                    onChange={e => { setRvName(e.target.value); setReviewOk('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Designation *</span>
                  <input
                    type="text" value={rvDesig} required
                    onChange={e => { setRvDesig(e.target.value); setReviewOk('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Organisation *</span>
                  <input
                    type="text" value={rvOrg} required
                    onChange={e => { setRvOrg(e.target.value); setReviewOk('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Decision Date *</span>
                  <input
                    type="date" value={rvDate} required
                    onChange={e => { setRvDate(e.target.value); setReviewOk('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 block mb-2">Decision *</span>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio" value="ACCEPTED"
                      checked={rvDecision === 'ACCEPTED'}
                      onChange={() => { setRvDecision('ACCEPTED'); setReviewOk('') }}
                      className="accent-slate-700"
                    />
                    Accepted
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio" value="REJECTED"
                      checked={rvDecision === 'REJECTED'}
                      onChange={() => { setRvDecision('REJECTED'); setReviewOk('') }}
                      className="accent-slate-700"
                    />
                    Rejected
                  </label>
                </div>
              </div>
              {rvDecision === 'REJECTED' && (
                <div className="space-y-3 pl-4 border-l-2 border-red-200">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">Rejection Category *</span>
                    <select
                      value={rvRejCat}
                      onChange={e => { setRvRejCat(e.target.value); setReviewOk('') }}
                      className="text-sm border border-slate-300 rounded px-3 py-2
                                 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                    >
                      <option value="">— select —</option>
                      <option value="EXCEEDS_60_DAYS">Application exceeds 60 days</option>
                      <option value="INSUFFICIENT_DOCUMENTS">Insufficient documents</option>
                      <option value="NO_RESPONSE_TO_NCS">No response to non-conformities</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">Rejection Reason</span>
                    <textarea
                      value={rvRejReason} rows={2}
                      placeholder="Describe the reason for rejection…"
                      onChange={e => { setRvRejReason(e.target.value); setReviewOk('') }}
                      className="text-sm border border-slate-300 rounded px-3 py-2
                                 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
                    />
                  </label>
                </div>
              )}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={
                    savingReview || !rvName || !rvDesig || !rvOrg || !rvDate || !rvDecision ||
                    (rvDecision === 'REJECTED' && !rvRejCat)
                  }
                  className="text-sm bg-slate-800 text-white rounded px-4 py-1.5
                             hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {savingReview ? 'Saving…' : 'Save Review'}
                </button>
                {reviewOk    && <span className="text-sm text-green-600">{reviewOk}</span>}
                {reviewError && <span className="text-sm text-red-600">{reviewError}</span>}
              </div>
            </form>
          </div>
        </section>
      )}

      {canEditCbStages && a.currentStage === Stage.STAGE_1 && (
        <section className="mb-8">
          <SectionHeading>Stage 1 Audit Dates</SectionHeading>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <form onSubmit={handleSaveS1} className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Schedule From</span>
                  <input
                    type="date" value={s1From}
                    onChange={e => { setS1From(e.target.value); setS1Ok('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Schedule To</span>
                  <input
                    type="date" value={s1To}
                    onChange={e => { setS1To(e.target.value); setS1Ok('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Closure Date</span>
                  <input
                    type="date" value={s1Closure}
                    onChange={e => { setS1Closure(e.target.value); setS1Ok('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit" disabled={savingS1}
                  className="text-sm bg-slate-800 text-white rounded px-4 py-1.5
                             hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {savingS1 ? 'Saving…' : 'Save'}
                </button>
                {s1Ok    && <span className="text-sm text-green-600">{s1Ok}</span>}
                {s1Error && <span className="text-sm text-red-600">{s1Error}</span>}
              </div>
            </form>
          </div>
        </section>
      )}

      {canEditCbStages && a.currentStage === Stage.STAGE_2 && (
        <section className="mb-8">
          <SectionHeading>Stage 2 Audit Dates</SectionHeading>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <form onSubmit={handleSaveS2} className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Schedule From</span>
                  <input
                    type="date" value={s2From}
                    onChange={e => { setS2From(e.target.value); setS2Ok('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Schedule To</span>
                  <input
                    type="date" value={s2To}
                    onChange={e => { setS2To(e.target.value); setS2Ok('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Closure Date</span>
                  <input
                    type="date" value={s2Closure}
                    onChange={e => { setS2Closure(e.target.value); setS2Ok('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit" disabled={savingS2}
                  className="text-sm bg-slate-800 text-white rounded px-4 py-1.5
                             hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {savingS2 ? 'Saving…' : 'Save'}
                </button>
                {s2Ok    && <span className="text-sm text-green-600">{s2Ok}</span>}
                {s2Error && <span className="text-sm text-red-600">{s2Error}</span>}
              </div>
            </form>
          </div>
        </section>
      )}

      {canEditCbStages && a.currentStage === Stage.TECHNICAL_REVIEW_SOC && (
        <section className="mb-8">
          <SectionHeading>Technical Review / SoC Dates</SectionHeading>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <form onSubmit={handleSaveSoC} className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">SoC Review Date</span>
                  <input
                    type="date" value={socRevDate}
                    onChange={e => { setSocRevDate(e.target.value); setSocOk('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">SoC Submitted Date</span>
                  <input
                    type="date" value={socSubDate}
                    onChange={e => { setSocSubDate(e.target.value); setSocOk('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit" disabled={savingSoC}
                  className="text-sm bg-slate-800 text-white rounded px-4 py-1.5
                             hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {savingSoC ? 'Saving…' : 'Save'}
                </button>
                {socOk    && <span className="text-sm text-green-600">{socOk}</span>}
                {socError && <span className="text-sm text-red-600">{socError}</span>}
              </div>
            </form>
          </div>
        </section>
      )}

      {isAdmin && a.currentStage === Stage.DGCA_REVIEW && (
        <section className="mb-8">
          <SectionHeading>DGCA Review</SectionHeading>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <form onSubmit={handleSaveDgca} className="space-y-4">
              <label className="flex flex-col gap-1 w-56">
                <span className="text-xs font-medium text-slate-500">DGCA Review Started</span>
                <input
                  type="date" value={dgcaStarted}
                  onChange={e => { setDgcaStarted(e.target.value); setDgcaOk('') }}
                  className="text-sm border border-slate-300 rounded px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </label>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit" disabled={savingDgca}
                  className="text-sm bg-slate-800 text-white rounded px-4 py-1.5
                             hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {savingDgca ? 'Saving…' : 'Save'}
                </button>
                {dgcaOk    && <span className="text-sm text-green-600">{dgcaOk}</span>}
                {dgcaError && <span className="text-sm text-red-600">{dgcaError}</span>}
              </div>
            </form>
          </div>
        </section>
      )}

      {isAdmin && a.currentStage === Stage.QCI_AGREEMENT && (
        <section className="mb-8">
          <SectionHeading>QCI Agreement</SectionHeading>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex gap-8 mb-4 text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-slate-500">Agreement Initiated</span>
                <span className="text-slate-700">
                  {a.qciAgreementInitiatedDate ? formatDate(a.qciAgreementInitiatedDate) : '—'}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-slate-500">Status</span>
                <span className="text-slate-700">{a.qciAgreementStatus.replace(/_/g, ' ')}</span>
              </div>
            </div>
            <form onSubmit={handleSaveQci} className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Draft Sent Date</span>
                  <input
                    type="date" value={qciDraftSent}
                    onChange={e => { setQciDraftSent(e.target.value); setQciOk('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Manufacturer Signed Date</span>
                  <input
                    type="date" value={qciMfrSigned}
                    onChange={e => { setQciMfrSigned(e.target.value); setQciOk('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Agreement Completed Date</span>
                  <input
                    type="date" value={qciCompleted}
                    onChange={e => { setQciCompleted(e.target.value); setQciOk('') }}
                    className="text-sm border border-slate-300 rounded px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </label>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit" disabled={savingQci}
                  className="text-sm bg-slate-800 text-white rounded px-4 py-1.5
                             hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {savingQci ? 'Saving…' : 'Save'}
                </button>
                {qciOk    && <span className="text-sm text-green-600">{qciOk}</span>}
                {qciError && <span className="text-sm text-red-600">{qciError}</span>}
              </div>
            </form>
          </div>
        </section>
      )}

      {/* TC Certificate */}
      {(a.currentStage === Stage.TC_ISSUED ||
        a.currentStage === Stage.QCI_AGREEMENT ||
        a.currentStage === Stage.POST_TC_SURVEILLANCE) && (
        <section className="mb-8">
          <SectionHeading>Type Certificate</SectionHeading>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            {tcCertificateUrl ? (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <a
                  href={tcCertificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline break-all"
                >
                  View TC Certificate (PDF)
                </a>
                {canEditCbStages && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => tcFileRef.current?.click()}
                      disabled={tcUploading}
                      className="text-xs border border-slate-300 rounded px-2.5 py-1
                                 text-slate-600 hover:border-slate-400 hover:text-slate-800
                                 disabled:opacity-50 transition-colors"
                    >
                      {tcUploading ? 'Uploading…' : 'Replace Certificate'}
                    </button>
                    {tcUploadError && (
                      <span className="text-xs text-red-600">{tcUploadError}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-slate-500">No TC certificate uploaded yet.</p>
                {canEditCbStages && (
                  <>
                    <button
                      onClick={() => tcFileRef.current?.click()}
                      disabled={tcUploading}
                      className="text-sm border border-slate-300 rounded px-3 py-1.5
                                 text-slate-600 hover:border-slate-400 hover:text-slate-800
                                 disabled:opacity-50 transition-colors"
                    >
                      {tcUploading ? 'Uploading…' : 'Upload TC Certificate (PDF)'}
                    </button>
                    {tcUploadError && (
                      <span className="text-sm text-red-600">{tcUploadError}</span>
                    )}
                  </>
                )}
              </div>
            )}
            <input
              ref={tcFileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleUploadTc}
            />
          </div>
        </section>
      )}

      {/* Metadata */}
      <section className="mb-8">
        <SectionHeading>Details</SectionHeading>
        <div className="bg-white rounded-lg border border-slate-200 px-4">
          <dl>
            <MetaRow label="Manufacturer">{a.manufacturer.name}</MetaRow>
            <MetaRow label="Manufacturer Email">
              <a href={`mailto:${a.manufacturer.contactEmail}`}
                 className="text-blue-600 hover:underline">
                {a.manufacturer.contactEmail}
              </a>
            </MetaRow>
            <MetaRow label="Model">
              {a.modelName}
              {a.modelVariant && (
                <span className="ml-1 text-slate-400">/ {a.modelVariant}</span>
              )}
            </MetaRow>
            <MetaRow label="Submission Date">{formatDate(a.submissionDate)}</MetaRow>
            <MetaRow label="Added By">{a.addedBy.fullName}</MetaRow>
            {isAdmin && <MetaRow label="Certification Body">{a.cb.name}</MetaRow>}
            <MetaRow label="Current Stage">{STAGE_LABELS[a.currentStage]}</MetaRow>
            <MetaRow label="Status">{STATUS_LABELS[a.status]}</MetaRow>
            <MetaRow label="Open NCs">{openNcCount}</MetaRow>
          </dl>
        </div>
      </section>

      {/* TAT Summary */}
      <section className="mb-8">
        <SectionHeading>TAT Summary</SectionHeading>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500
                              uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3 text-right">Days</th>
                <th className="px-4 py-3 text-right w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tatSummary.stages.map(({ stage, elapsed, isComplete }) => {
                const stageIdx   = STAGE_ORDER.indexOf(stage)
                const currentIdx = STAGE_ORDER.indexOf(a.currentStage)
                const isPast     = stageIdx < currentIdx
                const isCurrent  = stageIdx === currentIdx

                let statusCell: React.ReactNode
                if (stage === Stage.TC_ISSUED) {
                  // Milestone row — show issue date, not duration
                  statusCell = isComplete
                    ? <span className="text-green-600">Issued</span>
                    : <span className="text-slate-400">Not yet issued</span>
                } else if (elapsed === null && isComplete) {
                  // End date set but start/end order is wrong — data entry error
                  statusCell = <span className="text-amber-600">Date sequence invalid</span>
                } else if (isCurrent) {
                  statusCell = <span className="text-blue-600">In progress</span>
                } else if (isPast) {
                  statusCell = elapsed !== null
                    ? <span className="text-green-600">Complete</span>
                    : <span className="text-slate-400">No data</span>
                } else {
                  statusCell = <span className="text-slate-400">Not started</span>
                }

                return (
                  <tr key={stage} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 text-slate-700">{STAGE_LABELS[stage]}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                      {stage === Stage.TC_ISSUED
                        ? (a.tcIssuedDate ? formatDate(a.tcIssuedDate) : '—')
                        : (elapsed !== null ? elapsed : '—')}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {statusCell}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-slate-50 font-medium">
                <td className="px-4 py-2.5 text-slate-800">Total elapsed</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                  {tatSummary.total.elapsed}
                </td>
                <td className="px-4 py-2.5 text-right text-xs">
                  {tatSummary.total.isComplete ? (
                    <span className="text-green-600">Complete</span>
                  ) : (
                    <span className="text-blue-600">In progress</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Non-Conformities */}
      <section className="mb-8">
        <SectionHeading>
          Non-Conformities{a.ncs.length > 0 && ` (${a.ncs.length})`}
        </SectionHeading>

        {a.ncs.length === 0 ? (
          <p className="text-sm text-slate-400 mb-4">No non-conformities on record.</p>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-4">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500
                                uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">NC</th>
                  <th className="px-4 py-3">Stage / Target</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Raised</th>
                  <th className="px-4 py-3">Status</th>
                  {canEditCbStages && <th className="px-4 py-3 w-52"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {a.ncs.map(nc => (
                  <tr key={nc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono whitespace-nowrap">
                      #{nc.iteration}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-600 text-xs block">
                        {STAGE_LABELS[nc.stage]}
                      </span>
                      <span className="text-xs text-slate-400">
                        {nc.stage === Stage.DGCA_REVIEW ? 'against CB' : 'against Manufacturer'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{nc.description}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {formatDate(nc.raisedDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {nc.closedDate ? (
                        nc.stage === Stage.DGCA_REVIEW ? (
                          <span className="inline-block rounded px-2 py-0.5 text-xs
                                           font-medium bg-green-50 text-green-700">
                            Responded to DGCA {formatDate(nc.closedDate)}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs
                                           font-medium bg-green-50 text-green-700">
                            Cleared
                          </span>
                        )
                      ) : nc.manufacturerResponseDate && nc.stage !== Stage.DGCA_REVIEW ? (
                        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs
                                         font-medium bg-amber-50 text-amber-700">
                          Response received
                        </span>
                      ) : (
                        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs
                                         font-medium bg-red-50 text-red-700">
                          Open
                        </span>
                      )}
                    </td>
                    {canEditCbStages && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {!nc.closedDate && !nc.manufacturerResponseDate &&
                           nc.stage !== Stage.DGCA_REVIEW && (
                            <button
                              onClick={() => handleRecordResponse(nc.id)}
                              disabled={respondingNcId === nc.id}
                              className="text-xs border border-slate-300 rounded px-2.5 py-1
                                         text-slate-600 hover:border-slate-400 hover:text-slate-800
                                         disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {respondingNcId === nc.id
                                ? 'Recording…'
                                : 'Mark Mfr Response Received'}
                            </button>
                          )}
                          {!nc.closedDate && (
                            <button
                              onClick={() => handleClearNc(nc.id)}
                              disabled={clearingNcId === nc.id}
                              className="text-xs border border-slate-300 rounded px-2.5 py-1
                                         text-slate-600 hover:border-slate-400 hover:text-slate-800
                                         disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {clearingNcId === nc.id
                                ? 'Clearing…'
                                : nc.stage === Stage.DGCA_REVIEW
                                  ? 'Record Response & Close'
                                  : 'Mark Cleared'}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {clearNcError  && <p className="text-sm text-red-600 mb-3">{clearNcError}</p>}
        {responseError && <p className="text-sm text-red-600 mb-3">{responseError}</p>}

        {canEditCbStages && (
          <div className="space-y-1.5">
            <form onSubmit={handleRaiseNc} className="flex gap-2 items-start">
              <textarea
                value={ncDesc}
                onChange={e => setNcDesc(e.target.value)}
                placeholder={
                  a.currentStage === Stage.DGCA_REVIEW
                    ? 'Describe the observation or non-conformity raised by DGCA…'
                    : 'Describe the non-conformity against the manufacturer…'
                }
                rows={2}
                className="flex-1 text-sm border border-slate-300 rounded px-3 py-2
                           focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              />
              <button
                type="submit"
                disabled={raisingNc || !ncDesc.trim()}
                className="flex-shrink-0 text-sm border border-slate-300 rounded px-3 py-2
                           text-slate-600 hover:border-slate-400 hover:text-slate-800
                           disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {raisingNc
                  ? 'Raising…'
                  : a.currentStage === Stage.DGCA_REVIEW
                    ? 'Record DGCA Observation/NC'
                    : 'Raise NC against Manufacturer'}
              </button>
            </form>
            {a.currentStage === Stage.DGCA_REVIEW && (
              <p className="text-xs text-slate-400">
                Close this entry the day you submit your response to DGCA.
              </p>
            )}
          </div>
        )}
        {ncError && <p className="text-sm text-red-600 mt-2">{ncError}</p>}
      </section>

      {/* DGCA Observations */}
      <section className="mb-8">
        <SectionHeading>
          DGCA Observations{dgcaObservations.length > 0 && ` (${dgcaObservations.length})`}
        </SectionHeading>

        {dgcaObservations.length === 0 ? (
          <p className="text-sm text-slate-400 mb-4">No DGCA observations recorded.</p>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 divide-y
                          divide-slate-100 mb-4">
            {dgcaObservations.map(ev => (
              <div key={ev.id} className="px-4 py-3">
                <p className="text-xs text-slate-400 mb-0.5">
                  {formatDateTime(ev.occurredAt)}
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-mono">{ev.actorId.slice(-8)}</span>
                </p>
                <p className="text-sm text-slate-700">
                  {(ev.payload as { observation: string }).observation}
                </p>
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <form onSubmit={handleRecordObs} className="flex gap-2 items-start">
            <textarea
              value={obsText}
              onChange={e => setObsText(e.target.value)}
              placeholder="Record a DGCA observation…"
              rows={2}
              className="flex-1 text-sm border border-slate-300 rounded px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
            />
            <button
              type="submit"
              disabled={recordingObs || !obsText.trim()}
              className="flex-shrink-0 text-sm border border-slate-300 rounded px-3 py-2
                         text-slate-600 hover:border-slate-400 hover:text-slate-800
                         disabled:opacity-50 transition-colors"
            >
              {recordingObs ? 'Recording…' : 'Record'}
            </button>
          </form>
        )}
        {obsError && <p className="text-sm text-red-600 mt-2">{obsError}</p>}
      </section>

      {/* Reminders */}
      <section className="mb-8">
        <SectionHeading>
          Active Reminders{reminders.length > 0 && ` (${reminders.length})`}
        </SectionHeading>
        {reminders.length === 0 ? (
          <p className="text-sm text-slate-400">No active reminders.</p>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {reminders.map((r, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block rounded px-2 py-0.5 text-xs font-medium
                                   bg-amber-50 text-amber-700 border border-amber-200">
                    {REMINDER_KIND_LABELS[r.kind]}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(r.dueAt)}</span>
                </div>
                <p className="text-sm text-slate-700">{r.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Surveillance */}
      {cbIsNabcbAccredited && a.currentStage === Stage.POST_TC_SURVEILLANCE && (
        <section className="mb-8">
          <SectionHeading>
            Surveillance Audits{surveillances.length > 0 && ` (${surveillances.length})`}
          </SectionHeading>

          {surveillances.length === 0 ? (
            <p className="text-sm text-slate-400 mb-4">No surveillance audits scheduled.</p>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-4">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3">Planned Window</th>
                    <th className="px-4 py-3">Actual Window</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3 w-28"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {surveillances.map(s => (
                    <>
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-slate-800">{s.yearOfAudit}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                          {formatDate(s.plannedFrom)} – {formatDate(s.plannedTo)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                          {s.actualFrom && s.actualTo
                            ? `${formatDate(s.actualFrom)} – ${formatDate(s.actualTo)}`
                            : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs max-w-xs truncate">
                          {s.outcome ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!s.actualTo && (
                            <button
                              onClick={() => setExpandedCloseId(
                                expandedCloseId === s.id ? null : s.id
                              )}
                              className="text-xs border border-slate-300 rounded px-2.5 py-1
                                         text-slate-600 hover:border-slate-400 hover:text-slate-800
                                         transition-colors"
                            >
                              {expandedCloseId === s.id ? 'Cancel' : 'Close'}
                            </button>
                          )}
                          {s.actualTo && (
                            <span className="inline-block rounded-full px-2.5 py-0.5 text-xs
                                             font-medium bg-green-50 text-green-700">
                              Closed
                            </span>
                          )}
                        </td>
                      </tr>
                      {expandedCloseId === s.id && (
                        <tr key={`${s.id}-close`}>
                          <td colSpan={5} className="px-4 py-3 bg-slate-50">
                            <div className="flex flex-wrap gap-2 items-end">
                              <label className="flex flex-col gap-1">
                                <span className="text-xs text-slate-500">Actual From</span>
                                <input
                                  type="date"
                                  value={closeActualFrom[s.id] ?? ''}
                                  onChange={e => setCloseActualFrom(p => ({ ...p, [s.id]: e.target.value }))}
                                  className="text-sm border border-slate-300 rounded px-2 py-1
                                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className="text-xs text-slate-500">Actual To</span>
                                <input
                                  type="date"
                                  value={closeActualTo[s.id] ?? ''}
                                  onChange={e => setCloseActualTo(p => ({ ...p, [s.id]: e.target.value }))}
                                  className="text-sm border border-slate-300 rounded px-2 py-1
                                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                              </label>
                              <label className="flex flex-col gap-1 flex-1 min-w-40">
                                <span className="text-xs text-slate-500">Outcome (optional)</span>
                                <input
                                  type="text"
                                  value={closeOutcome[s.id] ?? ''}
                                  onChange={e => setCloseOutcome(p => ({ ...p, [s.id]: e.target.value }))}
                                  placeholder="Brief outcome…"
                                  className="text-sm border border-slate-300 rounded px-2 py-1
                                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                              </label>
                              <button
                                onClick={() => handleCloseSurveillance(s.id)}
                                disabled={closingSurvId === s.id || !closeActualFrom[s.id] || !closeActualTo[s.id]}
                                className="text-sm border border-slate-300 rounded px-3 py-1.5
                                           text-slate-600 hover:border-slate-400 hover:text-slate-800
                                           disabled:opacity-50 transition-colors"
                              >
                                {closingSurvId === s.id ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                            {closeSurvError && (
                              <p className="text-sm text-red-600 mt-2">{closeSurvError}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isAdmin && (
            <form onSubmit={handleScheduleSurveillance} className="flex flex-wrap gap-2 items-end">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Year of Audit</span>
                <input
                  type="number"
                  min={1}
                  value={schedYear}
                  onChange={e => setSchedYear(e.target.value)}
                  placeholder="1"
                  className="w-20 text-sm border border-slate-300 rounded px-2 py-1.5
                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Planned From</span>
                <input
                  type="date"
                  value={schedFrom}
                  onChange={e => setSchedFrom(e.target.value)}
                  className="text-sm border border-slate-300 rounded px-2 py-1.5
                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Planned To</span>
                <input
                  type="date"
                  value={schedTo}
                  onChange={e => setSchedTo(e.target.value)}
                  className="text-sm border border-slate-300 rounded px-2 py-1.5
                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </label>
              <button
                type="submit"
                disabled={scheduling || !schedYear || !schedFrom || !schedTo}
                className="text-sm border border-slate-300 rounded px-3 py-1.5
                           text-slate-600 hover:border-slate-400 hover:text-slate-800
                           disabled:opacity-50 transition-colors"
              >
                {scheduling ? 'Scheduling…' : 'Schedule'}
              </button>
            </form>
          )}
          {schedError && <p className="text-sm text-red-600 mt-2">{schedError}</p>}
        </section>
      )}

      {/* Documents */}
      <section className="mb-8">
        <SectionHeading>Documents</SectionHeading>
        {a.documents.length === 0 ? (
          <p className="text-sm text-slate-400">No documents on record.</p>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500
                                uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {a.documents.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {DOC_TYPE_LABELS[doc.type]}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                      {doc.fileName}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(doc.uploadedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {downloadErrors[doc.id] && (
                        <span className="text-xs text-red-500 mr-2">
                          {downloadErrors[doc.id]}
                        </span>
                      )}
                      <button
                        onClick={() => handleDownload(doc.id)}
                        disabled={downloading[doc.id]}
                        className="text-xs border border-slate-300 rounded px-2.5 py-1
                                   text-slate-600 hover:border-slate-400 hover:text-slate-800
                                   disabled:opacity-50 transition-colors"
                      >
                        {downloading[doc.id] ? 'Fetching…' : 'Download'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Timeline */}
      <section>
        <SectionHeading>Activity Timeline</SectionHeading>
        {a.events.length === 0 ? (
          <p className="text-sm text-slate-400">No activity recorded.</p>
        ) : (
          <ol className="relative border-l border-slate-200 ml-2 space-y-0">
            {a.events.map(ev => (
              <li key={ev.id} className="ml-6 pb-6">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full
                                 bg-white border-2 border-slate-300" />
                <p className="text-xs text-slate-400 mb-0.5">
                  {formatDateTime(ev.occurredAt)}
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-mono">{ev.actorId.slice(-8)}</span>
                </p>
                <p className="text-sm font-medium text-slate-700">
                  {ev.eventType.replace(/_/g, ' ')}
                </p>
                {ev.payload !== null &&
                  typeof ev.payload === 'object' &&
                  Object.keys(ev.payload as object).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-xs text-slate-400 cursor-pointer select-none
                                        hover:text-slate-600">
                      payload
                    </summary>
                    <pre className="mt-1 text-xs text-slate-500 bg-slate-50 rounded p-2
                                    overflow-x-auto max-h-32 border border-slate-100">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
