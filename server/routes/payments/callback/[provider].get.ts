import { confirmPaymentAndSync } from '../../utils/paymentSync'

export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  const query = getQuery(event)
  const providerRef = query.ref as string | undefined
  if (!provider || !providerRef) {
    return sendRedirect(event, '/athlete/bookings?payment=error')
  }

  try {
    await confirmPaymentAndSync(providerRef, provider)
    return sendRedirect(event, '/athlete/bookings?payment=success')
  } catch {
    return sendRedirect(event, '/athlete/bookings?payment=error')
  }
})
