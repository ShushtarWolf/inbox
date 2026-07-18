/** Safe Sentry diagnostics — never returns the DSN. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)

  const dsnSet = Boolean(process.env.SENTRY_DSN?.trim())
  const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
  const release = process.env.GIT_COMMIT_SHA || process.env.GITHUB_SHA || null

  return {
    ok: true,
    sentryEnabled: dsnSet,
    environment,
    release,
    note: dsnSet
      ? 'SENTRY_DSN is set — server + client plugins will init (client needs rebuild/restart to pick up public runtimeConfig)'
      : 'SENTRY_DSN unset — both plugins no-op; app runs normally',
  }
})
