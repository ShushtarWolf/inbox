/** Server-stored image types after client prepare (never raw HEIC). */
export const IMAGE_UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ImageUploadAllowedType = (typeof IMAGE_UPLOAD_ALLOWED_TYPES)[number]

export const IMAGE_UPLOAD_ALLOWED_TYPE_SET = new Set<string>(IMAGE_UPLOAD_ALLOWED_TYPES)

/** Max bytes the server accepts (prepared WebP/JPEG). */
export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

/** Max bytes for the original picker file before in-app convert/compress. */
export const IMAGE_UPLOAD_SOURCE_MAX_BYTES = 25 * 1024 * 1024

const IMAGE_UPLOAD_PICKER_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

/** `<input accept>` — JPEG/PNG/WebP plus iPhone HEIC/HEIF. */
export const IMAGE_UPLOAD_ACCEPT = [...IMAGE_UPLOAD_PICKER_TYPES, '.heic', '.heif'].join(',')

export type ImageUploadRejectReason = 'empty' | 'heic' | 'type' | 'size'

const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

const PICKER_TYPE_SET = new Set<string>([
  ...IMAGE_UPLOAD_PICKER_TYPES,
  'image/heic-sequence',
  'image/heif-sequence',
])

const PICKER_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])

function extensionOf(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function isAllowedImageUploadType(contentType: string) {
  return IMAGE_UPLOAD_ALLOWED_TYPE_SET.has(contentType)
}

export function isHeicLikeFile(file: { type?: string; name?: string }) {
  const type = (file.type || '').trim().toLowerCase()
  const ext = extensionOf(file.name || '')
  return HEIC_TYPES.has(type) || ext === 'heic' || ext === 'heif'
}

/** ISO BMFF `ftyp` major brand — iOS often mislabels HEIC as JPEG in the picker. */
export function isHeicFtypHeader(bytes: Uint8Array) {
  if (bytes.length < 12) return false
  if (String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!) !== 'ftyp') return false
  const major = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!)
  return major === 'heic' || major === 'heif' || major === 'mif1' || major === 'msf1'
}

function asciiAt(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

/**
 * MIME from magic bytes — ignore declared type.
 * Safari `canvas.toBlob('image/webp')` can emit PNG while still labeling WebP;
 * Liara then serves `Content-Type: image/webp` + nosniff and the <img> breaks.
 */
export function sniffImageUploadContentType(bytes: Uint8Array | ArrayBuffer | null | undefined): ImageUploadAllowedType | '' {
  if (!bytes) return ''
  const head = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (
    head.length >= 8
    && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (head.length >= 12 && asciiAt(head, 0, 4) === 'RIFF' && asciiAt(head, 8, 4) === 'WEBP') {
    return 'image/webp'
  }
  return ''
}

/** Infer stored image MIME. Magic bytes win over multipart type/filename. */
export function inferImageUploadContentType(part: {
  type?: string
  filename?: string
  data?: Uint8Array | ArrayBuffer | null
}) {
  const sniffed = sniffImageUploadContentType(part.data)
  if (sniffed) return sniffed
  const type = (part.type || '').trim().toLowerCase()
  if (type && isAllowedImageUploadType(type)) return type
  const name = (part.filename || '').toLowerCase()
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.png')) return 'image/png'
  return type
}

/**
 * Client-side classify before prepare+upload. HEIC/HEIF is allowed here;
 * conversion happens in `prepareImageForUpload`. Server still rejects HEIC.
 */
export function classifyImageUploadFile(file: { type?: string; size: number; name?: string }): ImageUploadRejectReason | null {
  if (!file || file.size < 0) return 'empty'
  const type = (file.type || '').trim().toLowerCase()
  const name = file.name || ''
  const ext = extensionOf(name)

  if (!type && !ext) return 'empty'
  if (type) {
    if (!PICKER_TYPE_SET.has(type)) return 'type'
  } else if (!PICKER_EXTENSIONS.has(ext)) {
    return 'type'
  }
  if (file.size > IMAGE_UPLOAD_SOURCE_MAX_BYTES) return 'size'
  return null
}
