import { afterEach, describe, expect, it } from 'vitest'
import {
  ATHLETE_OPEN_PAY_AT_CLUB_LIMIT,
  initialAthletePayAtClubPaymentFields,
  parseAthletePayAtClubChoice,
} from './athletePayAtClub.ts'
import { initialPlatformPaymentFields } from './bookingPayment.ts'
import { resolveDeskPaymentWrite } from './deskPaidGuard.ts'

describe('athletePayAtClub', () => {
  it('documents the open-booking cap', () => {
    expect(ATHLETE_OPEN_PAY_AT_CLUB_LIMIT).toBe(3)
  })

  it('parses payAtClub from booking bodies', () => {
    expect(parseAthletePayAtClubChoice({ payAtClub: true })).toBe(true)
    expect(parseAthletePayAtClubChoice({ payAtClub: false })).toBe(false)
    expect(parseAthletePayAtClubChoice({})).toBe(false)
    expect(parseAthletePayAtClubChoice(null)).toBe(false)
  })

  it('creates desk-shaped unpaid cash rows', () => {
    const fields = initialAthletePayAtClubPaymentFields(500_000)
    expect(fields.paymentStatus).toBe('PAY_AT_CLUB')
    expect(fields.payment).toMatchObject({
      amount: 500_000,
      method: 'CASH',
      status: 'PAY_AT_CLUB',
      provider: 'pay_at_club',
    })
  })
})

describe('paid booking payment modes', () => {
  const original = process.env.PAYMENTS_MODE

  afterEach(() => {
    process.env.PAYMENTS_MODE = original
  })

  it('owner desk mark-paid on athlete PAY_AT_CLUB stays cash PAID (no wallet)', () => {
    const write = resolveDeskPaymentWrite({
      requestedPaid: true,
      previousMethod: 'CASH',
      previousStatus: 'PAY_AT_CLUB',
    })
    expect(write).toMatchObject({ method: 'CASH', status: 'PAID', forcedCashForManualPaid: false })
    expect(write.error).toBeUndefined()
  })

  it('online path stays PENDING_ONLINE', () => {
    process.env.PAYMENTS_MODE = 'test'
    const online = initialPlatformPaymentFields(600_000)
    const cash = initialAthletePayAtClubPaymentFields(600_000)
    expect(online.paymentStatus).toBe('PENDING_ONLINE')
    expect(cash.paymentStatus).toBe('PAY_AT_CLUB')
    expect(online.payment.method).toBe('NOT_PAID')
    expect(cash.payment.method).toBe('CASH')
  })
})