import type { H3Event, MultiPartData } from 'h3'
import { prisma } from './prisma'
import { uploadPaymentDocument } from './storage'
import { sanitizePaymentDocumentFileName } from '#shared/paymentDocumentUpload.ts'

export type WithdrawKind = 'club' | 'athlete'

function filePart(form: MultiPartData[] | undefined) {
  const file = form?.find((part) => part.name === 'file' && part.data)
  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  return file
}

function inferContentType(file: MultiPartData): string {
  const type = (file.type || '').trim().toLowerCase()
  if (type) return type
  const name = (file.filename || '').toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  return ''
}

export async function readPaymentDocumentUpload(event: H3Event) {
  const form = await readMultipartFormData(event)
  const file = filePart(form)
  const contentType = inferContentType(file)
  if (!contentType) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  return {
    buffer: Buffer.from(file.data),
    contentType,
    fileName: sanitizePaymentDocumentFileName(file.filename || 'document'),
  }
}

export async function attachWithdrawPaymentDocument(options: {
  kind: WithdrawKind
  requestId: string
  buffer: Buffer
  contentType: string
  fileName: string
}) {
  if (options.kind === 'club') {
    const request = await prisma.withdrawRequest.findUnique({
      where: { id: options.requestId },
      select: { id: true },
    })
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Withdraw request not found' })
  } else {
    const request = await prisma.userWithdrawRequest.findUnique({
      where: { id: options.requestId },
      select: { id: true },
    })
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Withdraw request not found' })
  }

  const url = await uploadPaymentDocument(options.buffer, {
    // Do not prefix `uploads/` — uploadObject already returns `/uploads/{folder}/…`
    folder: `withdrawals/${options.kind}/${options.requestId}`,
    contentType: options.contentType,
  })

  return prisma.withdrawPaymentDocument.create({
    data: {
      url,
      fileName: options.fileName,
      contentType: options.contentType,
      clubWithdrawId: options.kind === 'club' ? options.requestId : null,
      athleteWithdrawId: options.kind === 'athlete' ? options.requestId : null,
    },
    select: { id: true, url: true, fileName: true, contentType: true, createdAt: true },
  })
}

export async function deleteWithdrawPaymentDocument(options: {
  kind: WithdrawKind
  requestId: string
  documentId: string
}) {
  const document = await prisma.withdrawPaymentDocument.findUnique({
    where: { id: options.documentId },
    select: { id: true, clubWithdrawId: true, athleteWithdrawId: true },
  })
  if (!document) throw createError({ statusCode: 404, statusMessage: 'Document not found' })

  const matches = options.kind === 'club'
    ? document.clubWithdrawId === options.requestId
    : document.athleteWithdrawId === options.requestId
  if (!matches) throw createError({ statusCode: 404, statusMessage: 'Document not found' })

  await prisma.withdrawPaymentDocument.delete({ where: { id: document.id } })
  return { ok: true }
}
