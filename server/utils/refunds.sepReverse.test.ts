import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const update = vi.fn()
const rootUpdate = vi.fn()
const walletTransaction = {
  findFirst: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue([]),
  count: vi.fn().mockResolvedValue(0),
}
const wallet = { findUnique: vi.fn().mockResolvedValue(null) }
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
  payment: { findUnique, update },
  booking: { findUnique: vi.fn() },
  walletTransaction,
  wallet,
}))
const sepReverseTransaction = vi.fn()
const creditWallet = vi.fn()
const clawbackOwnerForPayment = vi.fn().mockResolvedValue({ clawed: true })
const clawbackOwnerPartialForPayment = vi.fn()
const syncPaymentToParent = vi.fn()
vi.mock('./prisma', () => ({
  prisma: {
    payment: { findUnique, update: rootUpdate },
    booking: { findUnique: vi.fn() },
    walletTransaction,
    wallet,
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
  creditOwnerForPaidPayment: vi.fn().mockResolvedValue({ credited: false, reason: 'already_settled' }),
}))
vi.mock('./paymentSync', () => ({
  syncPaymentToParent: (...args: unknown[]) => syncPaymentToParent(...args),
}))
vi.mock('#shared/payments.ts', () => ({
  getPaymentsMode: () => 'live',
}))

function paidIpg(metadata: Record<string, unknown>, amount = 200_000) {
  findUnique.mockResolvedValue({
    id: 'pay-1',
    amount,
    status: 'PAID',
    method: 'IPG',
    provider: 'sep',
    userId: 'ath-1',
    bookingId: 'b-1',
    metadataJson: JSON.stringify(metadata),
    booking: { paymentMethod: 'IPG', userId: 'ath-1', guestMobile: null },
  })
}

describe('ordinary online cancel credits the wallet and does not reverse the card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SEP_TERMINAL_ID = '12345678'
    update.mockResolvedValue({})
    rootUpdate.mockResolvedValue({})
    creditWallet.mockResolvedValue({})
  })

  it('credits the wallet immediately after confirm and never calls ReverseTransaction', async () => {
    paidIpg({ refNum: 'REF999', confirmedAt: new Date().toISOString() })
    const { refundPaymentForCancellation } = await import('./refunds')
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'athlete-cancel',
      moneyOutcome: 'full_wallet_refund',
    })
    expect(sepReverseTransaction).not.toHaveBeenCalled()
    expect(result.gatewayRefunded).toBe(false)
    expect(result.walletCredited).toBe(true)
    expect(result.refundChannel).toBe('wallet_closed_loop')
    expect(creditWallet).toHaveBeenCalledWith('ath-1', 200_000, expect.objectContaining({
      type: 'REFUND_CREDIT',
      paymentId: 'pay-1',
    }), expect.anything())
    expect(clawbackOwnerForPayment).toHaveBeenCalledWith('pay-1', expect.anything())
  })

  it('still credits the wallet long after confirm', async () => {
    paidIpg({
      refNum: 'REF999',
      confirmedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    })
    const { refundPaymentForCancellation } = await import('./refunds')
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'athlete-cancel',
    })
    expect(sepReverseTransaction).not.toHaveBeenCalled()
    expect(result.walletCredited).toBe(true)
    expect(creditWallet).toHaveBeenCalledWith('ath-1', 200_000, expect.anything(), expect.anything())
  })

  it('partial cancel credits only that share and claws back partially', async () => {
    paidIpg({ refNum: 'REF999', confirmedAt: new Date().toISOString() })
    const { refundPaymentForCancellation } = await import('./refunds')
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'athlete-cancel',
      moneyOutcome: 'partial_wallet_refund',
      refundBps: 5000,
    })
    expect(sepReverseTransaction).not.toHaveBeenCalled()
    expect(result.amount).toBe(100_000)
    expect(creditWallet).toHaveBeenCalledWith('ath-1', 100_000, expect.anything(), expect.anything())
    expect(clawbackOwnerPartialForPayment).toHaveBeenCalledWith(expect.objectContaining({
      grossRefundAmount: 100_000,
    }))
    expect(clawbackOwnerForPayment).not.toHaveBeenCalled()
  })

  it('credits the full split price, not only the card share', async () => {
    paidIpg({
      refNum: 'REF999',
      confirmedAt: new Date().toISOString(),
      splitPay: true,
      walletDebitAmount: 40_000,
      ipgChargeAmount: 160_000,
      splitFullAmount: 200_000,
    })
    const { refundPaymentForCancellation } = await import('./refunds')
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'athlete-cancel',
    })
    expect(sepReverseTransaction).not.toHaveBeenCalled()
    expect(result.walletCredited).toBe(true)
    expect(creditWallet).toHaveBeenCalledWith('ath-1', 200_000, expect.anything(), expect.anything())
  })

  it('does not credit a second time after the payment is already refunded', async () => {
    findUnique.mockResolvedValue({
      id: 'pay-1',
      amount: 200_000,
      status: 'REFUNDED',
      method: 'IPG',
      provider: 'sep',
      userId: 'ath-1',
      bookingId: 'b-1',
      metadataJson: '{}',
      booking: { paymentMethod: 'IPG', userId: 'ath-1', guestMobile: null },
    })
    const { refundPaymentForCancellation } = await import('./refunds')
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'retry',
    })
    expect(result.refunded).toBe(false)
    expect(creditWallet).not.toHaveBeenCalled()
    expect(sepReverseTransaction).not.toHaveBeenCalled()
  })

  it('does not credit the card amount again when that capture was already reversed', async () => {
    paidIpg({
      refNum: 'REF999',
      confirmedAt: new Date().toISOString(),
      gatewayReversed: true,
      splitPay: true,
      walletDebitAmount: 40_000,
      splitFullAmount: 200_000,
    })
    const { refundPaymentForCancellation } = await import('./refunds')
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'athlete-cancel',
    })
    expect(sepReverseTransaction).not.toHaveBeenCalled()
    expect(result.gatewayRefunded).toBe(true)
    expect(result.refundChannel).toBe('gateway_reverse')
    expect(creditWallet).toHaveBeenCalledWith('ath-1', 40_000, expect.anything(), expect.anything())
    expect(creditWallet).not.toHaveBeenCalledWith('ath-1', 200_000, expect.anything(), expect.anything())
  })

  it('refuses the wallet credit while a historical reverse is still pending', async () => {
    paidIpg({
      refNum: 'REF999',
      confirmedAt: new Date().toISOString(),
      reversePending: true,
    })
    const { refundPaymentForCancellation } = await import('./refunds')
    await expect(refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'athlete-cancel',
    })).rejects.toMatchObject({ statusMessage: 'SEP_REVERSE_PENDING' })
    expect(creditWallet).not.toHaveBeenCalled()
    expect(sepReverseTransaction).not.toHaveBeenCalled()
    expect(clawbackOwnerForPayment).not.toHaveBeenCalled()
  })

  it('refuses an online refund when no account can receive the wallet credit', async () => {
    findUnique.mockResolvedValue({
      id: 'pay-1',
      amount: 200_000,
      status: 'PAID',
      method: 'IPG',
      provider: 'sep',
      userId: null,
      bookingId: 'b-1',
      metadataJson: JSON.stringify({ refNum: 'REF999', confirmedAt: new Date().toISOString() }),
      booking: { paymentMethod: 'IPG', userId: null, guestMobile: '09120000000' },
    })
    const { refundPaymentForCancellation } = await import('./refunds')
    await expect(refundPaymentForCancellation({
      paymentId: 'pay-1',
      reason: 'guest-cancel',
    })).rejects.toMatchObject({ statusMessage: 'REFUND_ACCOUNT_REQUIRED' })
    expect(creditWallet).not.toHaveBeenCalled()
    expect(sepReverseTransaction).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps desk cash out of the athlete wallet', async () => {
    findUnique.mockResolvedValue({
      id: 'pay-1',
      amount: 200_000,
      status: 'PAID',
      method: 'CASH',
      provider: 'pay_at_club',
      userId: 'ath-1',
      bookingId: 'b-1',
      metadataJson: '{}',
      booking: { paymentMethod: 'CASH', userId: 'ath-1', guestMobile: null },
    })
    const { refundPaymentForCancellation } = await import('./refunds')
    const result = await refundPaymentForCancellation({
      paymentId: 'pay-1',
      userId: 'ath-1',
      reason: 'owner-cancel',
    })
    expect(sepReverseTransaction).not.toHaveBeenCalled()
    expect(result.walletCredited).toBe(false)
    expect(result.refundChannel).toBe('desk_cash')
    expect(result.deskCashReturn).toBe('owed')
    expect(creditWallet).not.toHaveBeenCalled()
  })
})
