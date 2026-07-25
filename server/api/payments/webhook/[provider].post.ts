import { getPaymentService } from '../../../utils/payments/service'
import { confirmPaymentAndSync } from '../../../utils/paymentSync'

export default defineEventHandler(async (event) => {
  const providerName = getRouterParam(event, 'provider')
  const body = await readBody<{ providerRef?: string; status?: string }>(event)
  if (!providerName || !body.providerRef) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  const service = getPaymentService(providerName)
  if (service.verifyWebhook && !service.verifyWebhook(body)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid webhook signature' })
  }

  if (body.status !== 'paid') {
    return { ok: true, skipped: true }
  }

  // Same path as browser callback — idempotent confirm + parent sync + paid notify.
  const intent = await confirmPaymentAndSync(body.providerRef, providerName)
  return { ok: true, paymentId: intent.id, status: intent.status }
})
