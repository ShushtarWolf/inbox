import * as Sentry from '@sentry/node'
import { scrubSentryEvent } from '#shared/sentryScrub.ts'

export default defineNitroPlugin((nitroApp) => {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return

  const isProd = process.env.NODE_ENV === 'production'
  const release = process.env.GIT_COMMIT_SHA || process.env.GITHUB_SHA || undefined

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release,
    sendDefaultPii: false,
    // Errors: keep full capture; traces stay light in prod.
    tracesSampleRate: isProd ? 0.1 : 0,
    beforeSend(event) {
      return scrubSentryEvent(event)
    },
  })

  nitroApp.hooks.hook('error', (error, { event }) => {
    Sentry.withScope((scope) => {
      if (event?.path) scope.setTag('path', event.path)
      if (event?.method) scope.setTag('method', event.method)
      Sentry.captureException(error)
    })
  })

  nitroApp.hooks.hook('close', async () => {
    await Sentry.close(2000)
  })
})
