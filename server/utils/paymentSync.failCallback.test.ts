import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GATEWAY_CALLBACK_ABANDON_FAIL_REASON } from '#shared/onlinePaymentHold.ts'

const paymentFindFirst = vi.fn()
const paymentUpdateMany = vi.fn()
const paymentFindUnique = vi.fn()
const bookingUpdate = vi.fn()
const bookingFindUnique = vi.fn()
const releaseSplitWalletDebit = vi.fn()

vi.mock('./splitPayWallet', () => ({
  releaseSplitWalletDebit: (...args: unknown[]) => releaseSplitWalletDebit(...args),
}))
vi.mock('./contactSync', () => ({ syncClubContactForBooking: vi.fn() }))
vi.mock('./onlinePaymentHold', () => ({ promoteOnlineHoldOnPaid: vi.fn() }))

vi.stubGlobal('prisma', {
  payment: {
    findFirst: (...args: unknown[]) => paymentFindFirst(...args),
    updateMany: (...args: unknown[]) => paymentUpdateMany(...args),
    findUnique: (...args: unknown[]) => paymentFindUnique(...args),
  },
  booking: {
    update: (...args: unknown[]) => bookingUpdate(...args),
    findUnique: (...args: unknown[]) => bookingFindUnique(...args),
  },
})

const { markPaymentFailedAndSync } = await import('./paymentSync')

describe('markPaymentFailedAndSync (gateway abandon)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    releaseSplitWalletDebit.mockResolvedValue(undefined)
    bookingFindUnique.mockResolvedValue({
      id: 'b1',
      status: 'PENDING',
      paymentStatus: 'PENDING_ONLINE',
    })
    bookingUpdate.mockResolvedValue({ id: 'b1' })
    paymentUpdateMany.mockResolvedValue({ count: 1 })
  })

  it('marks payment FAILED with gateway abandon metadata and syncs booking paymentStatus only', async () => {
    const row = {
      id: 'pay-1',
      status: 'PENDING_ONLINE',
      bookingId: 'b1',
      purpose: 'booking',
      metadataJson: null,
      gatewayRef: null,
      method: 'NOT_PAID',
    }
    paymentFindFirst.mockResolvedValue(row)
    paymentFindUnique.mockResolvedValue({ ...row, status: 'FAILED' })

    await markPaymentFailedAndSync('INB-1', 'sep', { failReason: GATEWAY_CALLBACK_ABANDON_FAIL_REASON })

    expect(paymentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          metadataJson: expect.stringContaining(GATEWAY_CALLBACK_ABANDON_FAIL_REASON),
        }),
      }),
    )
    expect(releaseSplitWalletDebit).toHaveBeenCalledWith('pay-1')
    expect(paymentFindUnique).toHaveBeenCalled()
  })

  it('does not downgrade PAID payment', async () => {
    paymentFindFirst.mockResolvedValue({
      id: 'pay-1',
      status: 'PAID',
      bookingId: 'b1',
      purpose: 'booking',
    })
    await markPaymentFailedAndSync('INB-1', 'sep', { failReason: GATEWAY_CALLBACK_ABANDON_FAIL_REASON })
    expect(paymentUpdateMany).not.toHaveBeenCalled()
  })
})