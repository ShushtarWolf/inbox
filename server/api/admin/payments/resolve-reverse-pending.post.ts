import { resolvePendingSepReverse } from '../../../utils/refunds'

/**
 * Retry SEP ReverseTransaction for payments stuck in reversePending after timeout.
 * Body: { paymentId: string } or { paymentIds: string[] }
 */
export default defineEventHandler(async (event) => {
  await requireAdminSecret(event)
  const body = await readBody<{ paymentId?: string; paymentIds?: string[] }>(event)
  const ids = [
    ...(body.paymentId ? [body.paymentId] : []),
    ...(Array.isArray(body.paymentIds) ? body.paymentIds : []),
  ].filter(Boolean)
  if (!ids.length) {
    throw createError({ statusCode: 400, statusMessage: 'paymentId required' })
  }

  const results = []
  for (const paymentId of ids) {
    results.push({ paymentId, ...(await resolvePendingSepReverse(paymentId)) })
  }
  return { ok: true, results }
})
