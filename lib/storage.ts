import { DocType } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'

export const DOCUMENTS_BUCKET = 'documents'
export const TC_CERTIFICATES_BUCKET = 'tc-certificates'

function sanitizeFilename(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 100)

  return sanitized || `file_${Date.now()}`
}

export async function uploadFile(
  applicationId: string,
  docType: DocType,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const supabase = createClient()
  const path = `${applicationId}/${docType}/${sanitizeFilename(file.name)}`
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { upsert: false })
  if (error) return { error: error.message }
  return { path: data.path }
}

export async function uploadTcFile(
  applicationId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const supabase = createClient()
  const path = `${applicationId}/${sanitizeFilename(file.name)}`
  const { data, error } = await supabase.storage
    .from(TC_CERTIFICATES_BUCKET)
    .upload(path, file, { upsert: true })
  if (error) return { error: error.message }
  return { path: data.path }
}

export function getTcCertificatePublicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return `${base}/storage/v1/object/public/${TC_CERTIFICATES_BUCKET}/${path}`
}

export async function generateSignedUrl(
  path: string,
  expiresInSeconds: number = 60,
  bucket: string = DOCUMENTS_BUCKET,
): Promise<{ url: string } | { error: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds)
  if (error) return { error: error.message }
  return { url: data.signedUrl }
}

export async function deleteFile(
  path: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient()
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([path])
  if (error) return { error: error.message }
  return { ok: true }
}
