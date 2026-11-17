/**
 * Fair-share replay for cancelled series sessions vs ledger REFUND_CREDIT sum.
 * Used by Phase-F reviewed ADJUSTMENT (never silent; never auto from repair).
 */
import { cancelWalletCreditAmount } from './owedCancelRefund.ts'

export type SeriesOverCreditInput = {
  primaryAmount: number
  sessionPrice?: number | null
  /** Total sessions in the paid group (primary + siblings). */
  totalSessions: number
  /** Cancelled bookings in cancel-time order (oldest first). */
  cancelledCount: number
  /** Sum of REFUND_CREDIT on the primary payment. */
  creditedTotal: number
  refundBps?: number | null
  metadata?: Record<string, unknown> | string | null
}

export type SeriesOverCreditResult = {
  fairOwed: number
  over: number
  sessionCredits: number[]
}

/** Replay sequential fair-share credits for N cancelled sessions. */
export function computeSeriesCancelOverCredit(input: SeriesOverCreditInput): SeriesOverCreditResult {
  const primary = Math.max(0, Math.floor(Number(input.primaryAmount) || 0))
  const total = Math.max(1, Math.floor(Number(input.totalSessions) || 1))
  const cancelled = Math.max(0, Math.min(total, Math.floor(Number(input.cancelledCount) || 0)))
  const credited = Math.max(0, Math.floor(Number(input.creditedTotal) || 0))

  let already = 0
  let remaining = total
  const sessionCredits: number[] = []
  for (let i = 0; i < cancelled; i += 1) {
    const owed = cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: primary,
      primaryAmount: primary,
      sessionPrice: input.sessionPrice,
      alreadyRefundedOnPrimary: already,
      remainingSessionsIncludingCancelled: remaining,
      treatAsSeries: true,
      refundBps: input.refundBps,
      metadata: input.metadata,
    }).amount
    sessionCredits.push(owed)
    already += owed
    remaining = Math.max(1, remaining - 1)
  }

  const fairOwed = already
  return {
    fairOwed,
    over: Math.max(0, credited - fairOwed),
    sessionCredits,
  }
}

export function seriesOverCreditNote(paymentId: string): string {
  return `recon:series-over-credit:${paymentId}`
}
