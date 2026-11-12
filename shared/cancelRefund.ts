/**
 * Cancel refund channels — dual-rail money model.
 * - wallet_closed_loop: ordinary online / wallet / split cancel → athlete wallet (withdrawal is a later, separate request)
 * - gateway_reverse: historical card reverse only — do not credit that card amount again
 * - desk_cash: till money never entered float → no wallet credit; owner must ack cash returned
 *
 * Ordinary cancellation does not call SEP ReverseTransaction. Bank reverse remains
 * only for capture rejection (wrong amount, split recollect failure), not for cancel.
 */

export type RefundChannel = 'wallet_closed_loop' | 'desk_cash' | 'gateway_reverse'

export type DeskCashReturn = 'owed' | 'returned'

/** Pay-link guest IPG cancel — ops must bank-transfer; ack clears admin owed count. */
export type ManualBankRefund = 'owed' | 'returned'

export function parsePaymentMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {}
  }
}

/**
 * Route cancel refunds: desk till cash never credits the athlete wallet; IPG and
 * wallet checkout (method PAID) stay closed-loop wallet credit.
 * Booking.paymentMethod is a fallback when the Payment row drifted from the desk mark-paid.
 */
export function resolveRefundChannel(
  method: string | null | undefined,
  bookingPaymentMethod?: string | null,
): RefundChannel {
  if (method === 'IPG' || method === 'PAID') return 'wallet_closed_loop'
  if (method === 'CASH' || bookingPaymentMethod === 'CASH') return 'desk_cash'
  return 'wallet_closed_loop'
}

/**
 * Historical SEP state that must not be wallet-credited again on an ordinary cancel.
 * `reverse_pending`: the bank may already have reversed — do not also credit the wallet.
 * `already_reversed`: the card was reversed — do not credit that card amount again.
 */
export function ordinaryCancelRefundGuard(
  meta: Record<string, unknown>,
  opts?: { method?: string | null },
):
  | { action: 'proceed' }
  | { action: 'reverse_pending' }
  | { action: 'already_reversed' } {
  // Full wallet checkout (method PAID) never charged a card. Gateway flags on such a row are
  // leftovers from an earlier IPG attempt on the same Payment row — honoring them would skip
  // the wallet credit and strand the athlete's money.
  if (isWalletCheckoutMethod(opts?.method)) return { action: 'proceed' }
  if (meta.gatewayReversed === true || meta.gatewayRefund === true) {
    return { action: 'already_reversed' }
  }
  if (meta.reversePending === true) return { action: 'reverse_pending' }
  return { action: 'proceed' }
}

export function isDeskCashCancelRefund(
  method: string | null | undefined,
  bookingPaymentMethod?: string | null,
): boolean {
  return resolveRefundChannel(method, bookingPaymentMethod) === 'desk_cash'
}

/** Build metadata patch written when a cancel refund is applied. */
export function buildCancelRefundMetadata(
  existing: Record<string, unknown>,
  opts: {
    channel: RefundChannel
    reason: string
    now?: Date
    /** Online money with no athlete wallet to credit (pay-link guest) — ops must bank-refund. */
    manualRefund?: boolean
  },
): Record<string, unknown> {
  const nowIso = (opts.now || new Date()).toISOString()
  const base: Record<string, unknown> = {
    ...existing,
    refundChannel: opts.channel,
    refundReason: opts.reason,
    refundedAt: nowIso,
    // Keep a historical card reverse. Ordinary cancel must not clear it and then wallet-credit the same money.
    gatewayReversed: existing.gatewayReversed === true,
  }
  if (opts.manualRefund) {
    base.manualRefundRequired = true
    const prior = existing.manualBankRefund
    base.manualBankRefund = prior === 'returned' ? 'returned' : 'owed'
  }
  if (opts.channel === 'desk_cash') {
    const prior = existing.deskCashReturn
    base.deskCashReturn = prior === 'returned' ? 'returned' : 'owed'
  }
  return base
}

/** Metadata substring used to count/list online refunds that still need a manual bank transfer. */
export const MANUAL_REFUND_MARKER = '"manualRefundRequired":true'

/** Still owed when flagged and not yet acked as returned. */
export function isManualBankRefundOwed(meta: Record<string, unknown>): boolean {
  if (meta.manualRefundRequired !== true && !readManualBankRefund(meta)) return false
  return readManualBankRefund(meta) !== 'returned'
}

export function readManualBankRefund(meta: Record<string, unknown>): ManualBankRefund | null {
  const v = meta.manualBankRefund
  if (v === 'owed' || v === 'returned') return v
  // Legacy rows only have the boolean flag — treat as owed.
  if (meta.manualRefundRequired === true) return 'owed'
  return null
}

export function buildManualBankRefundReturnedMetadata(
  existing: Record<string, unknown>,
  opts?: { now?: Date; note?: string; guestSheba?: string | null },
): Record<string, unknown> {
  const sheba = opts?.guestSheba?.trim() || null
  return {
    ...existing,
    manualRefundRequired: true,
    manualBankRefund: 'returned',
    manualBankRefundedAt: (opts?.now || new Date()).toISOString(),
    ...(opts?.note ? { manualBankRefundNote: opts.note } : {}),
    ...(sheba ? { guestSheba: sheba } : {}),
  }
}

export function readDeskCashReturn(meta: Record<string, unknown>): DeskCashReturn | null {
  const v = meta.deskCashReturn
  if (v === 'owed' || v === 'returned') return v
  return null
}

/**
 * True when REFUNDED (or cancel) still owes real-world cash return —
 * desk till or ops manual bank transfer. Prefer this over treating REFUNDED as settled.
 */
export function isRefundOwed(meta: Record<string, unknown>): boolean {
  if (readDeskCashReturn(meta) === 'owed') return true
  if (isManualBankRefundOwed(meta)) return true
  return false
}

export function buildDeskCashReturnedMetadata(
  existing: Record<string, unknown>,
  opts?: { now?: Date; note?: string },
): Record<string, unknown> {
  return {
    ...existing,
    refundChannel: 'desk_cash',
    deskCashReturn: 'returned',
    deskCashReturnedAt: (opts?.now || new Date()).toISOString(),
    ...(opts?.note ? { deskCashReturnNote: opts.note } : {}),
    gatewayReversed: false,
  }
}

/** Full wallet checkout rail (Payment.method PAID, money taken from the athlete wallet). */
export function isWalletCheckoutMethod(method: string | null | undefined): boolean {
  return method === 'PAID'
}

/** Gateway-attempt flags that must not survive onto a wallet-paid Payment row. */
export const STALE_GATEWAY_META_KEYS = [
  'gatewayReversed',
  'gatewayRefund',
  'reversePending',
  'reverseFailReason',
  'reverseResolvedAt',
  'gatewayCaptured',
  'splitRecollectFailed',
] as const

/**
 * Metadata for a Payment row claimed by full wallet checkout. Drops leftover gateway flags from
 * an earlier IPG attempt on the same row and records the wallet payer.
 */
export function walletCheckoutClaimMetadata(
  existing: Record<string, unknown>,
  opts: { userId: string; now?: Date },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing }
  const dropped: string[] = []
  for (const key of STALE_GATEWAY_META_KEYS) {
    if (key in next) {
      dropped.push(key)
      delete next[key]
    }
  }
  next.walletCheckout = true
  next.walletUserId = opts.userId
  next.walletPaidAt = (opts.now || new Date()).toISOString()
  if (dropped.length) next.walletCheckoutDroppedGatewayKeys = dropped
  return next
}

/**
 * Who gets an ordinary wallet-rail cancel credit. The wallet that was actually debited for this
 * payment wins: a desk edit can re-link Booking.userId to a different phone, and money must go
 * back to whoever paid it.
 */
export function resolveRefundCreditUserId(opts: {
  debitedWalletUserId?: string | null
  explicitUserId?: string | null
  paymentUserId?: string | null
  bookingUserId?: string | null
}): string | null {
  return opts.debitedWalletUserId
    || opts.explicitUserId
    || opts.paymentUserId
    || opts.bookingUserId
    || null
}

/**
 * Net athlete-wallet movement for one payment across the booking rail
 * (debit, refund, wallet-first IPG pair, split recollect). Negative after a full-refund cancel
 * means money left the wallet and never came back.
 */
export const BOOKING_RAIL_WALLET_TX_TYPES = [
  'PAYMENT_DEBIT',
  'REFUND_CREDIT',
  'IPG_BOOKING_CREDIT',
  'IPG_BOOKING_DEBIT',
  'ADJUSTMENT',
] as const

export function netWalletRailAmount(rows: Array<{ type: string; amount: number }>): number {
  const types = BOOKING_RAIL_WALLET_TX_TYPES as readonly string[]
  return rows.reduce((sum, row) => (types.includes(row.type) ? sum + (Number(row.amount) || 0) : sum), 0)
}
