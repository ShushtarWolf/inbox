import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const bookingFindUnique = vi.fn()
const update = vi.fn()
const creditWallet = vi.fn()
const syncPaymentToParent = vi.fn()
const clawbackOwnerForPayment = vi.fn()
const creditOwnerForPaidPayment = vi.fn()
const walletTxFindFirst = vi.fn()
const walletTxFindMany = vi.fn()
const walletTxCount = vi.fn()
const walletFindUnique = vi.fn()
const walletTransaction = {
  findFirst: (...args: unknown[]) => walletTxFindFirst(...args),
  findMany: (...args: unknown[]) => walletTxFindMany(...args),
  count: (...args: unknown[]) => walletTxCount(...args),
}
const wallet = { findUnique: (...args: unknown[]) => walletFindUnique(...args) }
const tx = {
  payment: {
    update: (...args: unknown[]) => update(...args),
    findUnique: (...args: unknown[]) => findUnique(...args),
  },
  booking: { findUnique: (...args: unknown[]) => bookingFindUnique(...args) },
  walletTransaction,
  wallet,
}

vi.mock('./prisma', () => ({
  prisma: {
    payment: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
    booking: {
      findUnique: (...args: unknown[]) => bookingFindUnique(...args),
    },
    get walletTransaction() { return walletTransaction },
    get wallet() { return wallet },
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
  creditOwnerForPaidPayment: (...args: unknown[]) => creditOwnerForPaidPayment(...args),
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
    bookingFindUnique.mockResolvedValue(null)
    update.mockResolvedValue({ ...sepPaid, status: 'REFUNDED' })
    creditWallet.mockResolvedValue({})
    syncPaymentToParent.mockResolvedValue(undefined)
    clawbackOwnerForPayment.mockResolvedValue({ clawed: true })
    creditOwnerForPaidPayment.mockResolvedValue({ credited: false, reason: 'already_settled' })
    walletTxFindFirst.mockResolvedValue(null)
    walletTxFindMany.mockResolvedValue([])
    walletTxCount.mockResolvedValue(0)
    walletFindUnique.mockResolvedValue(null)
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

  it('booking paymentMethod CASH when payment row drifted: no wallet credit', async () => {
    findUnique.mockResolvedValue({
      id: 'pay-drift',
      amount: 400000,
      status: 'PAID',
      method: 'NOT_PAID',
      provider: 'pay_at_club',
      providerRef: null,
      metadataJson: null,
      booking: { paymentMethod: 'CASH' },
    })
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-drift',
      userId: 'user-1',
      reason: 'owner-cancel',
      bookingId: 'b1',
    })
    expect(creditWallet).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      walletCredited: false,
      refundChannel: 'desk_cash',
      deskCashReturn: 'owed',
    })
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

  it('IPG guest without a linked account does not complete the refund', async () => {
    findUnique.mockResolvedValue({
      ...sepPaid,
      userId: null,
      bookingId: 'b1',
      booking: { paymentMethod: null, userId: null, guestMobile: '09120000000' },
    })
    bookingFindUnique.mockResolvedValue({ userId: null })
    await expect(refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: null,
      reason: 'owner-cancel',
      bookingId: 'b1',
    })).rejects.toMatchObject({ statusMessage: 'REFUND_ACCOUNT_REQUIRED' })
    expect(creditWallet).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('falls back to payment.userId when cancel userId is null', async () => {
    findUnique.mockResolvedValue({ ...sepPaid, userId: 'payer-1', booking: null })
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: null,
      reason: 'owner-cancel',
      bookingId: 'b1',
    })
    expect(creditWallet).toHaveBeenCalledWith(
      'payer-1',
      400000,
      expect.objectContaining({ type: 'REFUND_CREDIT' }),
      tx,
    )
    expect(result.walletCredited).toBe(true)
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

  describe('wallet-paid cancel never strands money', () => {
    const walletPaid = (metadata: Record<string, unknown> | null) => ({
      id: 'pay-w',
      amount: 5000,
      status: 'PAID',
      method: 'PAID',
      provider: 'pay_at_club',
      providerRef: null,
      userId: null,
      bookingId: 'b1',
      metadataJson: metadata ? JSON.stringify(metadata) : null,
      booking: { paymentMethod: 'PAID', userId: 'user-1', guestMobile: null },
    })

    it('stale gateway flags from an earlier IPG attempt do not block the wallet credit', async () => {
      findUnique.mockResolvedValue(walletPaid({ gatewayReversed: true, gatewayRefund: true }))
      const result = await refundPaymentForCancellation({
        paymentId: 'pay-w',
        userId: 'user-1',
        reason: 'owner-cancel',
        bookingId: 'b1',
        moneyOutcome: 'full_wallet_refund',
      })
      expect(creditWallet).toHaveBeenCalledWith('user-1', 5000, expect.objectContaining({ type: 'REFUND_CREDIT' }), tx)
      expect(result.walletCredited).toBe(true)
      expect(result.gatewayRefunded).toBe(false)
      expect(result.refundChannel).toBe('wallet_closed_loop')
    })

    it('stale reversePending on a wallet row does not refuse the owner cancel', async () => {
      findUnique.mockResolvedValue(walletPaid({ reversePending: true }))
      const result = await refundPaymentForCancellation({
        paymentId: 'pay-w',
        userId: 'user-1',
        reason: 'owner-cancel',
        bookingId: 'b1',
      })
      expect(result.walletCredited).toBe(true)
    })

    it('credits the wallet that was actually debited, not a re-linked booking user', async () => {
      findUnique.mockResolvedValue(walletPaid(null))
      walletTxFindFirst.mockResolvedValue({ wallet: { userId: 'payer-7' } })
      await refundPaymentForCancellation({
        paymentId: 'pay-w',
        userId: 'someone-else',
        reason: 'owner-cancel',
        bookingId: 'b1',
      })
      expect(creditWallet).toHaveBeenCalledWith('payer-7', 5000, expect.anything(), tx)
    })

    it('settles the club (idempotent) before refunding so finance shows credit + clawback', async () => {
      findUnique.mockResolvedValue(walletPaid(null))
      await refundPaymentForCancellation({ paymentId: 'pay-w', userId: 'user-1', reason: 'owner-cancel', bookingId: 'b1' })
      expect(creditOwnerForPaidPayment).toHaveBeenCalledWith('pay-w', undefined, tx)
      expect(clawbackOwnerForPayment).toHaveBeenCalledWith('pay-w', tx)
    })

    it('zero refund still puts the kept money on the club books', async () => {
      findUnique.mockResolvedValue(walletPaid(null))
      const result = await refundPaymentForCancellation({
        paymentId: 'pay-w',
        userId: 'user-1',
        reason: 'athlete-cancel',
        moneyOutcome: 'zero_refund',
      })
      expect(result.refunded).toBe(false)
      expect(creditWallet).not.toHaveBeenCalled()
      expect(creditOwnerForPaidPayment).toHaveBeenCalledWith('pay-w', undefined, expect.anything())
    })

    it('fails the whole cancel when a full refund would leave the payer wallet short', async () => {
      findUnique.mockResolvedValue(walletPaid(null))
      walletFindUnique.mockResolvedValue({ id: 'w1' })
      walletTxCount.mockResolvedValue(1)
      // Debit is on the books but the credit went nowhere visible in this wallet.
      walletTxFindMany.mockResolvedValue([{ type: 'PAYMENT_DEBIT', amount: -5000 }])
      await expect(refundPaymentForCancellation({
        paymentId: 'pay-w',
        userId: 'user-1',
        reason: 'owner-cancel',
        bookingId: 'b1',
      })).rejects.toMatchObject({ statusMessage: 'WALLET_REFUND_INCOMPLETE' })
      expect(update).not.toHaveBeenCalled()
      expect(clawbackOwnerForPayment).not.toHaveBeenCalled()
    })

    it('passes when debit and refund credit net to zero', async () => {
      findUnique.mockResolvedValue(walletPaid(null))
      walletFindUnique.mockResolvedValue({ id: 'w1' })
      walletTxCount.mockResolvedValue(1)
      walletTxFindMany.mockResolvedValue([
        { type: 'PAYMENT_DEBIT', amount: -5000 },
        { type: 'REFUND_CREDIT', amount: 5000 },
      ])
      const result = await refundPaymentForCancellation({ paymentId: 'pay-w', userId: 'user-1', reason: 'owner-cancel', bookingId: 'b1' })
      expect(result.refunded).toBe(true)
    })
  })
})
