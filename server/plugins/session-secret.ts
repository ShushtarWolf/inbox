const DEMO_SESSION_FALLBACK = 'inbox-demo-session-password-change-me'

export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV !== 'production') return

  const secret = process.env.NUXT_SESSION_PASSWORD
  if (!secret || secret.length < 32 || secret === DEMO_SESSION_FALLBACK) {
    throw new Error(
      'NUXT_SESSION_PASSWORD must be set in production (at least 32 characters, not the demo fallback).',
    )
  }
})
