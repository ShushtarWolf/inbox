import { describe, expect, it } from 'vitest'
import { financeIncomeAmount } from './bookingPayment.ts'
import { isClubDeskHoldBooking } from './deskHoldBooking.ts'

describe('isClubDeskHoldBooking', () => {
  it('CLUB block without payment is a desk hold', () => {
    expect(isClubDeskHoldBooking({
      source: 'CLUB',
      payment: null,
    })).toBe(true)
  })

  it('paid club booking is not a desk hold', () => {
    expect(isClubDeskHoldBooking({
      source: 'CLUB',
      payment: { id: 'p1' },
    })).toBe(false)
  })
})

describe('financeIncomeAmount after unblock (IB-17)', () => {
  it('club desk hold without payment never shows list price in finance', () => {
    expect(financeIncomeAmount(null, 12_000, { clubDeskHold: true })).toBe(0)
  })
})