/**
 * IB-13 / IB-14 — historical money corrections (local DB runner).
 *
 *   node --import tsx scripts/historical-money-corrections.ts
 *   APPLY=yes node --import tsx scripts/historical-money-corrections.ts
 *
 * Default dry-run. APPLY requires explicit env (same as repair-historical-cancel-refunds).
 * Never credits desk CASH to athlete wallet.
 */
import { runHistoricalCancelRefundRepair } from '../server/utils/historicalCancelRefundRepair.ts'
import { runHistoricalOrphanPaymentRepair } from '../server/utils/historicalOrphanPayments.ts'

const APPLY = process.env.APPLY === 'yes'
const TRACKING = (process.env.TRACKING || '').trim()

const cancelRefunds = await runHistoricalCancelRefundRepair({
  apply: APPLY,
  tracking: TRACKING || undefined,
})

const orphanPayments = await runHistoricalOrphanPaymentRepair({ apply: APPLY })

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  cancelRefunds: {
    creditCount: cancelRefunds.creditCount,
    creditToman: cancelRefunds.creditToman,
    appliedCount: cancelRefunds.appliedCount,
    buckets: cancelRefunds.buckets,
    counts: cancelRefunds.counts,
  },
  orphanPayments: {
    creditCount: orphanPayments.creditCount,
    creditToman: orphanPayments.creditToman,
    rows: orphanPayments.rows,
    appliedRows: orphanPayments.appliedRows,
    applyErrors: orphanPayments.applyErrors,
  },
}, null, 2))