import { postLoginRedirectPath } from '../../utils/auth'
import { signInOAuthUser, upsertGoogleUser } from '../../utils/oauth'

export default defineOAuthGoogleEventHandler({
  config: {
    scope: ['email', 'profile', 'openid'],
  },
  async onSuccess(event, { user }) {
    const returnTo = getCookie(event, 'oauth_return_to') || ''
    const locale = getCookie(event, 'oauth_locale') === 'en' ? 'en' : 'fa'
    deleteCookie(event, 'oauth_return_to')
    deleteCookie(event, 'oauth_locale')

    const dbUser = await upsertGoogleUser({
      sub: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
    }, locale)
    await signInOAuthUser(event, dbUser)
    const target = postLoginRedirectPath(dbUser, locale, returnTo || undefined)
    return sendRedirect(event, target)
  },
  onError(event, error) {
    console.error('Google OAuth error:', error)
    const locale = getCookie(event, 'oauth_locale') === 'en' ? 'en' : 'fa'
    deleteCookie(event, 'oauth_locale')
    const base = locale === 'en' ? '/en' : ''
    return sendRedirect(event, `${base}/login?error=google`)
  },
})
