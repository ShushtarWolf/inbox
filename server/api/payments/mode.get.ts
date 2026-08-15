import { isOnlinePaymentsEnabled } from '#shared/bookingPayment.ts'
import { getPaymentsMode } from '#shared/payments.ts'

/** Public payments mode for client CTAs — no secrets, no terminal id. */
export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const mode = getPaymentsMode()
  return {
    mode,
    onlineCheckoutEnabled: isOnlinePaymentsEnabled(),
  }
})
