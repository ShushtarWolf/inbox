import { postLoginRedirectPath } from '../../utils/auth'
import { getGoogleOAuthStatus } from '../../utils/googleOAuth'
import { signInOAuthUser, upsertGoogleUser } from '../../utils/oauth'

function failGoogleLogin(event: Parameters<typeof sendRedirect>[0]) {
  deleteCookie(event, 'oauth_return_to')
  deleteCookie(event, 'oauth_locale')
  return sendRedirect(event, '/login?error=google')
}

export default defineEventHandler(async (event) => {
  const status = getGoogleOAuthStatus(event)

  // Fail closed for users: never serve raw 404/JSON when OAuth env is missing
  if (!status.enabled) {
    return failGoogleLogin(event)
  }

  // Google may redirect back with ?error=... and no code — do not restart the flow
  const query = getQuery(event)
  if (query.error && !query.code) {
    console.error('Google OAuth provider error:', query.error, query.error_description)
    return failGoogleLogin(event)
  }

  // Pass runtime-resolved credentials so Liara env (incl. SITE_URL→redirect) works post-build
  const handler = defineOAuthGoogleEventHandler({
    config: {
      scope: ['email', 'profile', 'openid'],
      clientId: status.clientId,
      clientSecret: status.clientSecret,
      redirectURL: status.redirectURL,
    },
    async onSuccess(event, { user }) {
      try {
        const returnTo = getCookie(event, 'oauth_return_to') || ''
        const localeCookie = getCookie(event, 'oauth_locale')
        const locale = localeCookie === 'en' ? 'en' : 'fa'
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
      }
      catch (error) {
        console.error('Google OAuth success handler failed:', error)
        return failGoogleLogin(event)
      }
    },
    onError(event, error) {
      console.error('Google OAuth error:', error)
      return failGoogleLogin(event)
    },
  })

  return handler(event)
})
