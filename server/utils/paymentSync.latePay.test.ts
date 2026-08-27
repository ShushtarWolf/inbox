import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findFirst = vi.fn()
const findUnique = vi.fn()
const confirm = vi.fn()
const refundPaymentForCancellation = vi.fn()
const creditWalletForTopUpPayment = vi.fn()
const creditOwnerForPaidPayment = vi.fn()

vi.stubGlobal('prisma', {
  payment: {
    findFirst: (...args: unknown[]) => findFirst(...args),
    findUnique: (...args: unknown[]) => findUnique(...args),
  },
  booking: {
    findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'CANCELLED' }),
  },
})

vi.mock('./payments/service', () => ({
  getPaymentService: () => ({ confirm: (...args: unknown[]) => confirm(...args) }),
}))

vi.mock('./refunds', () => ({
  refundPaymentForCancellation: (...args: unknown[]) => refundPaymentForCancellation(...args),
}))

vi.mock('./wallet', () => ({
  creditWalletForTopUpPayment: (...args: unknown[]) => creditWalletForTopUpPayment(...args),
}))

vi.mock('./settlement', () => ({
  creditOwnerForPaidPayment: (...args: unknown[]) => creditOwnerForPaidPayment(...args),
}))

vi.mock('./competitions', () => ({
  confirmEntryFromPayment: vi.fn(),
}))

vi.mock('./onlinePaymentHold', () => ({
  promoteOnlineHoldOnPaid: vi.fn(),
}))

vi.mock('./contactSync', () => ({
  syncClubContactForBooking: vi.fn(),
}))

vi.mock('./bookingNotify', () => ({
  clubNotifyName: vi.fn(),
  courtNotifyName: vi.fn(),
  notifyBookingPaid: vi.fn(),
  notifyOwnerBookingPaid: vi.fn(),
  ownerNotifyPhone: vi.fn(),
  personNotifyName: vi.fn(),
}))

vi.mock('./adminNotify', () => ({
  notifyAdminWalletTopUp: vi.fn(),
}))

import { confirmPaymentAndSync } from './paymentSync'

describe('confirmPaymentAndSync late pay after cancelled hold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refundPaymentForCancellation.mockResolvedValue({ refunded: true, walletCredited: false, amount: 100 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('verifies then refunds when booking is CANCELLED and payment pending', async () => {
    findFirst.mockResolvedValue({
      id: 'pay-1',
      amount: 100000,
      status: 'PENDING_ONLINE',
      provider: 'sep',
      providerRef: 'INBref',
      userId: 'user-1',
      purpose: 'booking',
      booking: { id: 'b1', status: 'CANCELLED', userId: 'user-1' },
    })
    confirm.mockResolvedValue({
      id: 'pay-1',
      amount: 100000,
      status: 'PAID',
      provider: 'sep',
      providerRef: 'INBref',
    })
    findUnique.mockResolvedValue({
      id: 'pay-1',
      amount: 100000,
      status: 'REFUNDED',
      provider: 'sep',
      providerRef: 'INBref',
    })

    const result = await confirmPaymentAndSync('INBref', 'sep', { refNum: '9911' })

    expect(confirm).toHaveBeenCalledWith('INBref', { refNum: '9911' })
    expect(refundPaymentForCancellation).toHaveBeenCalledWith({
      paymentId: 'pay-1',
      userId: 'user-1',
      reason: 'Late pay after cancelled hold',
      bookingId: 'b1',
    })
    expect(creditOwnerForPaidPayment).not.toHaveBeenCalled()
    expect(creditWalletForTopUpPayment).not.toHaveBeenCalled()
    expect(result.status).toBe('REFUNDED')
  })

  it('refunds immediately when payment already PAID against cancelled booking', async () => {
    findFirst.mockResolvedValue({
      id: 'pay-1',
      amount: 100000,
      status: 'PAID',
      provider: 'sep',
      providerRef: 'INBref',
      userId: 'user-1',
      purpose: 'booking',
      booking: { id: 'b1', status: 'CANCELLED', userId: 'user-1' },
    })
    findUnique.mockResolvedValue({
      id: 'pay-1',
      amount: 100000,
      status: 'REFUNDED',
      provider: 'sep',
      providerRef: 'INBref',
    })

    const result = await confirmPaymentAndSync('INBref', 'sep')

    expect(confirm).not.toHaveBeenCalled()
    expect(refundPaymentForCancellation).toHaveBeenCalled()
    expect(result.status).toBe('REFUNDED')
  })

  it('returns early for already FAILED or REFUNDED without re-confirm', async () => {
    findFirst.mockResolvedValue({
      id: 'pay-1',
      amount: 100000,
      status: 'FAILED',
      provider: 'sep',
      providerRef: 'INBref',
      userId: 'user-1',
      booking: { id: 'b1', status: 'CANCELLED', userId: 'user-1' },
    })

    const result = await confirmPaymentAndSync('INBref', 'sep')

    expect(confirm).not.toHaveBeenCalled()
    expect(refundPaymentForCancellation).not.toHaveBeenCalled()
    expect(result.status).toBe('FAILED')
  })
})
