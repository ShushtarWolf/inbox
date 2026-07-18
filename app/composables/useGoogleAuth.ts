import { sanitizeReturnTo } from '#shared/returnTo.ts'

export function useGoogleAuth() {
  const config = useRuntimeConfig()
  const returnToCookie = useCookie<string | null>('oauth_return_to', { sameSite: 'lax', maxAge: 600 })
  const localeCookie = useCookie<string | null>('oauth_locale', { sameSite: 'lax', maxAge: 600 })

  // Runtime check (Liara env) with build-time public config as SSR fallback.
  const { data: googleStatus } = useFetch<{ enabled: boolean }>('/api/auth/google-enabled', {
    key: 'auth-google-enabled',
  })

  const googleAuthEnabled = computed(() => {
    if (typeof googleStatus.value?.enabled === 'boolean') return googleStatus.value.enabled
    return Boolean(config.public.googleAuthEnabled)
  })

  function startGoogleSignIn(returnTo?: string) {
    if (!googleAuthEnabled.value) {
      return navigateTo('/login?error=google')
    }
    const safeReturnTo = sanitizeReturnTo(returnTo, 'fa')
    returnToCookie.value = safeReturnTo || null
    localeCookie.value = 'fa'
    return navigateTo('/auth/google', { external: true })
  }

  return { startGoogleSignIn, googleAuthEnabled }
}
