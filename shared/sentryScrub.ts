/** Headers that must never leave the process in Sentry payloads. */
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-admin-secret',
  'x-api-key',
  'proxy-authorization',
])

/** Expected auth / validation rejects — not product outages. */
const DROP_ERROR_VALUES = new Set([
  'OTP expired or missing',
  'Invalid OTP',
  'OTP_RESEND_COOLDOWN',
  'errors.rateLimited',
  'Account disabled',
  'Demo accounts are not available',
  'Invalid discount code',
])

/**
 * Probe / bot 404 paths. Matched against "Page not found: …" messages and path tags.
 * Keep this conservative — only known scanners, not real product routes.
 */
const PROBE_PATH_RE =
  /(?:^|\/)(?:\.env|\.git|xmlrpc|wp-|wordpress|wlwmanifest|phpmyadmin|apple-touch-icon|config\.json|config\.js|secrets\.json|docker-compose|appsettings|server-status|actuator|cgi-bin|adminer|vendor\/|images\/images\/cache\.php|api\/session\/properties)/i

type ScrubbableEvent = {
  message?: string
  request?: {
    headers?: Record<string, string>
    cookies?: unknown
    url?: string
  }
  tags?: Array<{ key?: string; value?: string }> | Record<string, string>
  exception?: {
    values?: Array<{ type?: string; value?: string }>
  }
}

function tagValue(event: ScrubbableEvent, key: string): string {
  const tags = event.tags
  if (!tags) return ''
  if (Array.isArray(tags)) {
    const hit = tags.find((t) => t?.key === key)
    return String(hit?.value || '')
  }
  return String(tags[key] || '')
}

function eventErrorText(event: ScrubbableEvent): string {
  const parts: string[] = []
  if (event.message) parts.push(event.message)
  for (const v of event.exception?.values || []) {
    if (v?.type) parts.push(v.type)
    if (v?.value) parts.push(v.value)
  }
  return parts.join('\n')
}

/** True when this event is scanner noise or an expected auth reject. */
export function shouldDropSentryEvent(event: object): boolean {
  const e = event as ScrubbableEvent
  const text = eventErrorText(e)
  for (const value of DROP_ERROR_VALUES) {
    if (text.includes(value)) return true
  }
  const path = tagValue(e, 'path') || e.request?.url || ''
  if (PROBE_PATH_RE.test(path)) return true
  if (/page not found:/i.test(text) && PROBE_PATH_RE.test(text)) return true
  return false
}

/**
 * Strip cookies / auth headers. Returns `null` to drop noise (Sentry beforeSend).
 */
export function scrubSentryEvent<T extends object>(event: T): T | null {
  if (shouldDropSentryEvent(event)) return null

  const scrubbable = event as T & ScrubbableEvent
  const headers = scrubbable.request?.headers
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
        headers[key] = '[Filtered]'
      }
    }
  }
  if (scrubbable.request && 'cookies' in scrubbable.request) {
    scrubbable.request.cookies = undefined
  }
  return event
}
