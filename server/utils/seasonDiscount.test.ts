import { describe, expect, it, vi } from 'vitest'
import { resolveDeskCharge } from '#shared/deskCharge.ts'
import { resolveSeasonSeriesCharge, seasonSessionPaymentAmount } from './seasonDiscount'

vi.mock('./discountCodes', () => ({
  resolveDiscountForBooking: vi.fn(),
  discountPaymentMetadata: vi.fn((discount: { code: string; percent: number; discountAmount: number }) => ({
    discountCode: discount.code,
    discountPercent: discount.percent,
    discountAmount: discount.discountAmount,
  })),
  assertDiscountUsable: vi.fn(),
  findDiscountCodeByInput: vi.fn(),
  redeemDiscountCode: vi.fn(),
}))

import { discountPaymentMetadata, resolveDiscountForBooking } from './discountCodes'

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

describe('resolveSeasonSeriesCharge (athlete)', () => {
  it('applies validated discount code to the series subtotal', async () => {
    vi.mocked(resolveDiscountForBooking).mockClear()
    vi.mocked(resolveDiscountForBooking).mockResolvedValueOnce({
      id: 'disc-1',
      code: 'OFF10',
      percent: 10,
      discountAmount: 100_000,
      total: 900_000,
      kind: 'code',
    } as Awaited<ReturnType<typeof resolveDiscountForBooking>>)

    const charge = await resolveSeasonSeriesCharge({
      clubId: 'club-1',
      subtotal: 1_000_000,
      athleteMode: true,
      discountCode: 'off10',
      userId: 'user-1',
    })

    expect(resolveDiscountForBooking).toHaveBeenCalledWith({
      code: 'off10',
      clubId: 'club-1',
      subtotal: 1_000_000,
      userId: 'user-1',
    })
    expect(charge.chargedTotal).toBe(900_000)
    expect(charge.discountAmount).toBe(100_000)
    expect(charge.redeemDiscountId).toBe('disc-1')
    expect(discountPaymentMetadata).toHaveBeenCalled()
  })

  it('leaves total unchanged when no code and no membership', async () => {
    vi.mocked(resolveDiscountForBooking).mockClear()
    vi.mocked(resolveDiscountForBooking).mockResolvedValueOnce(null)
    const charge = await resolveSeasonSeriesCharge({
      clubId: 'club-1',
      subtotal: 500_000,
      athleteMode: true,
    })
    expect(charge.chargedTotal).toBe(500_000)
    expect(charge.discountAmount).toBe(0)
    expect(charge.redeemDiscountId).toBeNull()
  })

  it('applies verified membership without a code and never redeems it', async () => {
    vi.mocked(resolveDiscountForBooking).mockClear()
    vi.mocked(resolveDiscountForBooking).mockResolvedValueOnce({
      id: 'mem-1',
      code: 'MEMBER:mem-1',
      percent: 20,
      discountAmount: 100_000,
      total: 400_000,
      kind: 'membership',
    } as Awaited<ReturnType<typeof resolveDiscountForBooking>>)
    const charge = await resolveSeasonSeriesCharge({
      clubId: 'club-1',
      subtotal: 500_000,
      athleteMode: true,
      userId: 'user-1',
    })
    expect(charge.chargedTotal).toBe(400_000)
    expect(charge.redeemDiscountId).toBeNull()
  })
})

describe('season desk discount subtotal', () => {
  it('applies percent to the full series subtotal', () => {
    const charge = resolveDeskCharge({ subtotal: 1_000_000, percent: 10 })
    expect(charge.discountAmount).toBe(100_000)
    expect(charge.amount).toBe(900_000)
  })
})
