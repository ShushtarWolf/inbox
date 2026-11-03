import { beforeEach, describe, expect, it, vi } from 'vitest'

const update = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    payment: { update: (...args: unknown[]) => update(...args) },
  },
}))

import { linkPaymentSupersededBy, supersedePayablePaymentForRetry } from './paymentSupersede'

describe('paymentSupersede', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    update.mockResolvedValue({})
  })

  it('marks payable row SUPERSEDED and clears parent FKs', async () => {
    await supersedePayablePaymentForRetry({
      id: 'pay-old',
      bookingId: 'bk-1',
      coachSessionId: null,
      packageBookingId: null,
      metadataJson: '{"discount":1}',
    })

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-old' },
        data: expect.objectContaining({
          status: 'SUPERSEDED',
          bookingId: null,
          providerRef: null,
        }),
      }),
    )
    const payload = update.mock.calls[0][0].data.metadataJson as string
    expect(JSON.parse(payload).supersededAt).toBeTruthy()
  })

  it('links superseded row to replacement id', async () => {
    await linkPaymentSupersededBy('pay-old', 'pay-new')

    expect(update).toHaveBeenCalledWith({
      where: { id: 'pay-old' },
      data: { supersededByPaymentId: 'pay-new' },
    })
  })
})
