import { canManageReservation, isSlotStartInPast } from './localDate.ts'

export type CancelMoneyActor = 'athlete' | 'coach' | 'owner'
export type CancelMoneyOutcome = 'full_wallet_refund' | 'zero_refund'

/**
 * Money outcome for a cancellation. Cancel permission is separate:
 * athletes may cancel until slot start; coach/owner anytime.
 */
export function resolveCancelMoneyOutcome(opts: {
  actor: CancelMoneyActor
  date: string
  startTime: string
  windowHours: number
  now?: Date
}): CancelMoneyOutcome {
  if (opts.actor === 'coach' || opts.actor === 'owner') {
    return 'full_wallet_refund'
  }
  // Athlete: outside club window → wallet refund; inside → cancel allowed, no money back.
  if (canManageReservation(opts.date, opts.startTime, opts.windowHours, opts.now)) {
    return 'full_wallet_refund'
  }
  return 'zero_refund'
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
