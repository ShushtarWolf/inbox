/**
 * Resolve a rate-limit client IP without trusting the leftmost X-Forwarded-For hop
 * (clients can spoof that). Prefer platform headers; otherwise use the rightmost XFF hop.
 */
export function resolveClientIpForRateLimit(opts: {
  platformIp?: string | null
  xForwardedFor?: string | null
  fallback?: string | null
}) {
  const platform = (opts.platformIp || '').trim()
  if (platform) return platform.split(',')[0]!.trim()

  const xff = (opts.xForwardedFor || '').trim()
  if (xff) {
    const parts = xff.split(',').map((part) => part.trim()).filter(Boolean)
    if (parts.length) return parts[parts.length - 1]!
  }

  return (opts.fallback || '').trim() || 'unknown'
}
