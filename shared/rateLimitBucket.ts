export type RateLimitBucket = { count: number; resetAt: number }

export type RateLimitOptions = {
  windowMs?: number
  max?: number
}

const DEFAULT_WINDOW_MS = 60_000
const DEFAULT_MAX = 15

/** Pure rate-limit bucket update. Returns null if allowed, error message if limited. */
export function checkRateLimitBucket(
  bucket: RateLimitBucket | null,
  now = Date.now(),
  opts: RateLimitOptions = {},
): { allowed: true; bucket: RateLimitBucket } | { allowed: false; bucket: RateLimitBucket } {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS
  const max = opts.max ?? DEFAULT_MAX

  if (!bucket || now >= bucket.resetAt) {
    return { allowed: true, bucket: { count: 1, resetAt: now + windowMs } }
  }

  const next = { ...bucket, count: bucket.count + 1 }
  if (next.count > max) {
    return { allowed: false, bucket: next }
  }
  return { allowed: true, bucket: next }
}
