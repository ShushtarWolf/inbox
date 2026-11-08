import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateMany = vi.fn()
const findUnique = vi.fn()
const queryRaw = vi.fn()
const releaseSplitWalletDebit = vi.fn()

vi.mock('./prisma', () => {
  const prisma = {
    payment: {
      updateMany: (...args: unknown[]) => updateMany(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: vi.fn(),
    },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
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
    queryRaw.mockResolvedValue([])
    releaseSplitWalletDebit.mockResolvedValue({ released: true })
    updateMany.mockResolvedValue({ count: 1 })
    findUnique.mockImplementation(async (args: { select?: { status?: boolean, metadataJson?: boolean } }) => {
      if (args?.select?.status && !args.select.metadataJson) {
        return { status: 'PENDING_ONLINE' }
      }
      return {
        status: 'PENDING_ONLINE',
        gatewayRef: null,
        providerRef: 'INBabc',
        metadataJson: '{"discount":1,"walletDebitReleased":true}',
      }
    })
  })

  it('locks the row, releases split wallet, then claims SUPERSEDED only while payable', async () => {
    const result = await supersedePayablePaymentForRetry({
      id: 'pay-old',
      providerRef: 'INBabc',
      metadataJson: '{"discount":1}',
    })

    expect(result).toEqual({ superseded: true, status: 'SUPERSEDED' })
    expect(queryRaw).toHaveBeenCalled()
    expect(releaseSplitWalletDebit).toHaveBeenCalledWith('pay-old', expect.anything())
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'pay-old',
        status: { in: ['PENDING_ONLINE', 'PAY_AT_CLUB', 'PENDING_AT_CLUB', 'FAILED'] },
      }),
      data: expect.objectContaining({
        status: 'SUPERSEDED',
        bookingId: null,
        providerRef: null,
      }),
    }))
    const meta = JSON.parse(updateMany.mock.calls[0][0].data.metadataJson as string)
    expect(meta.walletDebitReleased).toBe(true)
    expect(meta.supersededProviderRef).toBe('INBabc')
  })

  it('does not supersede a payment that already became PAID', async () => {
    findUnique.mockResolvedValue({
      status: 'PAID',
      gatewayRef: 'bank-ref',
      providerRef: 'INBabc',
      metadataJson: '{}',
    })

    const result = await supersedePayablePaymentForRetry({
      id: 'pay-old',
      providerRef: 'INBabc',
      metadataJson: '{}',
    })

    expect(result).toEqual({ superseded: false, status: 'PAID' })
    expect(releaseSplitWalletDebit).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('does not supersede an in-flight verify that already stored a bank ref', async () => {
    findUnique.mockResolvedValue({
      status: 'PENDING_ONLINE',
      gatewayRef: null,
      providerRef: 'INBabc',
      metadataJson: JSON.stringify({ verifyPendingRefNum: 'ref-1' }),
    })

    const result = await supersedePayablePaymentForRetry({
      id: 'pay-old',
      providerRef: 'INBabc',
      metadataJson: '{}',
    })

    expect(result.superseded).toBe(false)
    expect(releaseSplitWalletDebit).not.toHaveBeenCalled()
  })

  it('links superseded row to replacement id', async () => {
    const update = vi.fn()
    const { prisma } = await import('./prisma')
    prisma.payment.update = update
    await linkPaymentSupersededBy('pay-old', 'pay-new')
    expect(update).toHaveBeenCalledWith({
      where: { id: 'pay-old' },
      data: { supersededByPaymentId: 'pay-new' },
    })
  })
})
