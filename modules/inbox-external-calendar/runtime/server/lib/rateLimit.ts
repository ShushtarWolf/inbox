interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export function checkAdapterRateLimit(
  key: string,
  max = 30,
  windowMs = 60_000,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }
  if (bucket.count >= max) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now }
  }
  bucket.count += 1
  return { allowed: true, retryAfterMs: 0 }
}

export function resetAdapterRateLimitsForTests() {
  buckets.clear()
}
