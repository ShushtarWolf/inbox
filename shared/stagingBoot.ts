/**
 * Production vs staging boot guards (start-production.mjs, staging-only auth).
 * Liara production `inbox` must never auto-seed or expose instant phone login.
 */
export function isStagingLiaraEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.SENTRY_ENVIRONMENT === 'staging'
    || env.LIARA_APP_NAME === 'inbox-staging'
    || env.INBOX_ENV === 'staging'
  )
}

/** Instant phone login (no OTP) — staging Liara only. */
export function stagingPhoneLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isStagingLiaraEnvironment(env)
}

export function allowSeedOnEmpty(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SEED_ON_EMPTY !== 'true') return false
  if (isStagingLiaraEnvironment(env)) return true
  if (env.NODE_ENV === 'production') return false
  return true
}