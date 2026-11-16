import { refundAmountFromBps } from './cancelPolicy.ts'

/**
 * Dry-run decision for a historical cancel that may be missing an athlete wallet credit.
 * Does not invent a bank outcome from missing metadata. Desk cash stays club-side.
 * A real wallet debit (PAYMENT_DEBIT / IPG_BOOKING_DEBIT) proves the closed-loop path even
 * when stale gateway reverse flags remain on the Payment row.
 */
export const HISTORICAL_REFUND_NOTE_PREFIX = 'recon:historical-cancel:'

export function historicalRefundIdempotencyKey(paymentId: string): string {
  return `${HISTORICAL_REFUND_NOTE_PREFIX}${paymentId}`
}

export type HistoricalRefundDecision =
  | { action: 'credit'; amount: number; reason: 'wallet_path_shortfall' | 'wallet_spend_shortfall' | 'split_wallet_rail_after_card_reverse' }
  | { action: 'skip'; reason: 'cash_club_responsibility' | 'already_credited' | 'already_reconciled' | 'not_cancelled' | 'card_already_reversed' }
  | { action: 'unresolved'; reason: 'bank_outcome_unknown' | 'bank_outcome_pending' | 'no_verified_account' | 'owed_amount_unknown' }

export type HistoricalRefundInput = {
  method: string | null | undefined
  bookingPaymentMethod?: string | null
  paymentStatus: string | null | undefined
  bookingStatus?: string | null
  amount: number
  userId?: string | null
  metadata: Record<string, unknown>
  /** Sum of existing REFUND_CREDIT rows for this payment, any booking id. */
  refundCreditSum: number
  /** Absolute toman taken from the athlete wallet (PAYMENT_DEBIT / IPG_BOOKING_DEBIT). */
  walletDebitAbs?: number
  /** Wallet owner who was actually debited (preferred credit target). */
  debitedWalletUserId?: string | null
  /** True when the stable reconciliation note/key already exists. */
  alreadyReconciled?: boolean
}

function metaNumber(meta: Record<string, unknown>, key: string): number | null {
  const n = Number(meta[key])
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

function isCash(input: HistoricalRefundInput): boolean {
  return input.method === 'CASH' || input.bookingPaymentMethod === 'CASH'
}

function cancelled(input: HistoricalRefundInput): boolean {
  const pay = input.paymentStatus
  return pay === 'REFUNDED'
    || pay === 'FAILED'
    || pay === 'SUPERSEDED'
    || input.bookingStatus === 'CANCELLED'
}

function cardReversed(meta: Record<string, unknown>): boolean {
  return meta.gatewayReversed === true || meta.gatewayRefund === true
}

function bankPending(meta: Record<string, unknown>): boolean {
  return meta.reversePending === true && meta.gatewayReversed !== true && meta.gatewayRefund !== true
}

function debitAbs(input: HistoricalRefundInput): number {
  return Math.max(0, Math.floor(Number(input.walletDebitAbs) || 0))
}

function creditUserId(input: HistoricalRefundInput): string | null {
  return input.debitedWalletUserId || input.userId || null
}

/**
 * Positive evidence the card was not returned, so a wallet credit is the intended refund.
 * Missing flags are not evidence. A ledger wallet debit is evidence.
 */
function walletPathProven(input: HistoricalRefundInput): boolean {
  if (debitAbs(input) > 0) return true
  if (input.method === 'PAID') return true
  const meta = input.metadata
  if (cardReversed(meta) || bankPending(meta)) return false
  if (meta.refundChannel === 'wallet_closed_loop') return true
  if (typeof meta.reverseFailedAt === 'string' && meta.reverseFailedAt.trim()) return true
  return false
}

function owedAmount(input: HistoricalRefundInput): number | null {
  const meta = input.metadata
  const cap = Math.max(0, Math.floor(input.amount) || 0)
  const spent = debitAbs(input)
  const explicit = metaNumber(meta, 'refundCreditAmount') ?? metaNumber(meta, 'refundedAmount')
  if (explicit != null) return Math.min(explicit, spent > 0 ? spent : cap)
  const bps = metaNumber(meta, 'refundBps')
  if (bps != null) return Math.min(refundAmountFromBps(spent > 0 ? spent : cap, bps), spent > 0 ? spent : cap)
  const series = metaNumber(meta, 'sessionRefundsTotal')
  if (series != null && series > 0) return Math.min(series, spent > 0 ? spent : cap)
  if (spent > 0) return spent
  if (input.paymentStatus === 'REFUNDED' && walletPathProven(input)) return cap
  if (input.bookingStatus === 'CANCELLED' && input.method === 'PAID' && input.paymentStatus === 'PAID') return cap
  return null
}

export function decideHistoricalCancelRefund(input: HistoricalRefundInput): HistoricalRefundDecision {
  if (input.alreadyReconciled) return { action: 'skip', reason: 'already_reconciled' }
  if (isCash(input)) return { action: 'skip', reason: 'cash_club_responsibility' }
  if (!cancelled(input)) return { action: 'skip', reason: 'not_cancelled' }

  const spent = debitAbs(input)
  const walletSpendProven = spent > 0
  // reversePending / gateway reverse on a PAID row, or any row with a real wallet debit,
  // are stale IPG leftovers — do not block the closed-loop credit.
  if (bankPending(input.metadata) && input.method !== 'PAID' && !walletSpendProven) {
    return { action: 'unresolved', reason: 'bank_outcome_pending' }
  }
  if (!creditUserId(input)) return { action: 'unresolved', reason: 'no_verified_account' }

  const credited = Math.max(0, Math.floor(input.refundCreditSum) || 0)

  if (cardReversed(input.metadata) && input.method !== 'PAID' && !walletSpendProven) {
    const walletRail = metaNumber(input.metadata, 'walletDebitAmount') ?? 0
    const released = input.metadata.walletDebitReleased === true
    if (!input.metadata.splitPay || walletRail <= 0 || released) {
      return { action: 'skip', reason: 'card_already_reversed' }
    }
    const gap = Math.max(0, Math.min(walletRail, input.amount) - credited)
    if (gap <= 0) return { action: 'skip', reason: 'already_credited' }
    return { action: 'credit', amount: gap, reason: 'split_wallet_rail_after_card_reverse' }
  }

  if (!walletPathProven(input)) return { action: 'unresolved', reason: 'bank_outcome_unknown' }

  const owed = owedAmount(input)
  if (owed == null) return { action: 'unresolved', reason: 'owed_amount_unknown' }
  const gap = Math.max(0, owed - credited)
  if (gap <= 0) return { action: 'skip', reason: 'already_credited' }
  return {
    action: 'credit',
    amount: gap,
    reason: (input.method === 'PAID' || walletSpendProven) ? 'wallet_spend_shortfall' : 'wallet_path_shortfall',
  }
}
