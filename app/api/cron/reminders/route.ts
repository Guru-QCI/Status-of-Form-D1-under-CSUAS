import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AppStatus } from '@prisma/client'
import { computeReminders } from '@/lib/reminders'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  const admins = await prisma.appUser.findMany({
    where: { role: 'ADMIN' },
    select: { email: true },
  })
  const adminEmails = admins.map(a => a.email)

  const applications = await prisma.application.findMany({
    where: {
      deletedAt: null,
      OR: [
        { status: AppStatus.IN_PROGRESS },
        { tcIssuedDate: { not: null } },
      ],
    },
    select: {
      id:                 true,
      formNumber:         true,
      modelName:          true,
      status:             true,
      submissionDate:     true,
      reviewDecision:     true,
      socSubmittedDate:   true,
      tcIssuedDate:       true,
      qciAgreementStatus: true,
      manufacturer: { select: { contactEmail: true } },
      cb: {
        select: {
          contactEmail:      true,
          isNabcbAccredited: true,
          users:             { select: { email: true } },
        },
      },
      ncs: {
        select: {
          raisedDate:               true,
          manufacturerResponseDate: true,
          closedDate:               true,
        },
      },
      surveillances: {
        select: { plannedFrom: true, yearOfAudit: true },
      },
    },
  })

  let upserted = 0

  for (const app of applications) {
    const cbUserEmails = app.cb.users.map(u => u.email)
    const candidates = computeReminders(
      {
        ...app,
        reviewDecision: app.reviewDecision ?? null,
        cb: { contactEmail: app.cb.contactEmail ?? null, isNabcbAccredited: app.cb.isNabcbAccredited },
        cbUserEmails,
      },
      adminEmails,
      now,
    )

    for (const c of candidates) {
      await prisma.reminder.upsert({
        where: {
          applicationId_kind_dueAt: {
            applicationId: app.id,
            kind:          c.kind,
            dueAt:         c.dueAt,
          },
        },
        create: {
          applicationId: app.id,
          kind:          c.kind,
          dueAt:         c.dueAt,
          message:       c.message,
          recipients:    c.recipients,
        },
        update: {},
      })
      upserted++
    }
  }

  return NextResponse.json({
    ok:                    true,
    applicationsProcessed: applications.length,
    remindersUpserted:     upserted,
  })
}
