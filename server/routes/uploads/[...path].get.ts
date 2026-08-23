import { createReadStream, existsSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { createS3ClientForReads, localUploadsRoot } from '../../utils/storage'

const CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

function contentTypeFor(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  return CONTENT_TYPE[ext] || ''
}

/**
 * Serve `/uploads/*` from `data/uploads` (primary), legacy public paths, then S3.
 * Always return relative `/uploads/…` URLs from upload APIs so public S3 ACL is not required.
 */
export default defineEventHandler(async (event) => {
  const raw = (getRouterParam(event, 'path') || '').replace(/^\/+/, '')
  if (!raw || raw.includes('\0') || raw.split(/[/\\]/).includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const candidates = [
    join(localUploadsRoot(), raw),
    join(process.cwd(), 'public', 'uploads', raw),
    join(process.cwd(), '.output', 'public', 'uploads', raw),
  ]

  const uploadsRoots = [
    normalize(localUploadsRoot()) + sep,
    normalize(join(process.cwd(), 'public', 'uploads')) + sep,
    normalize(join(process.cwd(), '.output', 'public', 'uploads')) + sep,
  ]

  for (const candidate of candidates) {
    const resolved = normalize(candidate)
    if (!uploadsRoots.some((root) => resolved.startsWith(root))) continue
    if (!existsSync(resolved)) continue

    const type = contentTypeFor(resolved)
    if (!type) {
      throw createError({ statusCode: 415, statusMessage: 'Unsupported file type' })
    }

    setHeader(event, 'Content-Type', type)
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    return sendStream(event, createReadStream(resolved))
  }

  const s3 = createS3ClientForReads()
  if (s3) {
    try {
      const out = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: raw }))
      const type = contentTypeFor(raw) || out.ContentType || 'application/octet-stream'
      setHeader(event, 'Content-Type', type)
      setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
      if (out.Body) {
        const bytes = Buffer.from(await out.Body.transformToByteArray())
        return bytes
      }
    } catch {
      // fall through to 404
    }
  }

  throw createError({ statusCode: 404, statusMessage: 'Not found' })
})
