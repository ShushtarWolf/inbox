import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const update = vi.fn()
const creditWallet = vi.fn()
const syncPaymentToParent = vi.fn()
const clawbackOwnerForPayment = vi.fn()
const tx = {
  payment: { update: (...args: unknown[]) => update(...args) },
}

vi.mock('./prisma', () => ({
  prisma: {
    payment: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
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
    clawbackOwnerForPayment.mockResolvedValue({ clawed: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('IPG cancel: closed-loop wallet credit + clawback in one path; no gateway reverse', async () => {
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'user-1',
      reason: 'cancel',
      bookingId: 'b1',
    })
    expect(creditWallet).toHaveBeenCalledWith(
      'user-1',
      400000,
      expect.objectContaining({ paymentId: 'pay-1', bookingId: 'b1', type: 'REFUND_CREDIT' }),
      tx,
    )
    expect(clawbackOwnerForPayment).toHaveBeenCalledWith('pay-1', tx)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pay-1' },
      data: expect.objectContaining({
        status: 'REFUNDED',
        metadataJson: expect.stringContaining('wallet_closed_loop'),
      }),
    }))
    expect(result).toMatchObject({
      refunded: true,
      walletCredited: true,
      gatewayRefunded: false,
      amount: 400000,
      refundChannel: 'wallet_closed_loop',
    })
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
    expect(result.refundChannel).toBe('wallet_closed_loop')
  })

  it('cash cancel: no wallet credit; deskCashReturn owed; still clawback', async () => {
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
    expect(clawbackOwnerForPayment).toHaveBeenCalledWith('pay-cash', tx)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadataJson: expect.stringMatching(/desk_cash.*"deskCashReturn":"owed"/s),
      }),
    }))
    expect(result).toMatchObject({
      walletCredited: false,
      refunded: true,
      refundChannel: 'desk_cash',
      deskCashReturn: 'owed',
      gatewayRefunded: false,
    })
  })

  it('IPG guest without wallet: flags manual bank refund instead of silently dropping money', async () => {
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: null,
      reason: 'owner-cancel',
      bookingId: 'b1',
    })
    expect(creditWallet).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadataJson: expect.stringContaining('"manualRefundRequired":true'),
      }),
    }))
    expect(result.walletCredited).toBe(false)
  })

  it('wallet credit failure: do not mark payment REFUNDED or clawback', async () => {
    creditWallet.mockRejectedValue(new Error('wallet down'))
    await expect(refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'user-1',
      reason: 'cancel',
      bookingId: 'b1',
    })).rejects.toThrow('wallet down')
    expect(update).not.toHaveBeenCalled()
    expect(clawbackOwnerForPayment).not.toHaveBeenCalled()
  })

  it('clawback failure rolls back — does not leave REFUNDED without clawback', async () => {
    clawbackOwnerForPayment.mockRejectedValue(new Error('clawback down'))
    await expect(refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'user-1',
      reason: 'cancel',
      bookingId: 'b1',
    })).rejects.toThrow('clawback down')
    // sync only after successful txn
    expect(syncPaymentToParent).not.toHaveBeenCalled()
  })
})
