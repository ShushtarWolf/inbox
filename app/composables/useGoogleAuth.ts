export function useGoogleAuth() {
  const config = useRuntimeConfig()
  const returnToCookie = useCookie<string | null>('oauth_return_to', { sameSite: 'lax', maxAge: 600 })
  const localeCookie = useCookie<string | null>('oauth_locale', { sameSite: 'lax', maxAge: 600 })

  const googleAuthEnabled = computed(() => Boolean(config.public.googleAuthEnabled))

  function startGoogleSignIn(returnTo?: string) {
    if (!googleAuthEnabled.value) {
      return navigateTo('/login?error=google')
    }
    returnToCookie.value = returnTo || null
    localeCookie.value = 'fa'
    return navigateTo('/auth/google', { external: true })
  }

  return { startGoogleSignIn, googleAuthEnabled }
}
