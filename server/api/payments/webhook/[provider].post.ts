import { getPaymentService } from '../../../utils/payments/service'
import { confirmPaymentAndSync } from '../../../utils/paymentSync'
import { enforceRateLimit } from '../../../utils/rateLimit'
import { requirePaymentWebhookSecret } from '../../../utils/webhookAuth'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'payments:webhook')
  requirePaymentWebhookSecret(event)

  const providerName = getRouterParam(event, 'provider')
  const body = await readBody<{ providerRef?: string; status?: string; refNum?: string }>(event)
  if (!providerName || !body.providerRef) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  // Desk / unsigned providers must not accept remote confirm via this route.
  // verifyWebhook is mandatory — missing or false → reject.
  const service = getPaymentService(providerName)
  if (!service.verifyWebhook?.(body)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid webhook signature' })
  }

  if (body.status !== 'paid') {
    return { ok: true, skipped: true }
  }

  const refNum = typeof body.refNum === 'string' ? body.refNum.trim() : undefined
  const intent = await confirmPaymentAndSync(
    body.providerRef,
    providerName,
    refNum ? { refNum } : undefined,
  )
  return { ok: true, paymentId: intent.id, status: intent.status }
})
