import type { H3Event } from 'h3'
import { checkRateLimitBucket } from '#shared/rateLimitBucket.ts'

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX) || 15

async function rateLimitStorage() {
  try {
    if (process.env.REDIS_URL) {
      return useStorage('redis')
    }
  } catch {
    // redis storage not configured
  }
  return useStorage('cache')
}

export async function enforceRateLimit(event: H3Event, key: string) {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const bucketKey = `rate:${key}:${ip}`
  const storage = await rateLimitStorage()
  const now = Date.now()

  const existing = await storage.getItem<{ count: number; resetAt: number }>(bucketKey)
  const result = checkRateLimitBucket(existing, now, { windowMs: WINDOW_MS, max: MAX_REQUESTS })

  if (!result.allowed) {
    throw createError({ statusCode: 429, statusMessage: 'errors.rateLimited' })
  }

  const ttlSeconds = Math.max(1, Math.ceil((result.bucket.resetAt - now) / 1000))
  await storage.setItem(bucketKey, result.bucket, { ttl: ttlSeconds })
}
