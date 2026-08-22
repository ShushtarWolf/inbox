import { confirmPaymentAndSync, markPaymentFailedAndSync } from '../../../utils/paymentSync'
import { isPaymentCallbackOk, readPaymentCallbackFields } from '#shared/paymentCallback.ts'

/** Only bank/IPG providers may confirm via the public browser return URL. */
const PUBLIC_CALLBACK_PROVIDERS = new Set(['sep'])

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
 * Test gateway: ResNum + State=OK|NOK
 *
 * Desk providers (pay_at_club, log) must NEVER confirm here — owner mark-paid only.
 */
export default defineEventHandler(async (event) => {
  const providerParam = getRouterParam(event, 'provider')
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

  if (!providerParam || !providerRef) {
    return sendRedirect(event, '/athlete/bookings?payment=error')
  }

  if (!PUBLIC_CALLBACK_PROVIDERS.has(providerParam)) {
    console.warn('[payments:callback] rejected non-IPG provider', providerParam)
    return sendRedirect(event, '/athlete/bookings?payment=error')
  }

  // Trust DB provider binding — never confirm as a different adapter than the row's provider.
  const paymentRow = await prisma.payment.findFirst({
    where: { providerRef },
    select: {
      id: true,
      provider: true,
      purpose: true,
      metadataJson: true,
      status: true,
    },
  })

  if (!paymentRow || paymentRow.provider !== providerParam) {
    return sendRedirect(event, '/athlete/bookings?payment=error')
  }

  // User cancelled / bank declined — never mark PAID.
  if (!isPaymentCallbackOk(statusRaw)) {
    try {
      await markPaymentFailedAndSync(providerRef, paymentRow.provider)
    } catch (err) {
      console.error('[payments:callback:fail]', paymentRow.provider, providerRef, err)
    }
    return sendRedirect(event, redirectForPayment(paymentRow, 'cancelled'))
  }

  try {
    await confirmPaymentAndSync(
      providerRef,
      paymentRow.provider,
      refNum ? { refNum } : undefined,
    )
    return sendRedirect(event, redirectForPayment(paymentRow, 'success'))
  } catch (err) {
    console.error('[payments:callback:confirm]', paymentRow.provider, providerRef, err)
    try {
      await markPaymentFailedAndSync(providerRef, paymentRow.provider)
    } catch {
      // ignore secondary failure
    }
    return sendRedirect(event, redirectForPayment(paymentRow, 'error'))
  }
})
