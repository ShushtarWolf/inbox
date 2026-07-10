export default defineNitroPlugin((nitroApp) => {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  nitroApp.hooks.hook('error', (error) => {
    console.error('[sentry-hook]', error.message)
  })
})
