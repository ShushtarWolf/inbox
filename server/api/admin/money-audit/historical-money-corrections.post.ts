import { runHistoricalCancelRefundRepair } from '../../../utils/historicalCancelRefundRepair'
import { runHistoricalOrphanPaymentRepair } from '../../../utils/historicalOrphanPayments'

/**
 * IB-13 / IB-14 historical money corrections.
 * Dry-run by default (`?apply=1` writes). Idempotent wallet credits only — never cash → wallet.
 * Logs each applied row in response JSON + server logs (RefundReconciliation).
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

  const cancelRefunds = await runHistoricalCancelRefundRepair({
    apply,
    tracking: tracking || undefined,
    forcePaymentIds: forcePaymentIds.length ? forcePaymentIds : undefined,
    reviewPaymentIds: reviewPaymentIds.length ? reviewPaymentIds : undefined,
  })

  const orphanPayments = await runHistoricalOrphanPaymentRepair({ apply })

  const appliedChanges = [
    ...(apply
      ? (cancelRefunds.credits || []).map((row) => ({
          kind: 'cancel_refund' as const,
          paymentId: row.paymentId,
          bookingId: row.bookingId,
          amount: row.amount,
          reason: row.reason,
        }))
      : []),
    ...orphanPayments.appliedRows.map((row) => ({
      kind: 'orphan_payment' as const,
      paymentId: row.paymentId,
      bookingId: row.bookingId,
      amount: row.amount,
      reason: row.reason,
    })),
  ]

  return {
    applied: apply,
    mode: apply ? 'apply' : 'dry-run',
    cancelRefunds,
    orphanPayments: {
      ...orphanPayments,
      proposedCredits: orphanPayments.rows.filter((row) => row.proposal === 'wallet_credit'),
    },
    appliedChanges,
    errors: [
      ...cancelRefunds.applyErrors.map((row) => ({ scope: 'cancel_refunds', ...row })),
      ...orphanPayments.applyErrors.map((row) => ({ scope: 'orphan_payments', ...row })),
    ],
  }
})