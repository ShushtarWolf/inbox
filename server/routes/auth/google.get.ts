import { postLoginRedirectPath } from '../../utils/auth'
import { signInOAuthUser, upsertGoogleUser } from '../../utils/oauth'

function isGoogleOAuthConfigured() {
  const config = useRuntimeConfig()
  const clientId = config.oauth?.google?.clientId
  const clientSecret = config.oauth?.google?.clientSecret
  return Boolean(clientId && clientSecret)
}

const oauthHandler = defineOAuthGoogleEventHandler({
  config: {
    scope: ['email', 'profile', 'openid'],
  },
  async onSuccess(event, { user }) {
    const returnTo = getCookie(event, 'oauth_return_to') || ''
    deleteCookie(event, 'oauth_return_to')
    deleteCookie(event, 'oauth_locale')

    const dbUser = await upsertGoogleUser({
      sub: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
    }, 'fa')
    await signInOAuthUser(event, dbUser)
    const target = postLoginRedirectPath(dbUser, 'fa', returnTo || undefined)
    return sendRedirect(event, target)
  },
  onError(event, error) {
    console.error('Google OAuth error:', error)
    deleteCookie(event, 'oauth_locale')
    return sendRedirect(event, '/login?error=google')
  },
})

export default defineEventHandler(async (event) => {
  // Fail closed for users: never serve raw 404/JSON when OAuth env is missing
  if (!isGoogleOAuthConfigured()) {
    deleteCookie(event, 'oauth_return_to')
    deleteCookie(event, 'oauth_locale')
    return sendRedirect(event, '/login?error=google')
  }
  return oauthHandler(event)
})
