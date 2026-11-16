import { describe, expect, it } from 'vitest'
import {
  athleteEffectiveBookingStatus,
  athleteHistoryDisplayStatus,
  isAthleteCancelledPayment,
} from './athleteHistoryStatus'

describe('athleteHistoryStatus', () => {
  it('flags REFUNDED payment as cancelled for history actions', () => {
    expect(
      athleteEffectiveBookingStatus({
        status: 'CONFIRMED',
        payment: { status: 'REFUNDED' },
      }),
    ).toBe('CANCELLED')
    expect(
      athleteHistoryDisplayStatus(
        { status: 'CONFIRMED', payment: { status: 'REFUNDED' }, date: '2099-01-01' },
        '2026-01-01',
      ),
    ).toBe('cancelled')
  })

  it('prefers booking.status CANCELLED over PAID payment row', () => {
    expect(
      athleteHistoryDisplayStatus(
        { status: 'CANCELLED', payment: { status: 'PAID' }, date: '2099-01-01' },
        '2026-01-01',
      ),
    ).toBe('cancelled')
  })

  it('shows paid only for live confirmed bookings', () => {
    expect(
      athleteHistoryDisplayStatus(
        { status: 'CONFIRMED', payment: { status: 'PAID' }, date: '2099-01-01' },
        '2026-01-01',
      ),
    ).toBe('paid')
  })

  it('treats cancelledAt without status as cancelled', () => {
    expect(
      athleteEffectiveBookingStatus({
        status: 'CONFIRMED',
        cancelledAt: '2026-11-16T08:00:00.000Z',
      }),
    ).toBe('CANCELLED')
  })

  it('isAthleteCancelledPayment', () => {
    expect(isAthleteCancelledPayment('REFUNDED')).toBe(true)
    expect(isAthleteCancelledPayment('PAID')).toBe(false)
  })
})