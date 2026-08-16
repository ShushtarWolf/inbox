/** Allowed image MIME types for user uploads (avatars, gallery, guest license). */
export const IMAGE_UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ImageUploadAllowedType = (typeof IMAGE_UPLOAD_ALLOWED_TYPES)[number]

export const IMAGE_UPLOAD_ALLOWED_TYPE_SET = new Set<string>(IMAGE_UPLOAD_ALLOWED_TYPES)

/** Max upload size — keep in sync with UI copy (`upload.rulesBody`). */
export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

/** `<input accept>` value for file pickers. */
export const IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_ALLOWED_TYPES.join(',')

export type ImageUploadRejectReason = 'empty' | 'heic' | 'type' | 'size'

const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

function extensionOf(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function isAllowedImageUploadType(contentType: string) {
  return IMAGE_UPLOAD_ALLOWED_TYPE_SET.has(contentType)
}

/**
 * Client-side classify before upload. Returns null when the file may be sent.
 * Server still re-validates in `validateImageUpload`.
 */
export function classifyImageUploadFile(file: { type?: string; size: number; name?: string }): ImageUploadRejectReason | null {
  if (!file || file.size < 0) return 'empty'
  const type = (file.type || '').trim().toLowerCase()
  const name = file.name || ''
  const ext = extensionOf(name)

  if (HEIC_TYPES.has(type) || ext === 'heic' || ext === 'heif') return 'heic'
  if (!type && !ext) return 'empty'
  if (type) {
    if (!isAllowedImageUploadType(type)) return 'type'
  } else if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return 'type'
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) return 'size'
  return null
}
