import { describe, expect, it } from 'vitest'
import { discountMetadataSlice, paymentIntentMetadata, resolveFinanceDiscount } from './financeDiscount.ts'

describe('finance discount metadata', () => {
  it('keeps discount fields on a replacement gateway payment', () => {
    const preserved = discountMetadataSlice(JSON.stringify({
      discountCode: 'save10',
      discountPercent: 10,
      discountAmount: 1000,
      subtotalBeforeDiscount: 10000,
      token: 'drop-me',
    }))
    expect(preserved).toEqual({
      discountCode: 'SAVE10',
      discountPercent: 10,
      discountAmount: 1000,
      subtotalBeforeDiscount: 10000,
    })
    const metadata = paymentIntentMetadata({ token: 'bank', purpose: 'booking' }, preserved)
    expect(JSON.parse(metadata)).toEqual({
      token: 'bank',
      purpose: 'booking',
      ...preserved,
    })
  })

  it('reads a code from the booking event after the gateway wiped the payment', () => {
    const discount = resolveFinanceDiscount({
      paidAmount: 9602,
      paymentMetadataJson: JSON.stringify({ token: 'bank', purpose: 'booking' }),
      eventMetadataJson: JSON.stringify({ source: 'platform', discountCode: 'SAVE10', discountAmount: 400 }),
    })
    expect(discount).toEqual({
      code: 'SAVE10',
      percent: 4,
      amount: 400,
      subtotal: 10002,
      complimentary: false,
    })
  })

  it('reads a desk percent that has no code', () => {
    const discount = resolveFinanceDiscount({
      paidAmount: 8000,
      paymentMetadataJson: JSON.stringify({
        deskDiscountPercent: 20,
        discountAmount: 2000,
        subtotalBeforeDiscount: 10000,
      }),
    })
    expect(discount?.code).toBeNull()
    expect(discount?.percent).toBe(20)
    expect(discount?.amount).toBe(2000)
  })

  it('returns nothing when the payment had no discount', () => {
    expect(resolveFinanceDiscount({
      paidAmount: 10000,
      paymentMetadataJson: JSON.stringify({ purpose: 'booking' }),
    })).toBeNull()
  })
})
