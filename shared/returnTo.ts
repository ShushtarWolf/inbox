const LOCALE_PREFIX = /^\/en(?=\/|$)/

export function roleDashboardPath(role: string, _locale: 'fa' | 'en' = 'fa') {
  // FA-only: ignore locale prefix
  void _locale
  if (role === 'CLUB_ADMIN') return '/owner'
  if (role === 'COACH') return '/coach'
  return '/athlete'
}

export function profilePathForRole(role: string, _locale: 'fa' | 'en' = 'fa') {
  void _locale
  if (role === 'CLUB_ADMIN') return '/owner/settings'
  if (role === 'COACH') return '/coach/profile'
  return '/athlete/profile'
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

export function sanitizeReturnTo(value: unknown, _locale: 'fa' | 'en' = 'fa') {
  void _locale
  if (typeof value !== 'string' || !value) return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null
  if (trimmed.includes('://')) return null

  // Strip legacy /en prefix so bookmarks still land on FA paths
  const normalized = LOCALE_PREFIX.test(trimmed)
    ? trimmed.replace(LOCALE_PREFIX, '') || '/'
    : trimmed

  if (normalized === '/login' || normalized === '/en/login') return null
  if (normalized === '/register' || normalized === '/en/register') return null

  return normalized
}

export function resolvePostLoginPath(role: string, locale: 'fa' | 'en' = 'fa', returnTo?: string) {
  return sanitizeReturnTo(returnTo, locale) || roleDashboardPath(role, locale)
}
