import { describe, expect, it } from 'vitest'
import { athletePaymentStatusForDisplay } from './athletePaymentDisplay.ts'

describe('athletePaymentStatusForDisplay (IB-47)', () => {
  it('shows cancelled when booking is cancelled even if payment stayed PAID', () => {
    expect(athletePaymentStatusForDisplay({ status: 'PAID', bookingStatus: 'CANCELLED' })).toBe('CANCELLED')
  })

  it('keeps payment status for live bookings', () => {
    expect(athletePaymentStatusForDisplay({ status: 'PAID', bookingStatus: 'CONFIRMED' })).toBe('PAID')
    expect(athletePaymentStatusForDisplay({ status: 'PENDING_ONLINE', bookingStatus: 'PENDING' })).toBe('PENDING_ONLINE')
  })
})