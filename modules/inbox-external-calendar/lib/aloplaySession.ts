export const ALOPLAY_API_BASE = 'https://ws.aloplay.io/api'

export interface AloPlayCredentials {
  mobile: string
  password: string
  dialCode: string
}

export interface AloPlaySession {
  token: string
  expiration?: string
}

export interface AloPlayFetchResult {
  ok: boolean
  status: number
  payload: unknown | null
}

const TEHRAN_TIME_ZONE = 'Asia/Tehran'
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000

/** Read AloPlay credentials from runtime env only (never hardcode). */
export function resolveAloPlayCredentials(
  env: NodeJS.ProcessEnv = process.env,
): AloPlayCredentials | null {
  const mobile = (env.ALOPLAY_MOBILE || env.NUXT_ALOPLAY_MOBILE || '').trim()
  const password = env.ALOPLAY_PASSWORD || env.NUXT_ALOPLAY_PASSWORD || ''
  const dialCode = (env.ALOPLAY_DIAL_CODE || env.NUXT_ALOPLAY_DIAL_CODE || '98').replace(/^\+/, '')
  if (!mobile || !password) return null
  return { mobile, password, dialCode }
}

/** Public GetAvailableTime is today-only; future dates need an authenticated session. */
export function needsAloPlaySession(date: string, now: Date = new Date()): boolean {
  const today = formatGregorianDateInTimeZone(now, TEHRAN_TIME_ZONE)
  return date > today
}

export function formatGregorianDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date)
}

export function parseAuthenticationResponse(payload: unknown): { session?: AloPlaySession; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Authentication response is not an object' }
  }
  const record = payload as Record<string, unknown>
  const statusCode = record.statusCode
  if (statusCode !== 0 && statusCode !== '0') {
    const message = typeof record.message === 'string' ? record.message : 'Authentication failed'
    return { error: message }
  }
  const data = record.data
  if (!data || typeof data !== 'object') {
    return { error: 'Authentication missing data' }
  }
  const dataRecord = data as Record<string, unknown>
  const message = dataRecord.message
  if (message !== 'Success' && message !== 'success') {
    const failure = typeof message === 'string' ? message : 'Authentication rejected'
    return { error: failure }
  }
  const token = dataRecord.token
  if (typeof token !== 'string' || !token.trim()) {
    return { error: 'Authentication missing token' }
  }
  const expiration = typeof dataRecord.expiration === 'string' ? dataRecord.expiration : undefined
  return { session: { token: token.trim(), expiration } }
}

export function buildAloPlayAuthHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://aloplay.io',
    Referer: 'https://aloplay.io/',
    Authorization: `Bearer ${token}`,
  }
}

export function buildAloPlayPublicHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://aloplay.io',
    Referer: 'https://aloplay.io/',
  }
}

export function sessionCacheTtlMs(session: AloPlaySession): number {
  if (session.expiration) {
    const expiresAt = Date.parse(session.expiration)
    if (!Number.isNaN(expiresAt)) {
      const remaining = expiresAt - Date.now()
      if (remaining > 60_000) return remaining
    }
  }
  return DEFAULT_SESSION_TTL_MS
}

export function buildAuthenticationBody(credentials: AloPlayCredentials, fcmToken = ''): Record<string, string> {
  return {
    dialCode: `+${credentials.dialCode}`,
    username: credentials.mobile,
    password: credentials.password,
    fcmToken,
  }
}

export function buildIsExsistPath(credentials: AloPlayCredentials): string {
  const params = new URLSearchParams({
    mobile: credentials.mobile,
    dialCode: `+${credentials.dialCode}`,
  })
  return `v1/User/IsExsist?${params.toString()}`
}

export async function aloPlayFetchJson(
  fetchImpl: typeof fetch,
  path: string,
  opts: {
    method?: 'GET' | 'POST'
    query?: Record<string, string | number>
    body?: Record<string, unknown>
    headers?: Record<string, string>
    timeoutMs?: number
  } = {},
): Promise<AloPlayFetchResult> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    params.set(key, String(value))
  }
  const query = params.toString()
  const url = query ? `${ALOPLAY_API_BASE}/${path}?${query}` : `${ALOPLAY_API_BASE}/${path}`
  const response = await fetchImpl(url, {
    method: opts.method ?? 'GET',
    headers: opts.headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
  })
  const text = await response.text()
  let payload: unknown | null = null
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      payload = text
    }
  }
  return { ok: response.ok, status: response.status, payload }
}
