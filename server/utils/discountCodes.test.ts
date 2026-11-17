import { afterEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const updateMany = vi.fn()

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})

vi.mock('./prisma', () => ({
  prisma: {},
}))

import type { DiscountCode } from '@prisma/client'
import { assertDiscountUsable, redeemDiscountCode } from './discountCodes'

describe('assertDiscountUsable', () => {
  const base: DiscountCode = {
    id: 'dc-1',
    code: 'INBOXSADMIN',
    percent: 20,
    labelFa: null,
    labelEn: null,
    active: true,
    clubId: 'club-1',
    boundUserId: null,
    startsAt: null,
    endsAt: new Date('2026-10-22T20:29:59.999Z'),
    maxRedemptions: 5,
    redemptionCount: 0,
    createdAt: new Date(),
  }

  it('rejects expired codes at checkout validation', () => {
    expect(() => assertDiscountUsable(
      base,
      'club-1',
      'user-1',
      new Date('2026-11-16T12:00:00+03:30'),
    )).toThrow('Discount code expired')
  })

  it('rejects cap-exhausted codes', () => {
    expect(() => assertDiscountUsable(
      { ...base, endsAt: null, redemptionCount: 5 },
      'club-1',
      'user-1',
    )).toThrow('Discount code exhausted')
  })
})

describe('redeemDiscountCode', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('allows a single redemption when maxRedemptions is 1', async () => {
    findUnique.mockResolvedValue({ id: 'dc-1', maxRedemptions: 1, redemptionCount: 0 })
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    const tx = {
      discountCode: {
        findUnique: (...args: unknown[]) => findUnique(...args),
        updateMany: (...args: unknown[]) => updateMany(...args),
      },
    }

    await redeemDiscountCode(tx as never, 'dc-1')
    await expect(redeemDiscountCode(tx as never, 'dc-1')).rejects.toThrow('Discount code exhausted')
    expect(updateMany).toHaveBeenCalledTimes(2)
  })
})
