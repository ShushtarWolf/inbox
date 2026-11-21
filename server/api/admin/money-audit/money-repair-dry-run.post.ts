import { runMoneyRepairDryRun } from '../../../utils/moneyRepairDryRun.ts'

/**
 * IB-13 / IB-14 / IB-47 unified dry-run (read-only). No query param writes.
 * Prod: curl with x-admin-secret (same as historical-money-corrections).
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  if (query.apply === '1' || query.apply === 'true') {
    throw createError({ statusCode: 400, statusMessage: 'apply_not_allowed_on_dry_run_endpoint' })
  }
  const paymentId = typeof query.paymentId === 'string' ? query.paymentId.trim() : undefined
  return runMoneyRepairDryRun({ paymentId: paymentId || undefined })
})