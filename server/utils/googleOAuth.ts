import type { H3Event } from 'h3'

export type GoogleOAuthStatus = {
  clientId: string
  clientSecret: string
  redirectURL: string
  enabled: boolean
}

/**
 * Resolve Google OAuth config at request time so Liara runtime env works
 * even when build-time public.googleAuthEnabled was false.
 * Redirect: NUXT_OAUTH_GOOGLE_REDIRECT_URL, else `${NUXT_PUBLIC_SITE_URL}/auth/google`.
 */
export function getGoogleOAuthStatus(event?: H3Event): GoogleOAuthStatus {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  const clientId = String(config.oauth?.google?.clientId || '').trim()
  const clientSecret = String(config.oauth?.google?.clientSecret || '').trim()
  let redirectURL = String(config.oauth?.google?.redirectURL || '').trim().replace(/\/$/, '')

  if (!redirectURL) {
    const siteUrl = String(
      (config.public as { siteUrl?: string } | undefined)?.siteUrl
      || process.env.NUXT_PUBLIC_SITE_URL
      || '',
    ).trim().replace(/\/$/, '')
    if (siteUrl) redirectURL = `${siteUrl}/auth/google`
  }

  return {
    clientId,
    clientSecret,
    redirectURL,
    enabled: Boolean(clientId && clientSecret && redirectURL),
  }
}
