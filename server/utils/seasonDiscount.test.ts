import { describe, expect, it } from 'vitest'
import { resolveDeskCharge } from '#shared/deskCharge.ts'
import { seasonSessionPaymentAmount } from './seasonDiscount'

describe('seasonSessionPaymentAmount', () => {
  it('charges the discounted series total on the primary when grouped', () => {
    const result = seasonSessionPaymentAmount({
      groupedOnPrimary: true,
      isPrimary: true,
      sessionPrice: 400_000,
      chargedSeriesTotal: 900_000,
      remainingDiscount: 100_000,
    })
    expect(result.amount).toBe(900_000)
    expect(result.remainingDiscount).toBe(100_000)
  })

  it('zeros sibling amounts when grouped on primary', () => {
    const result = seasonSessionPaymentAmount({
      groupedOnPrimary: true,
      isPrimary: false,
      sessionPrice: 400_000,
      chargedSeriesTotal: 900_000,
      remainingDiscount: 100_000,
    })
    expect(result.amount).toBe(0)
  })

  it('spreads discount across per-session owner cash payments', () => {
    let remaining = 150_000
    const first = seasonSessionPaymentAmount({
      groupedOnPrimary: false,
      isPrimary: true,
      sessionPrice: 100_000,
      chargedSeriesTotal: 850_000,
      remainingDiscount: remaining,
    })
    remaining = first.remainingDiscount
    expect(first.amount).toBe(0)

    const second = seasonSessionPaymentAmount({
      groupedOnPrimary: false,
      isPrimary: false,
      sessionPrice: 100_000,
      chargedSeriesTotal: 850_000,
      remainingDiscount: remaining,
    })
    remaining = second.remainingDiscount
    expect(second.amount).toBe(50_000)
    expect(remaining).toBe(0)
  })
})

describe('season desk discount subtotal', () => {
  it('applies percent to the full series subtotal', () => {
    const charge = resolveDeskCharge({ subtotal: 1_000_000, percent: 10 })
    expect(charge.discountAmount).toBe(100_000)
    expect(charge.amount).toBe(900_000)
  })
})
