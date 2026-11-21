/**
 * IB-14 read-only inventory.
 *   node --import tsx scripts/repair/ib14-orphan-payment-dry-run.ts
 */
import { runHistoricalOrphanPaymentRepair } from '../../server/utils/historicalOrphanPayments.ts'

if (process.env.APPLY === 'yes') {
  console.error('[ib14-dry-run] APPLY is not supported. Use ib14-orphan-payment-apply.ts.')
  process.exit(1)
}

const report = await runHistoricalOrphanPaymentRepair({ apply: false })
console.log(JSON.stringify(report, null, 2))