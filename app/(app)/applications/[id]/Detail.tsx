'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Stage, AppStatus, DocType, ReminderKind } from '@prisma/client'
import {
  getDocumentSignedUrl,
  advanceStage,
  raiseNonConformity,
  clearNonConformity,
  recordDgcaObservation,
  scheduleSurveillance,
  closeSurveillance,
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
  currentStage: Stage
  status: AppStatus
  submissionDate: string
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
  cbIsNabcbAccredited: boolean
  openNcCount: number
  nextStage: Stage | null
  blockingReason: string | null
  tatSummary: TatSummary
  surveillances: SurveillanceRow[]
  reminders: ReminderRow[]
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
  cbIsNabcbAccredited,
  openNcCount,
  nextStage,
  blockingReason,
  tatSummary,
  surveillances,
  reminders,
}: Props) {
  const router = useRouter()

  const [advancing, setAdvancing]       = useState(false)
  const [advanceError, setAdvanceError] = useState('')

  const [ncDesc, setNcDesc]     = useState('')
  const [raisingNc, setRaisingNc] = useState(false)
  const [ncError, setNcError]   = useState('')

  const [clearingNcId, setClearingNcId] = useState<string | null>(null)
  const [clearNcError, setClearNcError] = useState('')

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
    try {
      const result = await clearNonConformity(ncId)
      if ('error' in result) setClearNcError(result.error)
      else router.refresh()
    } finally {
      setClearingNcId(null)
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

  const dgcaObservations = a.events.filter(e => e.eventType === 'DGCA_OBSERVATION_RECORDED')
  const canAdvanceStage  = nextStage !== null && blockingReason === null

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
                  {advancing ? 'Advancing…' : `Advance to ${STAGE_LABELS[nextStage]}`}
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
              {tatSummary.stages.map(({ stage, elapsed, isComplete }) => (
                <tr key={stage} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-700">{STAGE_LABELS[stage]}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                    {elapsed !== null ? elapsed : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    {elapsed === null ? (
                      <span className="text-slate-400">Not started</span>
                    ) : isComplete ? (
                      <span className="text-green-600">Complete</span>
                    ) : (
                      <span className="text-blue-600">In progress</span>
                    )}
                  </td>
                </tr>
              ))}
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
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Raised</th>
                  <th className="px-4 py-3">Status</th>
                  {isAdmin && <th className="px-4 py-3 w-28"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {a.ncs.map(nc => (
                  <tr key={nc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono whitespace-nowrap">
                      #{nc.iteration}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                      {STAGE_LABELS[nc.stage]}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{nc.description}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {formatDate(nc.raisedDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {nc.closedDate ? (
                        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs
                                         font-medium bg-green-50 text-green-700">
                          Cleared
                        </span>
                      ) : (
                        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs
                                         font-medium bg-red-50 text-red-700">
                          Open
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        {!nc.closedDate && (
                          <button
                            onClick={() => handleClearNc(nc.id)}
                            disabled={clearingNcId === nc.id}
                            className="text-xs border border-slate-300 rounded px-2.5 py-1
                                       text-slate-600 hover:border-slate-400 hover:text-slate-800
                                       disabled:opacity-50 transition-colors"
                          >
                            {clearingNcId === nc.id ? 'Clearing…' : 'Mark Cleared'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {clearNcError && <p className="text-sm text-red-600 mb-3">{clearNcError}</p>}

        {isAdmin && (
          <form onSubmit={handleRaiseNc} className="flex gap-2 items-start">
            <textarea
              value={ncDesc}
              onChange={e => setNcDesc(e.target.value)}
              placeholder="Describe the non-conformity…"
              rows={2}
              className="flex-1 text-sm border border-slate-300 rounded px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
            />
            <button
              type="submit"
              disabled={raisingNc || !ncDesc.trim()}
              className="flex-shrink-0 text-sm border border-slate-300 rounded px-3 py-2
                         text-slate-600 hover:border-slate-400 hover:text-slate-800
                         disabled:opacity-50 transition-colors"
            >
              {raisingNc ? 'Raising…' : 'Raise NC'}
            </button>
          </form>
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
