import type { HistoricalRefundDecision } from './historicalRefundRepair.ts'

/** Phase-3 dry-run inventory buckets (no apply). */
export type HistoricalRefundBucket = 'credit' | 'skip' | 'review' | 'series_gap'

export type HistoricalRefundBucketInput = {
  decision: HistoricalRefundDecision
  method: string | null | undefined
  paymentAmount: number
  bookingStatus?: string | null
  metadata: Record<string, unknown>
  /** Owed wallet credit from cancelWalletCreditAmount (toman). */
  owedAmount?: number | null
  /** Sum of REFUND_CREDIT on the credit target payment (primary for series). */
  creditedAmount?: number
  walletDebitAbs?: number
  /** Primary payment still PAID while a sibling session was cancelled. */
  primaryPaymentStatus?: string | null
  isSeriesSiblingRow?: boolean
}

const SKIP_REASONS = new Set([
  'cash_club_responsibility',
  'already_credited',
  'already_reconciled',
  'not_cancelled',
  'card_already_reversed',
])

function reviewFromUnresolved(reason: string): boolean {
  return reason === 'bank_outcome_unknown'
    || reason === 'bank_outcome_pending'
    || reason === 'no_verified_account'
    || reason === 'owed_amount_unknown'
}

/** IPG row flagged gateway reverse with no wallet debit — ops must confirm card outcome. */
export function ipgNeedsOpsReview(input: HistoricalRefundBucketInput): boolean {
  if (input.method !== 'IPG') return false
  const debited = Math.max(0, Math.floor(Number(input.walletDebitAbs) || 0))
  if (debited > 0) return false
  const meta = input.metadata
  if (meta.gatewayReversed === true || meta.gatewayRefund === true) return true
  if (meta.reversePending === true) return true
  if (meta.refundChannel === 'gateway_reverse') return true
  return false
}

export function isSeriesSiblingCancelRow(input: {
  paymentAmount: number
  bookingStatus?: string | null
  metadata: Record<string, unknown>
}): boolean {
  if (input.bookingStatus !== 'CANCELLED') return false
  const meta = input.metadata
  const seriesMarker = typeof meta.seasonBookingId === 'string'
    || typeof meta.coveredByBookingId === 'string'
    || typeof meta.groupPrimaryBookingId === 'string'
    || Array.isArray(meta.groupSiblingBookingIds)
  return seriesMarker && Math.floor(Number(input.paymentAmount) || 0) === 0
}

export function classifyHistoricalRefundBucket(input: HistoricalRefundBucketInput): HistoricalRefundBucket {
  const { decision } = input

  if (decision.action === 'skip' && SKIP_REASONS.has(decision.reason)) {
    if (decision.reason === 'card_already_reversed' && ipgNeedsOpsReview(input)) {
      return 'review'
    }
    return 'skip'
  }

  const owed = Math.max(0, Math.floor(Number(input.owedAmount) || 0))
  const credited = Math.max(0, Math.floor(Number(input.creditedAmount) || 0))
  const shortfall = owed > 0 ? Math.max(0, owed - credited) : 0

  const seriesSibling = input.isSeriesSiblingRow === true
    || isSeriesSiblingCancelRow({
      paymentAmount: input.paymentAmount,
      bookingStatus: input.bookingStatus,
      metadata: input.metadata,
    })

  if (
    seriesSibling
    && shortfall > 0
    && (input.primaryPaymentStatus === 'PAID' || input.primaryPaymentStatus === 'PARTIALLY_REFUNDED')
  ) {
    return 'series_gap'
  }

  if (decision.action === 'unresolved' && reviewFromUnresolved(decision.reason)) {
    return 'review'
  }
  if (ipgNeedsOpsReview(input) && decision.action !== 'credit') {
    return 'review'
  }

  if (decision.action === 'credit') return 'credit'

  return 'skip'
}