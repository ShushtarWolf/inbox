import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const update = vi.fn()
const rootUpdate = vi.fn()
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
  payment: { findUnique, update },
  booking: { findUnique: vi.fn() },
}))
const sepReverseTransaction = vi.fn()
const creditWallet = vi.fn()
const clawbackOwnerForPayment = vi.fn().mockResolvedValue({ clawed: true })
const clawbackOwnerPartialForPayment = vi.fn()
const syncPaymentToParent = vi.fn()
const findUserIdByPhone = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    payment: { findUnique, update: rootUpdate },
    booking: { findUnique: vi.fn() },
    $transaction: transaction,
  },
}))
vi.mock('./payments/sepClient', () => ({
  sepReverseTransaction: (...args: unknown[]) => sepReverseTransaction(...args),
}))
vi.mock('./wallet', () => ({
  creditWallet: (...args: unknown[]) => creditWallet(...args),
}))
vi.mock('./settlement', () => ({
  clawbackOwnerForPayment: (...args: unknown[]) => clawbackOwnerForPayment(...args),
  clawbackOwnerPartialForPayment: (...args: unknown[]) => clawbackOwnerPartialForPayment(...args),
}))
vi.mock('./paymentSync', () => ({
  syncPaymentToParent: (...args: unknown[]) => syncPaymentToParent(...args),
}))
vi.mock('./phoneAuth', () => ({
  findUserIdByPhone: (...args: unknown[]) => findUserIdByPhone(...args),
}))
vi.mock('#shared/payments.ts', () => ({
  getPaymentsMode: () => 'live',
}))

describe('refundPaymentForCancellation SEP reverse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SEP_TERMINAL_ID = '12345678'
    findUnique.mockResolvedValue({
      id: 'pay-1',
      amount: 200_000,
      status: 'PAID',
      method: 'IPG',
      provider: 'sep',
      userId: 'ath-1',
      bookingId: 'b-1',
      metadataJson: JSON.stringify({
        refNum: 'REF999',
        confirmedAt: new Date().toISOString(),
      }),
      booking: { paymentMethod: 'IPG', userId: 'ath-1', guestMobile: null },
    })
    update.mockResolvedValue({})
    rootUpdate.mockResolvedValue({})
  })

  it('gateway reverse path: no athlete wallet credit', async () => {
    sepReverseTransaction.mockResolvedValue({})
    const { refundPaymentForCancellation } = await import('./refunds')
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'athlete-cancel',
      moneyOutcome: 'full_wallet_refund',
    })
    expect(sepReverseTransaction).toHaveBeenCalled()
    expect(result.gatewayRefunded).toBe(true)
    expect(result.walletCredited).toBe(false)
    expect(creditWallet).not.toHaveBeenCalled()
    expect(clawbackOwnerForPayment).toHaveBeenCalled()
  })

  it('falls back to wallet on definitive SEP reverse failure', async () => {
    sepReverseTransaction.mockRejectedValue(new Error('SEP reverse failed (code=5): not allowed'))
    const { refundPaymentForCancellation } = await import('./refunds')
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'athlete-cancel',
      moneyOutcome: 'full_wallet_refund',
    })
    expect(result.gatewayRefunded).toBe(false)
    expect(result.walletCredited).toBe(true)
    expect(creditWallet).toHaveBeenCalled()
  })

  it('does not wallet-fallback on ambiguous reverse timeout', async () => {
    sepReverseTransaction.mockRejectedValue(new Error('fetch failed: timeout'))
    const { refundPaymentForCancellation } = await import('./refunds')
    await expect(refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'athlete-cancel',
      moneyOutcome: 'full_wallet_refund',
    })).rejects.toMatchObject({ statusMessage: 'SEP_REVERSE_PENDING' })
    expect(creditWallet).not.toHaveBeenCalled()
    expect(rootUpdate).toHaveBeenCalled()
  })
})
