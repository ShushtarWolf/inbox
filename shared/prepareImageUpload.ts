import {
  IMAGE_UPLOAD_MAX_BYTES,
  isHeicLikeFile,
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

async function decodeHeicWithLibrary(file: File): Promise<ImageBitmap> {
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
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

async function decodeImageForUpload(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (err) {
    if (!isHeicLikeFile(file)) throw err
    return decodeHeicWithLibrary(file)
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

async function encodeTypeUnderCap(canvas: HTMLCanvasElement, type: PreparedImageMime) {
  let quality = IMAGE_PREPARE_WEBP_QUALITY
  let last: Blob | null = null
  while (quality >= IMAGE_PREPARE_MIN_QUALITY - 1e-6) {
    const blob = await canvasToBlob(canvas, type, quality)
    if (!blob) return null
    last = blob
    if (blob.size <= IMAGE_UPLOAD_MAX_BYTES) return blob
    quality -= IMAGE_PREPARE_QUALITY_STEP
  }
  return last
}

async function encodeCanvasUnderCap(canvas: HTMLCanvasElement): Promise<{ blob: Blob; type: PreparedImageMime }> {
  let current = canvas
  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const type of ['image/webp', 'image/jpeg'] as const) {
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
