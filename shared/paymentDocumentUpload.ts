/** Allowed proof files for admin cash-out payment documents (receipts, transfer screenshots). */
export const PAYMENT_DOCUMENT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export type PaymentDocumentAllowedType = (typeof PAYMENT_DOCUMENT_ALLOWED_TYPES)[number]

export const PAYMENT_DOCUMENT_ALLOWED_TYPE_SET = new Set<string>(PAYMENT_DOCUMENT_ALLOWED_TYPES)

/** Max upload size — keep in sync with UI copy (`admin.withdrawDocsHint`). */
export const PAYMENT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

/** `<input accept>` value for file pickers. */
export const PAYMENT_DOCUMENT_ACCEPT = [...PAYMENT_DOCUMENT_ALLOWED_TYPES, '.pdf'].join(',')

export type PaymentDocumentRejectReason = 'empty' | 'heic' | 'type' | 'size'

const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

function extensionOf(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function isAllowedPaymentDocumentType(contentType: string) {
  return PAYMENT_DOCUMENT_ALLOWED_TYPE_SET.has(contentType)
}

export function paymentDocumentExtension(contentType: string) {
  return EXT_BY_TYPE[contentType] || 'bin'
}

export function sanitizePaymentDocumentFileName(name: string) {
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, '_').trim()
  return (cleaned || 'document').slice(0, 180)
}

/**
 * Client-side classify before upload. Returns null when the file may be sent.
 * Server still re-validates in `validatePaymentDocumentUpload`.
 */
export function classifyPaymentDocumentFile(file: {
  type?: string
  size: number
  name?: string
}): PaymentDocumentRejectReason | null {
  if (!file || file.size < 0) return 'empty'
  const type = (file.type || '').trim().toLowerCase()
  const name = file.name || ''
  const ext = extensionOf(name)

  if (HEIC_TYPES.has(type) || ext === 'heic' || ext === 'heif') return 'heic'
  if (!type && !ext) return 'empty'
  if (type) {
    if (!isAllowedPaymentDocumentType(type)) return 'type'
  } else if (!['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext)) {
    return 'type'
  }
  if (file.size > PAYMENT_DOCUMENT_MAX_BYTES) return 'size'
  return null
}
