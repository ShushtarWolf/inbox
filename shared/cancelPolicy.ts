import { isSlotStartInPast, minutesUntilSlotStart } from './localDate.ts'

export type CancelMoneyActor = 'athlete' | 'coach' | 'owner'
export type CancelMoneyOutcome = 'full_wallet_refund' | 'partial_wallet_refund' | 'zero_refund'

export type CancelMoneyDetail = {
  outcome: CancelMoneyOutcome
  /** Basis points of original amount to credit (0–10000). */
  refundBps: number
}

/**
 * Money outcome for a cancellation. Cancel permission is separate:
 * athletes may cancel until slot start; coach/owner anytime.
 *
 * Owner/coach cancels always 100%. Athlete outside window: 100%.
 * Athlete inside window: club.insideWindowRefundBps (default 10000 = full refund).
 */
export function resolveCancelMoneyDetail(opts: {
  actor: CancelMoneyActor
  date: string
  startTime: string
  windowHours: number
  /** Club setting; default 10000 (full refund). */
  insideWindowRefundBps?: number
  now?: Date
}): CancelMoneyDetail {
  if (opts.actor === 'coach' || opts.actor === 'owner') {
    return { outcome: 'full_wallet_refund', refundBps: 10_000 }
  }

  const windowHours = Math.max(0, Number(opts.windowHours) || 0)
  const insideBps = clampBps(opts.insideWindowRefundBps ?? 10_000)
  const minutesLeft = minutesUntilSlotStart(opts.date, opts.startTime, opts.now)
  const insideWindow = minutesLeft >= 0 && minutesLeft < windowHours * 60

  if (!insideWindow) {
    return { outcome: 'full_wallet_refund', refundBps: 10_000 }
  }
  if (insideBps <= 0) return { outcome: 'zero_refund', refundBps: 0 }
  if (insideBps >= 10_000) return { outcome: 'full_wallet_refund', refundBps: 10_000 }
  return { outcome: 'partial_wallet_refund', refundBps: insideBps }
}

/** Outcome enum for cancel routes (pass refundBps separately when partial). */
export function resolveCancelMoneyOutcome(opts: {
  actor: CancelMoneyActor
  date: string
  startTime: string
  windowHours: number
  insideWindowRefundBps?: number
  now?: Date
}): CancelMoneyOutcome {
  return resolveCancelMoneyDetail(opts).outcome
}

export function refundAmountFromBps(amount: number, refundBps: number): number {
  const gross = Math.max(0, Math.floor(Number(amount) || 0))
  const bps = clampBps(refundBps)
  if (bps <= 0) return 0
  if (bps >= 10_000) return gross
  return Math.floor((gross * bps) / 10_000)
}

function clampBps(raw: number): number {
  if (!Number.isFinite(raw)) return 10_000
  return Math.max(0, Math.min(10_000, Math.floor(raw)))
}

/** Athletes may cancel until the slot starts; coach/owner unrestricted here. */
export function canCancelReservation(opts: {
  actor: CancelMoneyActor
  date: string
  startTime: string
  now?: Date
}): boolean {
  if (opts.actor === 'coach' || opts.actor === 'owner') return true
  return !isSlotStartInPast(opts.date, opts.startTime, opts.now)
}
