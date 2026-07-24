import { confirmPaymentAndSync, markPaymentFailedAndSync } from '../../../utils/paymentSync'

function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return undefined
}

/**
 * Normalize SEP / test-gateway query+body fields.
 * SEP typically POSTs: ResNum, RefNum, State=OK|Canceled|…
 * Test gateway may send Authority/ResNum + Status/State.
 */
function readPaymentCallbackFields(
  query: Record<string, unknown>,
  body?: Record<string, unknown>,
) {
  const src = { ...query, ...(body || {}) }
  return {
    providerRef: pickString(src.ResNum, src.resNum, src.Authority, src.authority, src.ref),
    refNum: pickString(src.RefNum, src.refNum),
    statusRaw: String(src.State || src.state || src.Status || src.status || '').toUpperCase(),
  }
}

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
  if (statusRaw && statusRaw !== 'OK') {
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
