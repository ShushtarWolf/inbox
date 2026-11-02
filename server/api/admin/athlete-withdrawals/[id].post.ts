import { markUserWithdrawPaid, rejectUserWithdrawRequest } from '../../../utils/walletWithdraw'
import { requireAdminSecret } from '../../../utils/adminAuth'
import { requireAdminPayoutConfirm } from '../../../utils/adminPayoutConfirm'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const body = await readBody<{ action?: 'paid' | 'reject'; note?: string; confirmPayout?: boolean }>(event)
  if (body.action === 'reject') {
    const request = await rejectUserWithdrawRequest(id, body.note)
    return { request }
  }
  if (body.action !== 'paid') {
    throw createError({ statusCode: 400, statusMessage: 'action must be paid or reject' })
  }

  requireAdminPayoutConfirm(event, body)
  const request = await markUserWithdrawPaid(id, body.note)
  return { request }
})
