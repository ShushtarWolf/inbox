/**
 * Prefer NUXT_PUBLIC_PAYMENTS_MODE / NUXT_PUBLIC_PILOT_NO_COACH on Liara.
 * Nuxt freezes server runtimeConfig — mutating it crashes the process — so this
 * plugin only applies soft sync when the object is still writable (older Nitro).
 */
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const publicConfig = config.public as Record<string, unknown>

  const paymentsMode = (process.env.NUXT_PUBLIC_PAYMENTS_MODE || process.env.PAYMENTS_MODE || '')
    .trim()
    .toLowerCase()
  if (paymentsMode === 'pay_at_club' || paymentsMode === 'test' || paymentsMode === 'live') {
    try {
      publicConfig.paymentsMode = paymentsMode
    } catch {
      // Frozen runtimeConfig — set NUXT_PUBLIC_PAYMENTS_MODE instead.
    }
  }

  if (process.env.NUXT_PUBLIC_PILOT_NO_COACH === 'true' || process.env.PILOT_NO_COACH === 'true') {
    try {
      publicConfig.pilotNoCoach = true
    } catch {
      // Frozen runtimeConfig — set NUXT_PUBLIC_PILOT_NO_COACH instead.
    }
  }
})
