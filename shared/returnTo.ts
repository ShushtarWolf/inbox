const LOCALE_PREFIX = /^\/en(?=\/|$)/

export function roleDashboardPath(role: string, locale: 'fa' | 'en' = 'fa') {
  const base = locale === 'en' ? '/en' : ''
  if (role === 'CLUB_ADMIN') return `${base}/owner`
  if (role === 'COACH') return `${base}/coach`
  return `${base}/athlete`
}

export function profilePathForRole(role: string, locale: 'fa' | 'en' = 'fa') {
  const base = locale === 'en' ? '/en' : ''
  if (role === 'CLUB_ADMIN') return `${base}/owner/settings`
  if (role === 'COACH') return `${base}/coach/profile`
  return `${base}/athlete/profile`
}

export function buildReturnTo(path: string, query?: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value)
    }
  }
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

export function sanitizeReturnTo(value: unknown, locale: 'fa' | 'en' = 'fa') {
  if (typeof value !== 'string' || !value) return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null
  if (trimmed.includes('://')) return null

  const hasEnPrefix = LOCALE_PREFIX.test(trimmed)
  const normalized = locale === 'en'
    ? (hasEnPrefix ? trimmed : `/en${trimmed === '/' ? '' : trimmed}`)
    : (hasEnPrefix ? trimmed.replace(LOCALE_PREFIX, '') || '/' : trimmed)

  if (normalized === '/login' || normalized === '/en/login') return null
  if (normalized === '/register' || normalized === '/en/register') return null

  return normalized
}

export function resolvePostLoginPath(role: string, locale: 'fa' | 'en', returnTo?: string) {
  return sanitizeReturnTo(returnTo, locale) || roleDashboardPath(role, locale)
}
