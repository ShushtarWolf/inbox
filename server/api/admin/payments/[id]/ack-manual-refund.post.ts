import { acknowledgeManualBankRefund } from '../../../../utils/manualBankRefund'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Payment id required' })
  }
  const body = await readBody<{ note?: string; guestSheba?: string | null }>(event).catch(() => ({}))
  return acknowledgeManualBankRefund({
    paymentId: id,
    note: typeof body?.note === 'string' ? body.note : undefined,
    guestSheba: body?.guestSheba ?? null,
  })
})
