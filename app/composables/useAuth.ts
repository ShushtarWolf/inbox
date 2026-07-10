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
  const { user: sessionUser, loggedIn, fetch: refreshSession, clear, ready } = useUserSession()
  const profile = useState<AuthUser | null>('auth-profile', () => null)
  const pending = useState('auth-pending', () => false)
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

  async function login(email: string, password: string) {
    const data = await requestFetch<AuthUser>('/api/auth/login', { method: 'POST', body: { email, password } })
    profile.value = data
    await refreshSession()
    await alignLocaleWithUrl()
    return data
  }

  async function logout() {
    await requestFetch('/api/auth/logout', { method: 'POST' })
    profile.value = null
    await clear()
  }

  return { user, pending, fetch, login, logout, loggedIn, ready }
}
