/** Google OAuth is retired from product UI (Iran MVP = phone OTP). */
export function useGoogleAuth() {
  const googleAuthEnabled = computed(() => false)

  function startGoogleSignIn(_returnTo?: string) {
    return navigateTo('/login?error=session')
  }

  return { startGoogleSignIn, googleAuthEnabled }
}
