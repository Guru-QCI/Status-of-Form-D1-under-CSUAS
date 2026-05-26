'use server'

import { revalidatePath } from 'next/cache'
import { DocType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { uploadFile, deleteFile } from '@/lib/storage'

type CreateApplicationResult =
  | { success: true; applicationId: string; message: string }
  | { error: string }

const FILE_INPUTS: { fieldName: string; docType: DocType }[] = [
  { fieldName: 'fileFormD1',        docType: DocType.FORM_D1 },
  { fieldName: 'fileTechnicalFile', docType: DocType.TECHNICAL_FILE },
  { fieldName: 'fileTestReport',    docType: DocType.TEST_REPORT },
  { fieldName: 'fileCrmDocument',   docType: DocType.CRM_DOCUMENT },
]

const MAX_FILE_BYTES  = 26_214_400   // 25 MB per file
const MAX_TOTAL_BYTES = 104_857_600  // 100 MB total

type ParsedFiles = { file: File; docType: DocType }[]

function parseAndValidateFiles(
  formData: FormData,
): ParsedFiles | { error: string } {
  const parsed: ParsedFiles = []
  let totalBytes = 0

  for (const { fieldName, docType } of FILE_INPUTS) {
    const value = formData.get(fieldName)
    if (!(value instanceof File) || value.size === 0) {
      return { error: `Missing required file: ${fieldName}.` }
    }
    if (value.size > MAX_FILE_BYTES) {
      return { error: `File "${value.name}" exceeds the 25 MB limit.` }
    }
    totalBytes += value.size
    parsed.push({ file: value, docType })
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    return { error: 'Total upload size exceeds 100 MB.' }
  }

  return parsed
}

export async function createApplication(
  _prevState: unknown,
  formData: FormData,
): Promise<CreateApplicationResult> {
  // 1. Auth — CB_USER only
  const user = await getCurrentUser()
  if (!user || user.role !== 'CB_USER' || !user.cbId) {
    return { error: 'Unauthorized. Only CB users can create applications.' }
  }

  // 2. Parse form fields
  const manufacturerId    = (formData.get('manufacturerId') as string | null)?.trim() ?? ''
  const newMfgName        = (formData.get('newManufacturerName') as string | null)?.trim() ?? ''
  const newMfgEmail       = (formData.get('newManufacturerEmail') as string | null)?.trim() ?? ''
  const newMfgPhone       = (formData.get('newManufacturerPhone') as string | null)?.trim() || null
  const modelName         = (formData.get('modelName') as string | null)?.trim() ?? ''
  const modelVariant      = (formData.get('modelVariant') as string | null)?.trim() || null
  const formNumber        = (formData.get('formNumber') as string | null)?.trim() ?? ''
  const submissionDateRaw = (formData.get('submissionDate') as string | null)?.trim() ?? ''

  // 3. Parse and validate files
  const filesResult = parseAndValidateFiles(formData)
  if ('error' in filesResult) return filesResult

  // 4. Validate scalar fields
  if (!modelName)         return { error: 'Model name is required.' }
  if (!formNumber)        return { error: 'Form number is required.' }
  if (!submissionDateRaw) return { error: 'Submission date is required.' }

  const submissionDate = new Date(submissionDateRaw)
  if (isNaN(submissionDate.getTime())) return { error: 'Invalid submission date.' }

  if (!manufacturerId && !newMfgName) {
    return { error: 'Select an existing manufacturer or enter a new manufacturer name.' }
  }

  // 5. Resolve manufacturer
  let resolvedManufacturerId: string

  if (manufacturerId) {
    const existing = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } })
    if (!existing) return { error: 'Selected manufacturer not found.' }
    resolvedManufacturerId = existing.id
  } else {
    if (!newMfgEmail) return { error: 'Manufacturer contact email is required.' }
    const created = await prisma.manufacturer.create({
      data: { name: newMfgName, contactEmail: newMfgEmail, contactPhone: newMfgPhone },
    })
    resolvedManufacturerId = created.id
  }

  // 6. Insert Application
  let application
  try {
    application = await prisma.application.create({
      data: {
        formNumber,
        manufacturerId: resolvedManufacturerId,
        modelName,
        modelVariant,
        cbId:      user.cbId,
        submissionDate,
        addedById: user.appUser.id,
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: `An application with form number "${formNumber}" already exists.` }
    }
    throw e
  }

  // 7. Saga: upload files + insert Document rows
  const uploadedPaths: string[] = []
  const documentIds:   string[] = []

  try {
    for (const { file, docType } of filesResult) {
      const uploadResult = await uploadFile(application.id, docType, file)
      if ('error' in uploadResult) {
        throw new Error(`Upload failed for ${docType}: ${uploadResult.error}`)
      }
      uploadedPaths.push(uploadResult.path)

      const doc = await prisma.document.create({
        data: {
          applicationId: application.id,
          type:          docType,
          fileName:      file.name,
          storagePath:   uploadResult.path,
          uploadedById:  user.appUser.id,
        },
      })
      documentIds.push(doc.id)
    }
  } catch (uploadErr) {
    console.error('createApplication saga rollback:', uploadErr)
    await Promise.allSettled(uploadedPaths.map((p) => deleteFile(p)))
    if (documentIds.length > 0) {
      await prisma.document.deleteMany({ where: { id: { in: documentIds } } })
    }
    await prisma.application.delete({ where: { id: application.id } })

    const message = uploadErr instanceof Error ? uploadErr.message : 'Upload failed.'
    return { error: message }
  }

  // 8. Invalidate caches
  revalidatePath('/applications/new')
  revalidatePath('/dashboard')

  // 9. Return success
  return {
    success:       true,
    applicationId: application.id,
    message:       'Application created successfully.',
  }
}
