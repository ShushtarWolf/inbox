import { createReadStream, existsSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { localUploadsRoot } from '../../utils/storage'

const CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

/**
 * Serve `/uploads/*` from Nitro's public dir and legacy `public/uploads`.
 * Needed when files were written to the wrong root before localUploadsRoot().
 */
export default defineEventHandler((event) => {
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

    const ext = resolved.split('.').pop()?.toLowerCase() || ''
    const type = CONTENT_TYPE[ext]
    if (!type) {
      throw createError({ statusCode: 415, statusMessage: 'Unsupported file type' })
    }

    setHeader(event, 'Content-Type', type)
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    return sendStream(event, createReadStream(resolved))
  }

  throw createError({ statusCode: 404, statusMessage: 'Not found' })
})
