/**
 * IB-47 read-only inventory (no APPLY).
 *   node --import tsx scripts/repair/ib47-season-residual-dry-run.ts
 */
import { inventoryIb47SeasonResidualShortfall } from '../../server/utils/ib47SeasonResidualInventory.ts'

if (process.env.APPLY === 'yes') {
  console.error('[ib47-dry-run] APPLY is not supported. Use ib47-season-residual-shortfall-apply.ts.')
  process.exit(1)
}

const PAYMENT_ID = (process.env.PAYMENT_ID || '').trim() || undefined
const report = await inventoryIb47SeasonResidualShortfall({ paymentId: PAYMENT_ID })
console.log(JSON.stringify(report, null, 2))