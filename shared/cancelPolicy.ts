import { isSlotStartInPast } from './localDate.ts'

export type CancelMoneyActor = 'athlete' | 'coach' | 'owner'
export type CancelMoneyOutcome = 'full_wallet_refund' | 'zero_refund'

/**
 * Money outcome for a cancellation. Cancel permission is separate:
 * athletes may cancel until slot start; coach/owner anytime.
 *
 * Paid online/wallet cancels always credit the athlete wallet (closed-loop).
 * `windowHours` is kept for callers/UI policy display — it no longer zeroes money.
 */
export function resolveCancelMoneyOutcome(_opts: {
  actor: CancelMoneyActor
  date: string
  startTime: string
  windowHours: number
  now?: Date
}): CancelMoneyOutcome {
  return 'full_wallet_refund'
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
