import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const update = vi.fn()
const syncPaymentToParent = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    payment: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}))

vi.mock('./paymentSync', () => ({
  syncPaymentToParent: (...args: unknown[]) => syncPaymentToParent(...args),
}))

import { acknowledgeDeskCashReturn } from './deskCashReturn'

const cashRefunded = {
  id: 'pay-cash',
  method: 'CASH',
  status: 'REFUNDED',
  metadataJson: JSON.stringify({
    refundChannel: 'desk_cash',
    deskCashReturn: 'owed',
  }),
  booking: { slot: { court: { clubId: 'club-1' } } },
  packageBooking: null,
  competitionEntry: null,
  coachSession: null,
}

describe('acknowledgeDeskCashReturn', () => {
  beforeEach(() => {
    findUnique.mockResolvedValue(cashRefunded)
    update.mockResolvedValue({})
    syncPaymentToParent.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('marks owed desk cash as returned', async () => {
    const result = await acknowledgeDeskCashReturn({ paymentId: 'pay-cash', clubId: 'club-1' })
    expect(result).toEqual({ ok: true, already: false, paymentId: 'pay-cash' })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadataJson: expect.stringContaining('"deskCashReturn":"returned"'),
      }),
    }))
  })

  it('rejects wrong club', async () => {
    await expect(acknowledgeDeskCashReturn({ paymentId: 'pay-cash', clubId: 'other' }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects non-cash', async () => {
    findUnique.mockResolvedValue({ ...cashRefunded, method: 'IPG' })
    await expect(acknowledgeDeskCashReturn({ paymentId: 'pay-cash', clubId: 'club-1' }))
      .rejects.toMatchObject({ statusCode: 409 })
  })
})
