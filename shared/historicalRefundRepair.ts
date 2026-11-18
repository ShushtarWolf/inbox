import { cancelWalletCreditAmount } from './owedCancelRefund.ts'

/**
 * Dry-run decision for a historical cancel that may be missing an athlete wallet credit.
 * Does not invent a bank outcome from missing metadata. Desk cash stays club-side.
 * A real wallet debit (PAYMENT_DEBIT / IPG_BOOKING_DEBIT) proves the closed-loop path even
 * when stale gateway reverse flags remain on the Payment row.
 * Amount math is cancelWalletCreditAmount (same brain as live / force repair).
 */
export const HISTORICAL_REFUND_NOTE_PREFIX = 'recon:historical-cancel:'

/**
 * Stable recon key. Standalone = per payment. Series session heal = payment + cancelled booking
 * so several sibling cancels on one primary can each append once.
 */
export function historicalRefundIdempotencyKey(
  paymentId: string,
  bookingId?: string | null,
): string {
  if (bookingId) return `${HISTORICAL_REFUND_NOTE_PREFIX}${paymentId}:${bookingId}`
  return `${HISTORICAL_REFUND_NOTE_PREFIX}${paymentId}`
}

/** Phase-3 dry-run bucket for ops review. */
export type HistoricalRepairBucket = 'credit' | 'skip' | 'review' | 'series_gap'

export function historicalRepairBucket(
  decision: HistoricalRefundDecision,
): Exclude<HistoricalRepairBucket, 'series_gap'> {
  if (decision.action === 'credit') return 'credit'
  if (decision.action === 'skip') return 'skip'
  return 'review'
}

export type HistoricalRefundDecision =
  | { action: 'credit'; amount: number; reason: 'wallet_path_shortfall' | 'wallet_spend_shortfall' | 'split_wallet_rail_after_card_reverse' | 'series_session_shortfall' }
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
  /** Series context — optional; when set, owed uses session share not full primary. */
  primaryAmount?: number | null
  sessionPrice?: number | null
  alreadyRefundedOnPrimary?: number | null
  remainingSessionsIncludingCancelled?: number | null
  treatAsSeries?: boolean
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
  const spent = debitAbs(input)
  const cap = Math.max(0, Math.floor(input.amount) || 0)
  const payBasis = spent > 0 ? spent : cap
  const explicit = metaNumber(meta, 'refundCreditAmount') ?? metaNumber(meta, 'refundedAmount')
  const hasBasis = explicit != null
    || payBasis > 0
    || (input.paymentStatus === 'REFUNDED' && walletPathProven(input) && cap > 0)
    || (input.bookingStatus === 'CANCELLED' && input.method === 'PAID' && input.paymentStatus === 'PAID' && cap > 0)
    || input.treatAsSeries === true
    || (typeof input.primaryAmount === 'number' && input.primaryAmount > 0)
  if (!hasBasis) return null

  const result = cancelWalletCreditAmount({
    method: input.method,
    bookingPaymentMethod: input.bookingPaymentMethod,
    paymentAmount: payBasis > 0 ? payBasis : cap,
    primaryAmount: input.primaryAmount,
    sessionPrice: input.sessionPrice,
    alreadyRefundedOnPrimary: input.alreadyRefundedOnPrimary ?? metaNumber(meta, 'sessionRefundsTotal'),
    remainingSessionsIncludingCancelled: input.remainingSessionsIncludingCancelled,
    treatAsSeries: input.treatAsSeries,
    metadata: meta,
    honorExplicitRefundMeta: false,
  })
  if (result.reason === 'desk_cash') return null
  return result.amount
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
  if (input.treatAsSeries === true) {
    return { action: 'credit', amount: gap, reason: 'series_session_shortfall' }
  }
  return {
    action: 'credit',
    amount: gap,
    reason: (input.method === 'PAID' || walletSpendProven) ? 'wallet_spend_shortfall' : 'wallet_path_shortfall',
  }
}
