import { getPaymentService } from '../../../utils/payments/service'
import { syncPaymentToParent } from '../../../utils/paymentSync'

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

  const intent = await service.confirm(body.providerRef)
  await syncPaymentToParent(intent.id)

  return { ok: true, paymentId: intent.id }
})
