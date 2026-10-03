import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const update = vi.fn()
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
  beforeEach(() => {
    findUnique.mockResolvedValue(sepPaid)
    update.mockResolvedValue({ ...sepPaid, status: 'REFUNDED' })
    creditWallet.mockResolvedValue({})
    syncPaymentToParent.mockResolvedValue(undefined)
    clawbackOwnerForPayment.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('IPG cancel: wallet credit (closed-loop), no gateway reverse required', async () => {
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'user-1',
      reason: 'cancel',
      bookingId: 'b1',
    })
    expect(creditWallet).toHaveBeenCalledWith(
      'user-1',
      400000,
      expect.objectContaining({ paymentId: 'pay-1', bookingId: 'b1' }),
    )
    expect(clawbackOwnerForPayment).toHaveBeenCalledWith('pay-1')
    expect(result).toMatchObject({ refunded: true, walletCredited: true, gatewayRefunded: false, amount: 400000 })
  })

  it('zero_refund: no credit and no clawback', async () => {
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'user-1',
      reason: 'cancel',
      moneyOutcome: 'zero_refund',
    })
    expect(creditWallet).not.toHaveBeenCalled()
    expect(clawbackOwnerForPayment).not.toHaveBeenCalled()
    expect(result).toMatchObject({ refunded: false, walletCredited: false, amount: 0 })
  })

  it('wallet PAID cancel: credit wallet', async () => {
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
    expect(creditWallet).toHaveBeenCalled()
    expect(result.walletCredited).toBe(true)
  })

  it('cash cancel: do not mint wallet credit, still clawback if settled', async () => {
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
    expect(creditWallet).not.toHaveBeenCalled()
    expect(clawbackOwnerForPayment).toHaveBeenCalledWith('pay-cash')
    expect(result.walletCredited).toBe(false)
    expect(result.refunded).toBe(true)
  })
})
