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
  const user = useState<AuthUser | null>('auth-user', () => null)
  const pending = useState('auth-pending', () => false)
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch

  async function syncLocale(nextLocale?: string | null) {
    if (!import.meta.client) return
    if ((nextLocale !== 'fa' && nextLocale !== 'en') || locale.value === nextLocale) return
    await setLocale(nextLocale)
  }

  async function fetch() {
    pending.value = true
    try {
      const data = await requestFetch<{ user: AuthUser | null }>('/api/auth/me')
      user.value = data.user
      await syncLocale(data.user?.locale)
    } catch {
      user.value = null
    } finally {
      pending.value = false
    }
  }

  async function login(email: string, password: string) {
    const data = await requestFetch<AuthUser>('/api/auth/login', { method: 'POST', body: { email, password } })
    user.value = data
    await syncLocale(data.locale)
    return data
  }

  async function logout() {
    await requestFetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, pending, fetch, login, logout }
}
