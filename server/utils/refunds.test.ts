import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const update = vi.fn()
const refund = vi.fn()
const creditWallet = vi.fn()
const syncPaymentToParent = vi.fn()
const clawbackOwnerForPayment = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    payment: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}))

vi.mock('./payments/service', () => ({
  getPaymentService: () => ({ refund: (...args: unknown[]) => refund(...args) }),
}))

vi.mock('./wallet', () => ({
  creditWallet: (...args: unknown[]) => creditWallet(...args),
}))

vi.mock('./paymentSync', () => ({
  syncPaymentToParent: (...args: unknown[]) => syncPaymentToParent(...args),
}))

vi.mock('./settlement', () => ({
  clawbackOwnerForPayment: (...args: unknown[]) => clawbackOwnerForPayment(...args),
}))

import { refundPaymentForCancellation } from './refunds'

const sepPaid = {
  id: 'pay-1',
  amount: 400000,
  status: 'PAID',
  method: 'IPG',
  provider: 'sep',
  providerRef: 'INBreal',
  metadataJson: JSON.stringify({ refNum: '9911' }),
}

describe('refundPaymentForCancellation', () => {
  const prevMode = process.env.PAYMENTS_MODE

  beforeEach(() => {
    findUnique.mockResolvedValue(sepPaid)
    update.mockResolvedValue({ ...sepPaid, status: 'REFUNDED' })
    refund.mockResolvedValue({ status: 'REFUNDED' })
    creditWallet.mockResolvedValue({})
    syncPaymentToParent.mockResolvedValue(undefined)
    clawbackOwnerForPayment.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (prevMode === undefined) delete process.env.PAYMENTS_MODE
    else process.env.PAYMENTS_MODE = prevMode
  })

  it('test mode: local gateway refund plus wallet credit', async () => {
    process.env.PAYMENTS_MODE = 'test'
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'user-1',
      reason: 'cancel',
      bookingId: 'b1',
    })
    expect(refund).toHaveBeenCalledWith('pay-1')
    expect(creditWallet).toHaveBeenCalled()
    expect(result).toMatchObject({ refunded: true, walletCredited: true, amount: 400000 })
  })

  it('live SEP reverse success: no wallet credit', async () => {
    process.env.PAYMENTS_MODE = 'live'
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'user-1',
      reason: 'cancel',
      bookingId: 'b1',
    })
    expect(refund).toHaveBeenCalledWith('pay-1')
    expect(creditWallet).not.toHaveBeenCalled()
    expect(result).toMatchObject({ refunded: true, walletCredited: false })
  })

  it('live reverse failure: wallet fallback', async () => {
    process.env.PAYMENTS_MODE = 'live'
    refund.mockRejectedValue(new Error('SEP reverse failed'))
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'user-1',
      reason: 'cancel',
      bookingId: 'b1',
    })
    expect(creditWallet).toHaveBeenCalledWith(
      'user-1',
      400000,
      expect.objectContaining({ paymentId: 'pay-1' }),
    )
    expect(result).toMatchObject({ refunded: true, walletCredited: true })
  })

  it('wallet PAID cancel: credit wallet, skip SEP', async () => {
    process.env.PAYMENTS_MODE = 'live'
    findUnique.mockResolvedValue({
      id: 'pay-w',
      amount: 400000,
      status: 'PAID',
      method: 'PAID',
      provider: 'pay_at_club',
      providerRef: null,
      metadataJson: null,
    })
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-w',
      userId: 'user-1',
      reason: 'cancel',
      bookingId: 'b1',
    })
    expect(refund).not.toHaveBeenCalled()
    expect(creditWallet).toHaveBeenCalled()
    expect(result.walletCredited).toBe(true)
  })

  it('cash / pay_at_club cancel: do not mint wallet credit', async () => {
    process.env.PAYMENTS_MODE = 'live'
    findUnique.mockResolvedValue({
      id: 'pay-cash',
      amount: 400000,
      status: 'PAID',
      method: 'CASH',
      provider: 'pay_at_club',
      providerRef: null,
      metadataJson: null,
    })
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-cash',
      userId: 'user-1',
      reason: 'cancel',
      bookingId: 'b1',
    })
    expect(refund).not.toHaveBeenCalled()
    expect(creditWallet).not.toHaveBeenCalled()
    expect(result.walletCredited).toBe(false)
  })
})
