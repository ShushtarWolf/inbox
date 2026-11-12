/**
 * Soft-hold window for unpaid platform online court checkouts.
 * Matches HTML prototype pay-fail copy («جای رزرو تا ۱۵ دقیقه»).
 */
export const ONLINE_PAYMENT_HOLD_MINUTES = 15
export const ONLINE_PAYMENT_HOLD_MS = ONLINE_PAYMENT_HOLD_MINUTES * 60 * 1000

/** Written on Payment.metadataJson when the hold releases the seat (not a bank decline). */
export const ONLINE_HOLD_EXPIRED_FAIL_REASON = 'online_hold_expired'

export function onlinePaymentHoldExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ONLINE_PAYMENT_HOLD_MS)
}

export function isOnlinePaymentHoldExpired(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= createdAt.getTime() + ONLINE_PAYMENT_HOLD_MS
}

/**
 * FAILED that means seat/time expired — not «بانک تراکنش را تایید نکرد».
 * Includes cron `pending_online_expired` and desk `NO_PAYMENT` cancels.
 */
export function isHoldExpiredPaymentFailure(input: {
  status?: string | null
  failReason?: string | null
  cancellationReason?: string | null
}): boolean {
  if (input.status !== 'FAILED') return false
  const reason = String(input.failReason || '')
  if (reason === ONLINE_HOLD_EXPIRED_FAIL_REASON || reason === 'pending_online_expired') return true
  return input.cancellationReason === 'NO_PAYMENT'
}

export function readPaymentFailReason(metadataJson: string | null | undefined): string | null {
  if (!metadataJson) return null
  try {
    const meta = JSON.parse(metadataJson) as { failReason?: unknown }
    return typeof meta.failReason === 'string' && meta.failReason ? meta.failReason : null
  }
  catch {
    return null
  }
}

/** Platform online unpaid rows that should soft-hold then auto-release. */
export function isOnlinePaymentHoldCandidate(booking: {
  source?: string | null
  status?: string | null
  paymentStatus?: string | null
}): boolean {
  if (booking.source !== 'PLATFORM') return false
  if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') return false
  return booking.paymentStatus === 'PENDING_ONLINE' || booking.paymentStatus === 'FAILED'
}

export function isReleasableOnlinePaymentHold(
  booking: {
    source?: string | null
    status?: string | null
    paymentStatus?: string | null
    createdAt: Date
  },
  now: Date = new Date(),
): boolean {
  return isOnlinePaymentHoldCandidate(booking) && isOnlinePaymentHoldExpired(booking.createdAt, now)
}

/** Online unpaid → soft PENDING hold; pay-at-club platform → immediate reserved. */
export function initialOnlineCourtHoldDisplay(onlinePaymentsEnabled: boolean): {
  displayStatus: 'PENDING' | 'RESERVED'
  bookingStatus: 'PENDING' | 'CONFIRMED'
} {
  if (onlinePaymentsEnabled) {
    return { displayStatus: 'PENDING', bookingStatus: 'PENDING' }
  }
  return { displayStatus: 'RESERVED', bookingStatus: 'CONFIRMED' }
}
