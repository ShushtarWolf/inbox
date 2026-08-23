import {
  IMAGE_UPLOAD_MAX_BYTES,
  isHeicFtypHeader,
  isHeicLikeFile,
  sniffImageUploadContentType,
} from './imageUpload.ts'

export const IMAGE_PREPARE_LONG_EDGE_PX = 1920
export const IMAGE_PREPARE_WEBP_QUALITY = 0.82
export const IMAGE_PREPARE_MIN_QUALITY = 0.4
export const IMAGE_PREPARE_QUALITY_STEP = 0.08

export type PreparedImageMime = 'image/webp' | 'image/jpeg'

export function fittedImageSize(
  width: number,
  height: number,
  maxEdge: number = IMAGE_PREPARE_LONG_EDGE_PX,
) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const long = Math.max(w, h)
  if (long <= maxEdge) return { width: w, height: h }
  const scale = maxEdge / long
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

export function preparedImageFileName(mime: PreparedImageMime) {
  return mime === 'image/webp' ? 'photo.webp' : 'photo.jpg'
}

async function createImageBitmapFromSource(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: 'from-image' })
  } catch {
    return createImageBitmap(source)
  }
}

async function isLikelyHeicFile(file: File): Promise<boolean> {
  if (isHeicLikeFile(file)) return true
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    return isHeicFtypHeader(head)
  } catch {
    return false
  }
}

async function decodeViaImageElement(source: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(source)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.drawImage(img, 0, 0)
    return createImageBitmap(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function decodeHeicWithLibrary(file: File): Promise<ImageBitmap> {
  try {
    const { heicTo } = await import('heic-to')
    try {
      const bitmap = await heicTo({
        blob: file,
        type: 'bitmap',
        options: { imageOrientation: 'from-image' },
      })
      if (bitmap && typeof (bitmap as ImageBitmap).width === 'number') {
        return bitmap as ImageBitmap
      }
    } catch {
      // Convert to JPEG then decode — some builds skip bitmap output.
    }
    const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 })
    const blob = jpeg instanceof Blob ? jpeg : new Blob([jpeg as BlobPart], { type: 'image/jpeg' })
    return createImageBitmapFromSource(blob)
  } catch {
    // Safari on iOS can decode HEIC via <img> even when heic-to/WASM fails.
    return decodeViaImageElement(file)
  }
}

async function decodeImageForUpload(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmapFromSource(file)
  } catch (primaryErr) {
    if (await isLikelyHeicFile(file)) {
      return decodeHeicWithLibrary(file)
    }
    try {
      return await decodeViaImageElement(file)
    } catch {
      throw primaryErr
    }
  }
}

function drawFittedCanvas(bitmap: ImageBitmap) {
  const { width, height } = fittedImageSize(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function scaleCanvas(source: HTMLCanvasElement, factor: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * factor))
  canvas.height = Math.max(1, Math.round(source.height * factor))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d unavailable')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, type: PreparedImageMime, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

/** True only when bytes (or blob.type, if magic is missing) match the requested encoder. */
export async function blobMatchesPreparedType(blob: Blob, requested: PreparedImageMime) {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  const sniffed = sniffImageUploadContentType(head)
  if (sniffed) return sniffed === requested
  return (blob.type || '').trim().toLowerCase() === requested
}

async function encodeTypeUnderCap(canvas: HTMLCanvasElement, type: PreparedImageMime) {
  let quality = IMAGE_PREPARE_WEBP_QUALITY
  let last: Blob | null = null
  while (quality >= IMAGE_PREPARE_MIN_QUALITY - 1e-6) {
    const blob = await canvasToBlob(canvas, type, quality)
    if (!blob) return null
    // Safari/WebView: toBlob('image/webp') often returns PNG, not null.
    if (!(await blobMatchesPreparedType(blob, type))) return null
    last = blob
    if (blob.size <= IMAGE_UPLOAD_MAX_BYTES) return blob
    quality -= IMAGE_PREPARE_QUALITY_STEP
  }
  return last
}

async function encodeCanvasUnderCap(canvas: HTMLCanvasElement): Promise<{ blob: Blob; type: PreparedImageMime }> {
  let current = canvas
  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const type of ['image/jpeg', 'image/webp'] as const) {
      const blob = await encodeTypeUnderCap(current, type)
      if (blob && blob.size <= IMAGE_UPLOAD_MAX_BYTES) {
        return { blob, type }
      }
    }
    current = scaleCanvas(current, 0.75)
  }
  throw new Error('prepared image still too large')
}

/** Decode, resize (~1920 long edge), export WebP (JPEG fallback) under 5 MB. */
export async function prepareImageForUpload(file: File): Promise<File> {
  const bitmap = await decodeImageForUpload(file)
  try {
    const canvas = drawFittedCanvas(bitmap)
    const encoded = await encodeCanvasUnderCap(canvas)
    return new File([encoded.blob], preparedImageFileName(encoded.type), {
      type: encoded.type,
      lastModified: Date.now(),
    })
  } finally {
    bitmap.close()
  }
}
