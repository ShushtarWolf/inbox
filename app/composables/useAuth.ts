import { roleDashboardPath, resolvePostLoginPath, sanitizeReturnTo, buildReturnTo } from '#shared/returnTo.ts'

export { roleDashboardPath, resolvePostLoginPath, sanitizeReturnTo, buildReturnTo }

export function dashboardPathForRole(role: string, locale: 'fa' | 'en' = 'fa') {
  return roleDashboardPath(role, locale)
}

type AuthUser = {
  id: string
  email: string
  name: string
  nameEn?: string | null
  role: string
  phone?: string | null
  locale?: string | null
  memberships?: Array<{
    role: string
    isPrimary: boolean
    club: {
      id: string
      slug: string
      nameFa: string
      nameEn: string
    }
  }>
}

export function useAuth() {
  const { locale, setLocale } = useI18n()
  const localePath = useLocalePath()
  const { user: sessionUser, loggedIn, fetch: refreshSession, clear, ready } = useUserSession()
  const profile = useState<AuthUser | null>('auth-profile', () => null)
  const pending = useState('auth-pending', () => false)
  const ownerClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch

  const user = computed<AuthUser | null>(() => profile.value ?? (sessionUser.value as AuthUser | null) ?? null)

  async function alignLocaleWithUrl() {
    if (!import.meta.client) return
    const route = useRoute()
    const urlLocale = route.path === '/en' || route.path.startsWith('/en/') ? 'en' : 'fa'
    if (locale.value !== urlLocale) {
      await setLocale(urlLocale)
    }
  }

  async function fetch() {
    pending.value = true
    try {
      await refreshSession()
      const data = await requestFetch<{ user: AuthUser | null }>('/api/auth/me')
      profile.value = data.user
      await alignLocaleWithUrl()
    } catch {
      profile.value = null
    } finally {
      pending.value = false
    }
  }

  async function login(email: string, password: string, returnTo?: string) {
    const data = await requestFetch<AuthUser & { redirectTo?: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password, returnTo },
    })
    profile.value = data
    await refreshSession()
    await alignLocaleWithUrl()
    if (data.redirectTo) {
      await navigateTo(data.redirectTo)
    }
    return data
  }

  async function logout(redirectTo?: string) {
    await requestFetch('/api/auth/logout', { method: 'POST' })
    profile.value = null
    ownerClubId.value = null
    await clear()
    await navigateTo(redirectTo || localePath('/'))
  }

  return {
    user,
    pending,
    fetch,
    login,
    logout,
    loggedIn,
    ready,
    dashboardPathForRole: (role: string) => dashboardPathForRole(role, locale.value === 'en' ? 'en' : 'fa'),
  }
}
