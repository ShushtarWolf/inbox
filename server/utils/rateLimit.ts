import type { H3Event } from 'h3'
import { checkRateLimitBucket } from '#shared/rateLimitBucket.ts'

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX) || 15

/** OTP send: max requests per phone (default 3 / 10 min). */
const OTP_PHONE_SEND_WINDOW_MS = Number(process.env.OTP_PHONE_SEND_WINDOW_MS) || 10 * 60_000
const OTP_PHONE_SEND_MAX = Number(process.env.OTP_PHONE_SEND_MAX) || 3
/** OTP verify: max attempts per phone (default 10 / 10 min) in addition to per-code attempts. */
const OTP_PHONE_VERIFY_WINDOW_MS = Number(process.env.OTP_PHONE_VERIFY_WINDOW_MS) || 10 * 60_000
const OTP_PHONE_VERIFY_MAX = Number(process.env.OTP_PHONE_VERIFY_MAX) || 10

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

async function enforceBucket(bucketKey: string, windowMs: number, max: number) {
  const storage = await rateLimitStorage()
  const now = Date.now()
  const existing = await storage.getItem<{ count: number; resetAt: number }>(bucketKey)
  const result = checkRateLimitBucket(existing, now, { windowMs, max })

  if (!result.allowed) {
    throw createError({ statusCode: 429, statusMessage: 'errors.rateLimited' })
  }

  const ttlSeconds = Math.max(1, Math.ceil((result.bucket.resetAt - now) / 1000))
  await storage.setItem(bucketKey, result.bucket, { ttl: ttlSeconds })
}

export async function enforceRateLimit(event: H3Event, key: string) {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  await enforceBucket(`rate:${key}:${ip}`, WINDOW_MS, MAX_REQUESTS)
}

/** Per-phone OTP send limit (Iranian mobile already normalized to 09…). */
export async function enforceOtpSendPhoneLimit(phone: string) {
  await enforceBucket(`rate:auth:otp-send-phone:${phone}`, OTP_PHONE_SEND_WINDOW_MS, OTP_PHONE_SEND_MAX)
}

/** Per-phone OTP verify limit. */
export async function enforceOtpVerifyPhoneLimit(phone: string) {
  await enforceBucket(`rate:auth:otp-verify-phone:${phone}`, OTP_PHONE_VERIFY_WINDOW_MS, OTP_PHONE_VERIFY_MAX)
}
