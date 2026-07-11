export function useGoogleAuth() {
  const { locale } = useI18n()
  const returnToCookie = useCookie<string | null>('oauth_return_to', { sameSite: 'lax', maxAge: 600 })
  const localeCookie = useCookie<string | null>('oauth_locale', { sameSite: 'lax', maxAge: 600 })

  function startGoogleSignIn(returnTo?: string) {
    returnToCookie.value = returnTo || null
    localeCookie.value = locale.value === 'en' ? 'en' : 'fa'
    return navigateTo('/auth/google', { external: true })
  }

  return { startGoogleSignIn }
}
