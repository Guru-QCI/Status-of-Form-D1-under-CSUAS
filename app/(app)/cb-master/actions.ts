'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

type ActionResult = { success: true; message: string } | { error: string }

async function requireAdmin(): Promise<ActionResult | null> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ADMIN') return { error: 'Unauthorized' }
  return null
}

function parseCbFormData(formData: FormData) {
  const name               = (formData.get('name') as string | null)?.trim() ?? ''
  const isNabcbAccredited  = formData.get('isNabcbAccredited') === 'on'
  const nabcbExpiryDateRaw = (formData.get('nabcbExpiryDate') as string | null)?.trim() ?? ''
  const contactPersonName  = (formData.get('contactPersonName') as string | null)?.trim() || null
  const contactDesignation = (formData.get('contactDesignation') as string | null)?.trim() || null
  const contactEmail       = (formData.get('contactEmail') as string | null)?.trim() || null
  const contactPhone       = (formData.get('contactPhone') as string | null)?.trim() || null
  const address            = (formData.get('address') as string | null)?.trim() || null
  const nabcbExpiryDate    = isNabcbAccredited && nabcbExpiryDateRaw
    ? new Date(nabcbExpiryDateRaw)
    : null
  return {
    name, isNabcbAccredited, nabcbExpiryDate,
    contactPersonName, contactDesignation, contactEmail, contactPhone, address,
  }
}

export async function createCb(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const authError = await requireAdmin()
  if (authError) return authError

  const fields = parseCbFormData(formData)
  if (!fields.name) return { error: 'CB name is required.' }

  try {
    await prisma.cB.create({ data: fields })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: `A CB named "${fields.name}" already exists.` }
    }
    throw e
  }

  revalidatePath('/cb-master')
  return { success: true, message: `CB "${fields.name}" created.` }
}

export async function updateCb(
  id: string,
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const authError = await requireAdmin()
  if (authError) return authError

  const fields = parseCbFormData(formData)
  if (!fields.name) return { error: 'CB name is required.' }

  try {
    await prisma.cB.update({ where: { id }, data: fields })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: `A CB named "${fields.name}" already exists.` }
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { error: 'CB not found.' }
    }
    throw e
  }

  revalidatePath('/cb-master')
  return { success: true, message: `CB "${fields.name}" updated.` }
}

export async function deleteCb(id: string): Promise<ActionResult> {
  const authError = await requireAdmin()
  if (authError) return authError

  try {
    await prisma.cB.delete({ where: { id } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return {
        error:
          'Cannot delete this CB — it has Applications referencing it. ' +
          'Remove the Applications first or mark this CB as inactive.',
      }
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { error: 'CB not found.' }
    }
    throw e
  }

  revalidatePath('/cb-master')
  return { success: true, message: 'CB deleted.' }
}
