/**
 * Cancel refund channels — dual-rail money model.
 * - wallet_closed_loop: IPG/wallet paid → credit athlete wallet; no SEP bank reverse
 * - desk_cash: till money never entered float → no wallet credit; owner must ack cash returned
 */

export type RefundChannel = 'wallet_closed_loop' | 'desk_cash'

export type DeskCashReturn = 'owed' | 'returned'

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

export function resolveRefundChannel(method: string | null | undefined): RefundChannel {
  return method === 'CASH' ? 'desk_cash' : 'wallet_closed_loop'
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
  if (opts.manualRefund) base.manualRefundRequired = true
  if (opts.channel === 'desk_cash') {
    const prior = existing.deskCashReturn
    base.deskCashReturn = prior === 'returned' ? 'returned' : 'owed'
  }
  return base
}

/** Metadata substring used to count/list online refunds that still need a manual bank transfer. */
export const MANUAL_REFUND_MARKER = '"manualRefundRequired":true'

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
