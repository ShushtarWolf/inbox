/** Headers that must never leave the process in Sentry payloads. */
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-admin-secret',
  'x-api-key',
  'proxy-authorization',
])

type ScrubbableEvent = {
  request?: {
    headers?: Record<string, string>
    cookies?: unknown
  }
}

/** Strip cookies / auth headers from a Sentry event before send. */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  const headers = event.request?.headers
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
        headers[key] = '[Filtered]'
      }
    }
  }
  if (event.request && 'cookies' in event.request) {
    event.request.cookies = undefined
  }
  return event
}
