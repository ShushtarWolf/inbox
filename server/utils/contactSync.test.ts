import { describe, expect, it } from 'vitest'
import {
  bookingSpendAmount,
  computeContactMetrics,
  daysSinceIsoDate,
  paymentStatusOf,
  resolveContactName,
} from './contactSync'

describe('contactSync metrics', () => {
  const now = new Date('2026-08-24T12:00:00')

  it('counts active visits and paid lifetime value', () => {
    const metrics = computeContactMetrics([
      {
        status: 'CONFIRMED',
        guestName: 'علی',
        guestFamily: 'رضایی',
        paymentStatus: 'PAID',
        payment: { status: 'PAID', amount: 500000 },
        slot: { date: '2026-08-20', price: 400000 },
      },
      {
        status: 'CANCELLED',
        guestName: 'علی',
        guestFamily: 'رضایی',
        paymentStatus: 'PAID',
        payment: { status: 'PAID', amount: 100000 },
        slot: { date: '2026-08-10', price: 100000 },
      },
      {
        status: 'CONFIRMED',
        guestName: 'علی',
        guestFamily: 'رضایی',
        paymentStatus: 'PAY_AT_CLUB',
        payment: { status: 'PAY_AT_CLUB', amount: 300000 },
        slot: { date: '2026-08-01', price: 300000 },
      },
    ], now)

    expect(metrics.totalVisits).toBe(2)
    expect(metrics.lifetimeValue).toBe(500000)
    expect(metrics.lastVisit).toBe('2026-08-20')
    expect(metrics.inactiveDays).toBe(daysSinceIsoDate('2026-08-20', now))
  })

  it('prefers the latest active booking name', () => {
    const name = resolveContactName([
      {
        status: 'CONFIRMED',
        guestName: 'مریم',
        guestFamily: 'کریمی',
        slot: { date: '2026-08-20', price: 0 },
      },
      {
        status: 'CONFIRMED',
        guestName: 'علی',
        guestFamily: 'رضایی',
        slot: { date: '2026-08-01', price: 0 },
      },
    ])
    expect(name).toBe('مریم کریمی')
  })

  it('uses payment row status when present', () => {
    expect(paymentStatusOf({ paymentStatus: 'PAY_AT_CLUB', payment: { status: 'PAID' } })).toBe('PAID')
    expect(bookingSpendAmount({
      status: 'CONFIRMED',
      paymentStatus: 'PAY_AT_CLUB',
      payment: { status: 'PAID', amount: 250000 },
      slot: { date: '2026-08-01', price: 100000 },
    })).toBe(250000)
  })
})
