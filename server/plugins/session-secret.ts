const DEMO_SESSION_FALLBACK = 'inbox-demo-session-password-change-me'
const PUBLIC_PLACEHOLDER = 'change-me-to-a-long-random-string-at-least-32-chars'

export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV !== 'production') return

  const secret = process.env.NUXT_SESSION_PASSWORD
  if (!secret || secret.length < 32 || secret === DEMO_SESSION_FALLBACK || secret === PUBLIC_PLACEHOLDER) {
    throw new Error(
      'NUXT_SESSION_PASSWORD must be set in production (use a unique high-entropy secret, not a documented placeholder).',
    )
  }
})
