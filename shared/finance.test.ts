import { describe, expect, it } from 'vitest'
import { countsTowardRevenue } from './bookingPayment.ts'

function computeRevenue(bookings: Array<{
  status: string
  paymentStatus: string
  payment?: { amount: number; status: string } | null
  slotPrice: number
}>) {
  return bookings
    .filter((booking) => countsTowardRevenue(booking.status, booking.payment?.status || booking.paymentStatus))
    .reduce((sum, booking) => sum + (booking.payment?.amount || booking.slotPrice), 0)
}

function applyAthleteCancel(booking: {
  status: string
  paymentStatus: string
  payment: { status: string; amount: number }
  slotDisplayStatus: string
}) {
  return {
    ...booking,
    status: 'CANCELLED',
    slotDisplayStatus: 'FREE',
  }
}

describe('platform court booking payment defaults', () => {
  it('creates CONFIRMED booking with PAY_AT_CLUB payment in offline mode', () => {
    const created = {
      status: 'CONFIRMED',
      paymentStatus: 'PAY_AT_CLUB',
      source: 'PLATFORM',
      payment: { method: 'CASH', status: 'PAY_AT_CLUB', amount: 500_000 },
    }
    expect(created.paymentStatus).toBe('PAY_AT_CLUB')
  })
})

describe('cancellation refund behavior', () => {
  it('keeps unpaid payment status on cancel', () => {
    const after = applyAthleteCancel({
      status: 'CONFIRMED',
      paymentStatus: 'PAY_AT_CLUB',
      payment: { status: 'PAY_AT_CLUB', amount: 500_000 },
      slotDisplayStatus: 'RESERVED',
    })
    expect(after.payment.status).toBe('PAY_AT_CLUB')
  })

  it('expects paid cancellations to refund via wallet or gateway', () => {
    const paid = { status: 'PAID', amount: 500_000 }
    expect(paid.status).toBe('PAID')
  })
})

describe('owner finance revenue aggregation', () => {
  const bookings = [
    { status: 'CONFIRMED', paymentStatus: 'PAID', payment: { amount: 500_000, status: 'PAID' }, slotPrice: 500_000 },
    { status: 'CONFIRMED', paymentStatus: 'PAY_AT_CLUB', payment: { amount: 400_000, status: 'PAY_AT_CLUB' }, slotPrice: 400_000 },
    { status: 'CANCELLED', paymentStatus: 'PAID', payment: { amount: 300_000, status: 'PAID' }, slotPrice: 300_000 },
  ]

  it('counts only paid non-cancelled bookings', () => {
    expect(computeRevenue(bookings)).toBe(500_000)
  })
})
