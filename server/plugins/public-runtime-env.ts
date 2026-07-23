/**
 * Sync server-only Liara env into public runtimeConfig at process start.
 * Nuxt only auto-overrides public keys from NUXT_PUBLIC_*; PAYMENTS_MODE and
 * PILOT_NO_COACH must still drive client Pay CTA / coach redirects without a rebuild.
 */
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()

  const paymentsMode = (process.env.NUXT_PUBLIC_PAYMENTS_MODE || process.env.PAYMENTS_MODE || '')
    .trim()
    .toLowerCase()
  if (paymentsMode === 'pay_at_club' || paymentsMode === 'test' || paymentsMode === 'live') {
    config.public.paymentsMode = paymentsMode
  }

  if (process.env.NUXT_PUBLIC_PILOT_NO_COACH === 'true' || process.env.PILOT_NO_COACH === 'true') {
    config.public.pilotNoCoach = true
  }
})
