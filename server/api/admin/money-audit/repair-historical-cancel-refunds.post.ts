import { runHistoricalCancelRefundRepair } from '../../../utils/historicalCancelRefundRepair'

/**
 * Prod-reachable historical cancel → wallet credit repair (app has internal DB).
 * Dry-run by default; `?apply=1` appends REFUND_CREDIT + RefundReconciliation.
 * Optional `?tracking=1541908` limits the summary match to one booking receipt code.
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const apply = query.apply === '1' || query.apply === 'true'
  const tracking = typeof query.tracking === 'string' ? query.tracking.trim() : ''
  const repair = await runHistoricalCancelRefundRepair({
    apply,
    tracking: tracking || undefined,
  })
  return { repair }
})
