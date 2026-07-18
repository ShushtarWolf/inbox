/** Public probe: is Google OAuth configured? Never returns secrets. */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const clientId = config.oauth?.google?.clientId
  const clientSecret = config.oauth?.google?.clientSecret
  const redirectURL = config.oauth?.google?.redirectURL
  return {
    enabled: Boolean(clientId && clientSecret && redirectURL),
  }
})
