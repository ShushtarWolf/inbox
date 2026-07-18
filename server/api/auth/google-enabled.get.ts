import { getGoogleOAuthStatus } from '../../utils/googleOAuth'

/** Public probe: is Google OAuth configured? Never returns secrets. */
export default defineEventHandler((event) => {
  return { enabled: getGoogleOAuthStatus(event).enabled }
})
