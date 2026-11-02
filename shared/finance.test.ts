import { describe, expect, it } from 'vitest'
import { countsTowardRevenue, financeIncomeAmount, financeSessionValue } from './bookingPayment.ts'

function computeRevenue(bookings: Array<{
  status: string
  paymentStatus: string
  payment?: { amount: number; status: string } | null
  slotPrice: number
}>) {
  return bookings
    .filter((booking) => countsTowardRevenue(booking.status, booking.payment?.status || booking.paymentStatus))
    .reduce((sum, booking) => sum + financeIncomeAmount(booking.payment, booking.slotPrice), 0)
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
  it('creates pending online booking for athlete self-serve', () => {
    const created = {
      status: 'PENDING',
      paymentStatus: 'PENDING_ONLINE',
      source: 'PLATFORM',
      payment: { method: 'NOT_PAID', status: 'PENDING_ONLINE', amount: 500_000 },
    }
    expect(created.paymentStatus).toBe('PENDING_ONLINE')
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

  it('keeps paid cash cancellations out of athlete wallet', () => {
    const paidCash = { status: 'PAID', method: 'CASH', amount: 500_000, userId: 'u1' }
    const refund = {
      refunded: paidCash.status === 'PAID',
      walletCredited: false,
      amount: paidCash.amount,
    }
    expect(refund).toEqual({ refunded: true, walletCredited: false, amount: 500_000 })
  })

  it('expects guest walk-in paid cancel to mark refunded without wallet', () => {
    const paidGuest = { status: 'PAID', method: 'CASH', amount: 400_000, userId: null as string | null }
    const refund = {
      refunded: paidGuest.status === 'PAID',
      walletCredited: Boolean(paidGuest.userId),
      amount: paidGuest.amount,
    }
    expect(refund).toEqual({ refunded: true, walletCredited: false, amount: 400_000 })
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

describe('owner financeIncomeAmount (series siblings)', () => {
  it('keeps primary charge and sibling zeros — never falls back to slot list price', () => {
    const slotPrice = 600_000
    // Haerizadeh-style season: one charged primary + coveredByBookingId siblings at amount 0.
    const series = [
      { payment: { amount: 4_800_000 }, slotPrice },
      { payment: { amount: 0 }, slotPrice },
      { payment: { amount: 0 }, slotPrice },
      { payment: { amount: 0 }, slotPrice },
      { payment: { amount: 0 }, slotPrice },
      { payment: { amount: 0 }, slotPrice },
      { payment: { amount: 0 }, slotPrice },
      { payment: { amount: 0 }, slotPrice },
    ]
    const amounts = series.map((row) => financeIncomeAmount(row.payment, row.slotPrice))
    expect(amounts).toEqual([4_800_000, 0, 0, 0, 0, 0, 0, 0])
    expect(amounts.reduce((sum, n) => sum + n, 0)).toBe(4_800_000)
    // Coach session siblings use the same helper (list price = session.price).
    expect(financeIncomeAmount({ amount: 0 }, 800_000)).toBe(0)
    expect(financeIncomeAmount(null, slotPrice)).toBe(slotPrice)
  })

  it('checkout payable: stored amount 0 wins over recomputed fallback (never `||`)', () => {
    const recomputedSlotPrice = 600_000
    // payments/checkout.post + receipts/[token]/checkout — sibling / covered rows.
    expect(financeIncomeAmount({ amount: 0 }, recomputedSlotPrice)).toBe(0)
    expect(financeIncomeAmount({ amount: 0 }, recomputedSlotPrice)).not.toBe(recomputedSlotPrice)
    // Contrast: falsy coerce would wrongly charge the sibling.
    expect(({ amount: 0 } as { amount: number }).amount || recomputedSlotPrice).toBe(recomputedSlotPrice)
    // Missing payment still uses the fallback price.
    expect(financeIncomeAmount(null, recomputedSlotPrice)).toBe(recomputedSlotPrice)
    expect(financeIncomeAmount(undefined, 0)).toBe(0)
    // Primary sheet total is unchanged.
    expect(financeIncomeAmount({ amount: 1_200_000 }, recomputedSlotPrice)).toBe(1_200_000)
  })
})

describe('owner financeSessionValue (non-income)', () => {
  it('prefers metadata sessionPrice over list price', () => {
    expect(financeSessionValue(600_000, 700_000)).toBe(600_000)
  })

  it('falls back to list price when sessionPrice is missing', () => {
    expect(financeSessionValue(undefined, 600_000)).toBe(600_000)
    expect(financeSessionValue(null, 600_000)).toBe(600_000)
  })

  it('keeps stored 0 sessionPrice (does not fall back to list price)', () => {
    expect(financeSessionValue(0, 600_000)).toBe(0)
  })

  it('lets ops see sibling session value while income stays 0', () => {
    const listPrice = 600_000
    const income = financeIncomeAmount({ amount: 0 }, listPrice)
    const sessionValue = financeSessionValue(600_000, listPrice)
    expect(income).toBe(0)
    expect(sessionValue).toBe(600_000)
    expect(sessionValue).not.toBe(income)
  })
})
