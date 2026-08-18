import { describe, expect, it } from 'vitest'
import { resolveDeskCharge } from './deskCharge'

describe('resolveDeskCharge', () => {
  it('passes through a full-price subtotal', () => {
    expect(resolveDeskCharge({ subtotal: 2_850_000 })).toEqual({
      amount: 2_850_000,
      discountAmount: 0,
      percent: 0,
      complimentary: false,
    })
  })

  it('applies a desk percent without a code', () => {
    expect(resolveDeskCharge({ subtotal: 1_000_000, percent: 20 })).toEqual({
      amount: 800_000,
      discountAmount: 200_000,
      percent: 20,
      complimentary: false,
    })
  })

  it('zeros the charge for complimentary even if a percent is set', () => {
    expect(resolveDeskCharge({ subtotal: 1_200_000, percent: 10, complimentary: true })).toEqual({
      amount: 0,
      discountAmount: 1_200_000,
      percent: 100,
      complimentary: true,
    })
  })
})
