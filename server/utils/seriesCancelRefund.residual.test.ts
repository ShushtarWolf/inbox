import { beforeEach, describe, expect, it, vi } from 'vitest'

const creditWallet = vi.fn()
const clawbackOwnerPartialForPayment = vi.fn()

vi.mock('./wallet', () => ({ creditWallet: (...args: unknown[]) => creditWallet(...args) }))
vi.mock('./settlement', () => ({
  clawbackOwnerPartialForPayment: (...args: unknown[]) => clawbackOwnerPartialForPayment(...args),
}))
vi.mock('#shared/cancelRefund.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#shared/cancelRefund.ts')>()
  return {
    ...actual,
    ordinaryCancelRefundGuard: () => ({ action: 'wallet_credit' }),
  }
})

const tx = {
  $queryRaw: vi.fn(),
  payment: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  walletTransaction: { findFirst: vi.fn() },
  clubWalletTransaction: { findFirst: vi.fn() },
}

vi.mock('./prisma', () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    booking: { count: vi.fn(), findUnique: vi.fn() },
    payment: { findUnique: vi.fn() },
  },
}))

import { refundAfterSeriesSessionCancel } from './seriesCancelRefund'

describe('refundAfterSeriesSessionCancel residual (IB-47)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tx.$queryRaw.mockResolvedValue(undefined)
    tx.walletTransaction.findFirst.mockResolvedValue(null)
    tx.clubWalletTransaction.findFirst.mockResolvedValue(null)
    clawbackOwnerPartialForPayment.mockResolvedValue(undefined)
    creditWallet.mockResolvedValue(undefined)
    tx.payment.update.mockResolvedValue({})
  })

  it('credits primary residual when all sessions already cancelled and primary is in sessionRefundedBookingIds', async () => {
    const primaryBookingId = 'primary-1'
    const primaryPaymentId = 'pay-primary'
    const meta = {
      groupPrimaryBookingId: primaryBookingId,
      groupSiblingBookingIds: ['sib-1'],
      sessionPrice: 12000,
      sessionRefundsTotal: 144000,
      sessionRefundedBookingIds: [primaryBookingId, 'sib-1'],
    }

    const { prisma } = await import('./prisma')
    vi.mocked(prisma.payment.findUnique).mockImplementation(async (args: { where: { bookingId?: string } }) => {
      if (args.where.bookingId === primaryBookingId) {
        return {
          id: primaryPaymentId,
          bookingId: primaryBookingId,
          amount: 360000,
          status: 'PAID',
          method: 'IPG',
          metadataJson: JSON.stringify(meta),
        } as never
      }
      return null
    })
    vi.mocked(prisma.booking.count).mockResolvedValue(0)
    vi.mocked(prisma.booking.findUnique).mockResolvedValue({ paymentMethod: 'IPG' } as never)

    tx.payment.findUniqueOrThrow.mockResolvedValue({
      id: primaryPaymentId,
      amount: 360000,
      status: 'PAID',
      method: 'IPG',
      metadataJson: JSON.stringify(meta),
    })

    const result = await refundAfterSeriesSessionCancel({
      cancelledBookingId: primaryBookingId,
      userId: 'user-1',
      reason: 'series-primary-residual-sweep',
      moneyOutcome: 'full_wallet_refund',
    })

    expect(result?.amount).toBe(216000)
    expect(result?.walletCredited).toBe(true)
    expect(creditWallet).toHaveBeenCalledWith(
      'user-1',
      216000,
      expect.objectContaining({ note: `series-primary-residual:${primaryPaymentId}` }),
      tx,
    )
    const updateArg = tx.payment.update.mock.calls[0]?.[0]
    expect(updateArg?.data?.status).toBe('REFUNDED')
  })
})