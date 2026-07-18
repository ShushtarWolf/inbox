import { profilePathForRole, roleDashboardPath, resolvePostLoginPath, sanitizeReturnTo, buildReturnTo } from '#shared/returnTo.ts'

export { roleDashboardPath, profilePathForRole, resolvePostLoginPath, sanitizeReturnTo, buildReturnTo }

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
  avatarUrl?: string | null
  memberships?: Array<{
    role: string
    isPrimary: boolean
    permissionsJson?: string | null
    club: {
      id: string
      slug: string
      nameFa: string
      nameEn: string
      _count?: { coaches?: number }
    }
  }>
}

export function useAuth() {
  const localePath = useLocalePath()
  const { user: sessionUser, loggedIn, fetch: refreshSession, clear, ready } = useUserSession()
  const profile = useState<AuthUser | null>('auth-profile', () => null)
  const pending = useState('auth-pending', () => false)
  const ownerClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch

  const user = computed<AuthUser | null>(() => profile.value ?? (sessionUser.value as AuthUser | null) ?? null)

  const displayName = computed(() => {
    const current = user.value
    if (!current) return ''
    const faName = current.name?.trim()
    const enName = current.nameEn?.trim()
    // FA-only launch: prefer Persian name
    return faName || enName || current.email.split('@')[0] || ''
  })

  const firstName = computed(() => displayName.value.split(/\s+/)[0] || '')

  const initials = computed(() => {
    const parts = displayName.value.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0]![0] || ''}${parts[1]![0] || ''}`.toUpperCase()
    return (displayName.value[0] || '?').toUpperCase()
  })

  const avatarUrl = computed(() => user.value?.avatarUrl || null)

  const profilePath = computed(() => {
    if (!user.value) return localePath('/login')
    return localePath(profilePathForRole(user.value.role, 'fa'))
  })

  async function fetch() {
    pending.value = true
    try {
      await refreshSession()
      const data = await requestFetch<{ user: AuthUser | null }>('/api/auth/me')
      profile.value = data.user
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
    displayName,
    firstName,
    initials,
    avatarUrl,
    profilePath,
    pending,
    fetch,
    login,
    logout,
    loggedIn,
    ready,
    dashboardPathForRole: (role: string) => dashboardPathForRole(role, 'fa'),
  }
}
