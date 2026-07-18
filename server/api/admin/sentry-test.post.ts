import * as Sentry from '@sentry/node'

/**
 * Capture a tagged test exception. Requires x-admin-secret.
 * Safe when DSN is unset (reports no-op; does not throw).
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)

  const dsnSet = Boolean(process.env.SENTRY_DSN?.trim())
  if (!dsnSet) {
    return {
      ok: true,
      sentryEnabled: false,
      eventId: null,
      note: 'SENTRY_DSN unset — no event sent (Sentry is a no-op)',
    }
  }

  const testError = new Error('inbox sentry test (server)')
  testError.name = 'SentryTestError'

  const eventId = Sentry.captureException(testError, {
    tags: { source: 'admin-sentry-test', side: 'server' },
  })
  await Sentry.flush(2000)

  return {
    ok: true,
    sentryEnabled: true,
    eventId,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    note: 'Test exception captured — check Sentry → Issues within ~1 minute',
  }
})
