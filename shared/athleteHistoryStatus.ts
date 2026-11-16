import { isPaidPaymentStatus } from './bookingPayment.ts'

/** Terminal payment statuses that must not show as an active paid reservation. */
export function isAthleteCancelledPayment(paymentStatus?: string | null): boolean {
  return paymentStatus === 'REFUNDED' || paymentStatus === 'FAILED'
}

type StatusRow = {
  status?: string | null
  cancelledAt?: Date | string | null
  paymentStatus?: string | null
  payment?: { status?: string | null } | null
}

export function athleteBookingPaymentStatus(row: StatusRow): string {
  return row.payment?.status || row.paymentStatus || ''
}

/**
 * Booking status for athlete history badges and actions.
 * Primary SoT is Booking.status; payment REFUNDED / cancelledAt cover legacy desync rows.
 */
export function athleteEffectiveBookingStatus(row: StatusRow): string {
  if (row.status === 'CANCELLED' || row.cancelledAt) return 'CANCELLED'
  const pay = athleteBookingPaymentStatus(row)
  if (isAthleteCancelledPayment(pay)) return 'CANCELLED'
  return row.status || 'CONFIRMED'
}

export type AthleteHistoryDisplayStatus = 'paid' | 'unpaid' | 'done' | 'cancelled'

/** Badge / dot status for تاریخچه رزروها — never show paid actions when cancelled. */
export function athleteHistoryDisplayStatus(
  row: StatusRow & { date?: string },
  todayIso: string,
): AthleteHistoryDisplayStatus {
  if (athleteEffectiveBookingStatus(row) === 'CANCELLED') return 'cancelled'
  const pay = athleteBookingPaymentStatus(row)
  if (isPaidPaymentStatus(pay)) return 'paid'
  const date = row.date || ''
  return date && date < todayIso ? 'done' : 'unpaid'
}