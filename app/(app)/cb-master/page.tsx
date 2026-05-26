import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import CbList from './CbList'

export const metadata = { title: 'CB Master — CSUAS Form D1 Portal' }

export default async function CbMasterPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const cbs = await prisma.cB.findMany({
    orderBy: { name: 'asc' },
    select: {
      id:                true,
      name:              true,
      isNabcbAccredited: true,
      nabcbExpiryDate:   true,
      contactPersonName: true,
      contactDesignation:true,
      contactEmail:      true,
      contactPhone:      true,
      address:           true,
    },
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">CB Master</h1>
      <CbList cbs={cbs} />
    </div>
  )
}
