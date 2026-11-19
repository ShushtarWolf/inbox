import { runHistoricalCancelRefundRepair } from '../../../utils/historicalCancelRefundRepair'

/**
 * Prod-reachable historical cancel → wallet credit repair (app has internal DB).
 * Dry-run by default; `?apply=1` appends REFUND_CREDIT + RefundReconciliation.
 * Optional `?tracking=1541908` limits the summary match to one booking receipt code.
 * Optional `?reviewPaymentId=` / `?forcePaymentId=` (comma-separated, optional
 * `paymentId:bookingId`) promotes review-bucket rows after ops sign-off.
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const apply = query.apply === '1' || query.apply === 'true'
  const tracking = typeof query.tracking === 'string' ? query.tracking.trim() : ''
  const splitIds = (raw: unknown) => (typeof raw === 'string' ? raw : '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const forcePaymentIds = splitIds(query.forcePaymentId)
  const reviewPaymentIds = splitIds(query.reviewPaymentId)
  const repair = await runHistoricalCancelRefundRepair({
    apply,
    tracking: tracking || undefined,
    forcePaymentIds: forcePaymentIds.length ? forcePaymentIds : undefined,
    reviewPaymentIds: reviewPaymentIds.length ? reviewPaymentIds : undefined,
  })
  return { repair }
})
