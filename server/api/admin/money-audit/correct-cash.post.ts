import { correctOpenCashSettlements } from '../../../utils/correctCashSettlements'
import { runMoneyAuditAndAlert } from '../../../utils/moneyAudit'

/**
 * Prod-reachable cash settlement correction (app has internal DB).
 * Dry-run by default; `?apply=1` writes append-only clawbacks.
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const apply = query.apply === '1' || query.apply === 'true'
  const correction = await correctOpenCashSettlements({ apply })
  const audit = await runMoneyAuditAndAlert({ notify: false })
  return { correction, audit }
})
