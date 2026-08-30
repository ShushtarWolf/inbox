import { isOnlinePaymentsEnabled } from '#shared/bookingPayment.ts'

/** Athlete self-serve (court / coach / package / competition) needs gateway or wallet. */
export function requireOnlinePaymentsForAthlete() {
  if (!isOnlinePaymentsEnabled()) {
    throw createError({ statusCode: 503, statusMessage: 'ONLINE_PAYMENTS_REQUIRED' })
  }
}
