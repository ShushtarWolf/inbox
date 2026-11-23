/**
 * Production vs staging boot guards (start-production.mjs).
 * Liara production `inbox` must never auto-seed; staging may when explicitly allowed.
 */
export function allowSeedOnEmpty(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SEED_ON_EMPTY !== 'true') return false
  if (env.SENTRY_ENVIRONMENT === 'staging') return true
  if (env.LIARA_APP_NAME === 'inbox-staging') return true
  if (env.INBOX_ENV === 'staging') return true
  if (env.NODE_ENV === 'production') return false
  return true
}