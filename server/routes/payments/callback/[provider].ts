import { confirmPaymentAndSync, markPaymentFailedAndSync } from '../../../utils/paymentSync'
import { isPaymentCallbackOk, readPaymentCallbackFields } from '#shared/paymentCallback.ts'

function redirectForPayment(
  payment: { purpose?: string | null; metadataJson?: string | null } | null | undefined,
  outcome: 'success' | 'cancelled' | 'error',
) {
  if (payment?.purpose === 'topup') {
    return `/athlete/wallet?payment=${outcome}`
  }
  if (payment?.metadataJson) {
    try {
      const meta = JSON.parse(payment.metadataJson) as { receiptToken?: string }
      if (meta.receiptToken) return `/r/${encodeURIComponent(meta.receiptToken)}?payment=${outcome}`
    } catch {
      // fall through
    }
  }
  return `/athlete/bookings?payment=${outcome}`
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

  const paymentRow = await prisma.payment.findFirst({
    where: {
      providerRef,
      provider,
    },
    select: { purpose: true, metadataJson: true },
  })

  // User cancelled / bank declined — never mark PAID.
  if (!isPaymentCallbackOk(statusRaw)) {
    try {
      await markPaymentFailedAndSync(providerRef, provider)
    } catch (err) {
      console.error('[payments:callback:fail]', provider, providerRef, err)
    }
    return sendRedirect(event, redirectForPayment(paymentRow, 'cancelled'))
  }

  try {
    await confirmPaymentAndSync(providerRef, provider, refNum ? { refNum } : undefined)
    return sendRedirect(event, redirectForPayment(paymentRow, 'success'))
  } catch (err) {
    console.error('[payments:callback:confirm]', provider, providerRef, err)
    try {
      await markPaymentFailedAndSync(providerRef, provider)
    } catch {
      // ignore secondary failure
    }
    return sendRedirect(event, redirectForPayment(paymentRow, 'error'))
  }
})
