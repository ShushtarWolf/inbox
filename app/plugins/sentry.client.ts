import * as Sentry from '@sentry/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const dsn = config.public.sentryDsn
  if (!dsn) return

  Sentry.init({
    app: nuxtApp.vueApp,
    dsn,
    environment: config.public.sentryEnvironment,
    release: config.public.sentryRelease,
    tracesSampleRate: import.meta.env.PROD ? 0.05 : 0,
  })
})
