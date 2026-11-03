import { beforeEach, describe, expect, it, vi } from 'vitest'

const update = vi.fn()
const findUnique = vi.fn()
const releaseSplitWalletDebit = vi.fn()

vi.mock('./prisma', () => {
  const prisma = {
    payment: {
      update: (...args: unknown[]) => update(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  }
  return { prisma }
})

vi.mock('./splitPayWallet', () => ({
  releaseSplitWalletDebit: (...args: unknown[]) => releaseSplitWalletDebit(...args),
}))

import { linkPaymentSupersededBy, supersedePayablePaymentForRetry } from './paymentSupersede'

describe('paymentSupersede', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    update.mockResolvedValue({})
    findUnique.mockResolvedValue({ metadataJson: '{"discount":1,"walletDebitReleased":true}' })
    releaseSplitWalletDebit.mockResolvedValue({ released: true })
  })

  it('releases split wallet debit, then marks row SUPERSEDED and clears parent FKs', async () => {
    await supersedePayablePaymentForRetry({
      id: 'pay-old',
      bookingId: 'bk-1',
      coachSessionId: null,
      packageBookingId: null,
      providerRef: 'INBabc',
      metadataJson: '{"discount":1}',
    })

    expect(releaseSplitWalletDebit).toHaveBeenCalledWith('pay-old', expect.anything())
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
    const meta = JSON.parse(update.mock.calls[0][0].data.metadataJson as string)
    expect(meta.supersededAt).toBeTruthy()
    // Release flag survives (fresh read), and the bank ref stays traceable.
    expect(meta.walletDebitReleased).toBe(true)
    expect(meta.supersededProviderRef).toBe('INBabc')
  })

  it('links superseded row to replacement id', async () => {
    await linkPaymentSupersededBy('pay-old', 'pay-new')

    expect(update).toHaveBeenCalledWith({
      where: { id: 'pay-old' },
      data: { supersededByPaymentId: 'pay-new' },
    })
  })
})
