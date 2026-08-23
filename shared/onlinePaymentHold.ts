/** Soft-hold window for unpaid platform online court checkouts. */
export const ONLINE_PAYMENT_HOLD_MINUTES = 10
export const ONLINE_PAYMENT_HOLD_MS = ONLINE_PAYMENT_HOLD_MINUTES * 60 * 1000

export function onlinePaymentHoldExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ONLINE_PAYMENT_HOLD_MS)
}

export function isOnlinePaymentHoldExpired(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= createdAt.getTime() + ONLINE_PAYMENT_HOLD_MS
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
