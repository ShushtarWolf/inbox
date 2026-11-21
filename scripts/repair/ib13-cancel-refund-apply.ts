/**
 * IB-13 — apply wallet credits only for rows the app classifies as credit (idempotent).
 * Uses the same REFUND_CREDIT + RefundReconciliation path as live repairs.
 *
 * Dry-run (default) mirrors production API dry-run buckets:
 *   node --import tsx scripts/repair/ib13-cancel-refund-apply.ts
 *
 * Apply after reviewing scripts/sql/ib13-cancel-refund-classify-dry-run.sql:
 *   APPLY=yes node --import tsx scripts/repair/ib13-cancel-refund-apply.ts
 *
 * Never credits desk CASH. Does not force reviewPaymentId — use historical-money-corrections API for reviewed rows.
 */
import { runHistoricalCancelRefundRepair } from '../../server/utils/historicalCancelRefundRepair.ts'

const APPLY = process.env.APPLY === 'yes'
const TRACKING = (process.env.TRACKING || '').trim()

const report = await runHistoricalCancelRefundRepair({
  apply: APPLY,
  tracking: TRACKING || undefined,
})

const creditLines = report.credits || []
const onlyClearRefundable = creditLines.filter((row) =>
  row.reason === 'wallet_path_shortfall'
  || row.reason === 'wallet_spend_shortfall'
  || row.reason === 'split_wallet_rail_after_card_reverse',
)

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  buckets: report.buckets,
  counts: report.counts,
  creditCount: report.creditCount,
  creditToman: report.creditToman,
  appliedCount: report.appliedCount,
  refundableNowSample: onlyClearRefundable.slice(0, 50),
  reviewSample: report.samples?.review?.slice(0, 30) ?? [],
  seriesGaps: report.seriesGaps?.slice(0, 30) ?? [],
  applyErrors: report.applyErrors,
}, null, 2))