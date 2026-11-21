/**
 * IB-14 — detached payments after cancel/re-book; wallet credit only when ledger shows debit.
 *
 *   node --import tsx scripts/repair/ib14-orphan-payment-apply.ts
 *   APPLY=yes node --import tsx scripts/repair/ib14-orphan-payment-apply.ts
 */
import { runHistoricalOrphanPaymentRepair } from '../../server/utils/historicalOrphanPayments.ts'

if (process.env.APPLY !== 'yes') {
  console.error('[ib14-apply] Use scripts/repair/ib14-orphan-payment-dry-run.ts for dry-run.')
  process.exit(1)
}

const report = await runHistoricalOrphanPaymentRepair({ apply: true })

const proposed = report.rows.filter((row) => row.proposal === 'wallet_credit' && row.creditAmount > 0)

console.log(JSON.stringify({
  mode: 'apply',
  creditCount: report.creditCount,
  creditToman: report.creditToman,
  proposedCredits: proposed,
  skipped: report.rows.filter((row) => row.proposal !== 'wallet_credit').map((row) => ({
    paymentId: row.paymentId,
    proposal: row.proposal,
    reason: row.reason,
    amount: row.amount,
  })),
  appliedRows: report.appliedRows,
  applyErrors: report.applyErrors,
}, null, 2))