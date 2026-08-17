/**
 * Rewrite paid SEP IPG rows from before toman×10 so Payment.amount is true toman
 * (bank rials ÷ 10). Future checkouts still send toman × 10 to SEP.
 *
 * POST /api/admin/payments/correct-pre-rial-ipg
 * Header: x-admin-secret
 * Body: { apply?: boolean }  — omit or false = dry run
 */
import { requireAdminSecret } from '../../../utils/adminAuth'
import { correctPreRialIpgPayments } from '../../../utils/payments/correctPreRialIpg'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{ apply?: boolean }>(event).catch(() => ({}))
  return correctPreRialIpgPayments({ apply: body?.apply === true })
})
