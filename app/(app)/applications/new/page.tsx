import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ApplicationForm from './ApplicationForm'

export const metadata = { title: 'New Application — CSUAS Form D1 Portal' }

export default async function NewApplicationPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'CB_USER' || !user.cbId) redirect('/dashboard')

  const manufacturers = await prisma.manufacturer.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">New Application</h1>
      <ApplicationForm manufacturers={manufacturers} />
    </div>
  )
}
