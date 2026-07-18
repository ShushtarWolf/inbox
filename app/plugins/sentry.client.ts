import * as Sentry from '@sentry/vue'
import { scrubSentryEvent } from '#shared/sentryScrub.ts'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const dsn = String(config.public.sentryDsn || '').trim()
  if (!dsn) return

  const release = String(config.public.sentryRelease || '').trim() || undefined

  Sentry.init({
    app: nuxtApp.vueApp,
    dsn,
    environment: config.public.sentryEnvironment || 'development',
    release,
    sendDefaultPii: false,
    // Browser traces are noisier — keep prod sampling low.
    tracesSampleRate: import.meta.env.PROD ? 0.05 : 0,
    beforeSend(event) {
      return scrubSentryEvent(event)
    },
  })

  return {
    provide: {
      /** Ops helper: capture a tagged client test event (DSN is already public in the browser). */
      sentryCaptureTest() {
        return Sentry.captureException(new Error('inbox sentry test (client)'), {
          tags: { source: 'admin-sentry-test', side: 'client' },
        })
      },
    },
  }
})
