import { confirmPaymentAndSync, markPaymentFailedAndSync } from '../../../utils/paymentSync'

/**
 * IPG return URL.
 * Zarinpal sends ?Authority=…&Status=OK|NOK
 * Test gateway / log provider may send ?ref=…
 */
export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  const query = getQuery(event)
  const providerRef = (
    query.Authority
    || query.authority
    || query.ref
  ) as string | undefined
  const statusRaw = String(query.Status || query.status || '').toUpperCase()

  if (!provider || !providerRef) {
    return sendRedirect(event, '/athlete/bookings?payment=error')
  }

  // User cancelled / bank declined — never mark PAID.
  if (statusRaw && statusRaw !== 'OK') {
    try {
      await markPaymentFailedAndSync(providerRef, provider)
    } catch (err) {
      console.error('[payments:callback:fail]', provider, providerRef, err)
    }
    return sendRedirect(event, '/athlete/bookings?payment=cancelled')
  }

  try {
    await confirmPaymentAndSync(providerRef, provider)
    return sendRedirect(event, '/athlete/bookings?payment=success')
  } catch (err) {
    console.error('[payments:callback:confirm]', provider, providerRef, err)
    try {
      await markPaymentFailedAndSync(providerRef, provider)
    } catch {
      // ignore secondary failure
    }
    return sendRedirect(event, '/athlete/bookings?payment=error')
  }
})
