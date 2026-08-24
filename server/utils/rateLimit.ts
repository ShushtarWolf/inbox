import type { H3Event } from 'h3'
import { checkRateLimitBucket } from '#shared/rateLimitBucket.ts'
import { resolveClientIpForRateLimit } from '#shared/clientIp.ts'

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX) || 15

/** Competition join: per IP and per authenticated user (default 10 / min each). */
const COMPETITION_JOIN_WINDOW_MS = Number(process.env.COMPETITION_JOIN_RATE_LIMIT_WINDOW_MS) || 60_000
const COMPETITION_JOIN_MAX = Number(process.env.COMPETITION_JOIN_RATE_LIMIT_MAX) || 10

type RateLimitKeyConfig = {
  windowMs: number
  max: number
  perUser?: boolean
  statusMessage?: string
}

const KEY_LIMITS: Record<string, RateLimitKeyConfig> = {
  'competitions:join': {
    windowMs: COMPETITION_JOIN_WINDOW_MS,
    max: COMPETITION_JOIN_MAX,
    perUser: true,
    statusMessage: 'COMPETITION_JOIN_RATE_LIMITED',
  },
}

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

async function enforceBucket(
  bucketKey: string,
  windowMs: number,
  max: number,
  statusMessage = 'errors.rateLimited',
) {
  const storage = await rateLimitStorage()
  const now = Date.now()
  const existing = await storage.getItem<{ count: number; resetAt: number }>(bucketKey)
  const result = checkRateLimitBucket(existing, now, { windowMs, max })

  if (!result.allowed) {
    throw createError({ statusCode: 429, statusMessage })
  }

  const ttlSeconds = Math.max(1, Math.ceil((result.bucket.resetAt - now) / 1000))
  await storage.setItem(bucketKey, result.bucket, { ttl: ttlSeconds })
}

export async function enforceRateLimit(event: H3Event, key: string) {
  const config = KEY_LIMITS[key]
  const windowMs = config?.windowMs ?? WINDOW_MS
  const max = config?.max ?? MAX_REQUESTS
  const statusMessage = config?.statusMessage ?? 'errors.rateLimited'

  const ip = clientIpForRateLimit(event)
  await enforceBucket(`rate:${key}:${ip}`, windowMs, max, statusMessage)

  if (config?.perUser) {
    const session = await getUserSession(event)
    const userId = session?.user?.id
    if (userId) {
      await enforceBucket(`rate:${key}:user:${userId}`, windowMs, max, statusMessage)
    }
  }
}

/**
 * Prefer platform client-IP headers (Liara/Cloudflare set these from the socket).
 * For X-Forwarded-For, use the rightmost hop (added by the edge), not the leftmost
 * (client-spoofable).
 */
export function clientIpForRateLimit(event: H3Event): string {
  const headers = getRequestHeaders(event)
  return resolveClientIpForRateLimit({
    platformIp: firstHeaderValue(headers['cf-connecting-ip'])
      || firstHeaderValue(headers['x-real-ip'])
      || firstHeaderValue(headers['true-client-ip']),
    xForwardedFor: firstHeaderValue(headers['x-forwarded-for']),
    fallback: getRequestIP(event),
  })
}

function firstHeaderValue(value: string | string[] | undefined) {
  if (!value) return ''
  const raw = Array.isArray(value) ? value[0] : value
  return (raw || '').trim()
}

/** Per-phone OTP send limit (Iranian mobile already normalized to 09…). */
export async function enforceOtpSendPhoneLimit(phone: string) {
  await enforceBucket(`rate:auth:otp-send-phone:${phone}`, OTP_PHONE_SEND_WINDOW_MS, OTP_PHONE_SEND_MAX)
}

/** Per-phone OTP verify limit. */
export async function enforceOtpVerifyPhoneLimit(phone: string) {
  await enforceBucket(`rate:auth:otp-verify-phone:${phone}`, OTP_PHONE_VERIFY_WINDOW_MS, OTP_PHONE_VERIFY_MAX)
}
