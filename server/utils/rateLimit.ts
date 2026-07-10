import type { H3Event } from 'h3'

const buckets = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 60_000
const MAX_REQUESTS = 15

export function enforceRateLimit(event: H3Event, key: string) {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const bucketKey = `${key}:${ip}`
  const now = Date.now()
  const bucket = buckets.get(bucketKey)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + WINDOW_MS })
    return
  }

  bucket.count += 1
  if (bucket.count > MAX_REQUESTS) {
    throw createError({ statusCode: 429, statusMessage: 'errors.rateLimited' })
  }
}
