/**
 * IB-13 apply — only rows classified applyEligible by ib13ClassifiedInventory.
 * Never credits IB-47 canonical residuals or rows with active season sessions.
 *
 *   APPLY=yes node --import tsx scripts/repair/ib13-cancel-refund-apply.ts
 */
import { inventoryIb13Classified } from '../../server/utils/ib13ClassifiedInventory.ts'
import { applyHistoricalCancelCredit } from '../../server/utils/historicalCancelRefundRepair.ts'
import { historicalRefundIdempotencyKey } from '#shared/historicalRefundRepair.ts'

const APPLY = process.env.APPLY === 'yes'
const inventory = await inventoryIb13Classified()
const eligible = inventory.rows.filter((row) => row.applyEligible)

const dryRunLines = eligible.map((row) => ({
  paymentId: row.paymentId,
  bookingId: row.bookingId,
  class: row.ib13Class,
  proposedWalletCredit: row.proposedWalletCredit,
  repairKey: row.repairIdempotencyKey,
}))

const applied: Array<{ paymentId: string, bookingId: string | null, amount: number, ok: boolean }> = []

if (APPLY) {
  for (const row of eligible) {
    const fresh = await inventoryIb13Classified({ paymentId: row.paymentId })
    const still = fresh.rows.find((r) => r.paymentId === row.paymentId && r.bookingId === row.bookingId)
    if (!still?.applyEligible || still.proposedWalletCredit !== row.proposedWalletCredit) {
      applied.push({ paymentId: row.paymentId, bookingId: row.bookingId, amount: 0, ok: false })
      continue
    }
    const ok = await applyHistoricalCancelCredit({
      paymentId: row.paymentId,
      bookingId: row.bookingId,
      decision: {
        action: 'credit',
        amount: row.proposedWalletCredit,
        reason: row.ib13Class === 'refundable_now' ? 'wallet_path_shortfall' : 'wallet_spend_shortfall',
      },
      bucket: 'credit',
    }, { trustDecision: true })
    applied.push({
      paymentId: row.paymentId,
      bookingId: row.bookingId,
      amount: row.proposedWalletCredit,
      ok,
    })
    console.info('[ib13-apply]', JSON.stringify({
      paymentId: row.paymentId,
      bookingId: row.bookingId,
      amount: row.proposedWalletCredit,
      key: historicalRefundIdempotencyKey(row.paymentId, row.bookingId),
    }))
  }
}

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  applyEligibleCount: eligible.length,
  applyEligibleToman: eligible.reduce((s, r) => s + r.proposedWalletCredit, 0),
  dryRunLines,
  applied,
}, null, 2))