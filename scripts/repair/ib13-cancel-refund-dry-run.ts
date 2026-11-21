/**
 * IB-13 read-only inventory (no APPLY path).
 *   node --import tsx scripts/repair/ib13-cancel-refund-dry-run.ts
 */
import { inventoryIb13Classified } from '../../server/utils/ib13ClassifiedInventory.ts'
import { runMoneyRepairDryRun } from '../../server/utils/moneyRepairDryRun.ts'

if (process.env.APPLY === 'yes') {
  console.error('[ib13-dry-run] APPLY is not supported. Use ib13-cancel-refund-apply.ts after review.')
  process.exit(1)
}

const PAYMENT_ID = (process.env.PAYMENT_ID || '').trim()
const report = PAYMENT_ID
  ? await inventoryIb13Classified({ paymentId: PAYMENT_ID })
  : (await runMoneyRepairDryRun()).ib13

console.log(JSON.stringify(report, null, 2))