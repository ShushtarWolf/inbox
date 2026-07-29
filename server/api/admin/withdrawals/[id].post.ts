import { requireAdminSecret } from '../../utils/adminAuth'
import { markWithdrawPaid, rejectWithdrawRequest } from '../../utils/settlement'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const body = await readBody<{ action?: 'paid' | 'reject'; note?: string }>(event)
  const action = body.action || 'paid'

  if (action === 'reject') {
    const request = await rejectWithdrawRequest(id, body.note)
    return { ok: true, request }
  }

  const request = await markWithdrawPaid(id, body.note)
  return { ok: true, request }
})
