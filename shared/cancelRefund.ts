/**
 * Cancel refund channels — dual-rail money model.
 * - wallet_closed_loop: IPG/wallet paid → credit athlete wallet; no SEP bank reverse
 * - gateway_reverse: IPG reverse to card (SEP) within reverse window
 * - desk_cash: till money never entered float → no wallet credit; owner must ack cash returned
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

/** True when a paid booking cancel should not credit the athlete wallet. */
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
    /** Cancel path never calls SEP ReverseTransaction — float is closed-loop. */
    gatewayReversed: false,
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
