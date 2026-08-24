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

import { redeemDiscountCode } from './discountCodes'

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
