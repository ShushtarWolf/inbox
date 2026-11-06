import { correctZeroPastCommission } from '../../../utils/correctZeroPastCommission'
import { runMoneyAuditAndAlert } from '../../../utils/moneyAudit'

/**
 * Refund prior platform commission on open club settlements.
 * Dry-run by default; `?apply=1` writes ledger zero + wallet ADJUSTMENT.
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const apply = query.apply === '1' || query.apply === 'true'
  const correction = await correctZeroPastCommission({ apply })
  const audit = await runMoneyAuditAndAlert({ notify: false })
  return { correction, audit }
})
