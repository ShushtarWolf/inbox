import * as Sentry from '@sentry/node'

export default defineNitroPlugin((nitroApp) => {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.GIT_COMMIT_SHA || process.env.GITHUB_SHA,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
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
