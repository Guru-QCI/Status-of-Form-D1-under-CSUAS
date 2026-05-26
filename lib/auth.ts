import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function getCurrentUser() {
  const supabase = createClient()
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser()

  if (error || !authUser) return null

  const appUser = await prisma.appUser.findUnique({
    where: { id: authUser.id },
  })
  if (!appUser) return null

  return {
    authUser,
    appUser,
    role:  appUser.role,
    cbId:  appUser.cbId ?? null,
  }
}
