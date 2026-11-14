/**
 * Athlete self-serve «پرداخت حضوری در باشگاه» when a club opts in (allowCashAtClub).
 * Desk / owner cash flows are separate; this path creates PAY_AT_CLUB platform bookings
 * without the 15-minute online hold or IPG redirect.
 */

/** Max concurrent unpaid athlete pay-at-club bookings per user per club (abuse guard). */
export const ATHLETE_OPEN_PAY_AT_CLUB_LIMIT = 3

export const ATHLETE_PAY_AT_CLUB_LIMIT = 'ATHLETE_PAY_AT_CLUB_LIMIT'
export const ALLOW_CASH_AT_CLUB_DISABLED = 'ALLOW_CASH_AT_CLUB_DISABLED'
export const PAY_AT_CLUB_REQUIRES_PAYMENT = 'PAY_AT_CLUB_REQUIRES_PAYMENT'

export function parseAthletePayAtClubChoice(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const payAtClub = (body as { payAtClub?: unknown }).payAtClub
  return payAtClub === true || payAtClub === 'true' || payAtClub === 1 || payAtClub === '1'
}

/** Same shape as desk unpaid cash — never routes through wallets or online hold. */
export function initialAthletePayAtClubPaymentFields(amount: number): {
  paymentStatus: 'PAY_AT_CLUB'
  payment: {
    amount: number
    method: 'CASH'
    status: 'PAY_AT_CLUB'
    provider: 'pay_at_club'
  }
} {
  return {
    paymentStatus: 'PAY_AT_CLUB',
    payment: {
      amount,
      method: 'CASH',
      status: 'PAY_AT_CLUB',
      provider: 'pay_at_club',
    },
  }
}

export function athletePayAtClubPaymentMetadata(): Record<string, unknown> {
  return { athletePayAtClub: true }
}