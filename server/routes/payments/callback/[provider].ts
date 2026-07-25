import { confirmPaymentAndSync, markPaymentFailedAndSync } from '../../../utils/paymentSync'
import { isPaymentCallbackOk, readPaymentCallbackFields } from '#shared/paymentCallback.ts'

/**
 * IPG return URL (GET or POST).
 * SEP: ResNum + RefNum + State
 * Test gateway: Authority/ResNum + Status/State
 */
export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  const query = getQuery(event) as Record<string, unknown>
  let body: Record<string, unknown> | undefined
  if (event.method === 'POST' || event.method === 'PUT') {
    try {
      body = await readBody<Record<string, unknown>>(event)
    } catch {
      body = undefined
    }
  }

  const { providerRef, refNum, statusRaw } = readPaymentCallbackFields(query, body)

  if (!provider || !providerRef) {
    return sendRedirect(event, '/athlete/bookings?payment=error')
  }

  // User cancelled / bank declined — never mark PAID.
  if (!isPaymentCallbackOk(statusRaw)) {
    try {
      await markPaymentFailedAndSync(providerRef, provider)
    } catch (err) {
      console.error('[payments:callback:fail]', provider, providerRef, err)
    }
    return sendRedirect(event, '/athlete/bookings?payment=cancelled')
  }

  try {
    await confirmPaymentAndSync(providerRef, provider, refNum ? { refNum } : undefined)
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
