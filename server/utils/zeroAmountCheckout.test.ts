import { beforeEach, describe, expect, it, vi } from 'vitest'

const txBookingUpdateMany = vi.fn()
const runPaidBookkeepingThenNotify = vi.fn()
const syncPaymentToParent = vi.fn()
const syncCompetitionEntryOnPayment = vi.fn()
const enqueueMoneyJobsForPaidPayment = vi.fn()
const markMoneyJobsDoneForPaidPayment = vi.fn()
const creditOwnerForPaidPayment = vi.fn()
const claimPaymentPaid = vi.fn()
const getPaymentService = vi.fn()
const createIntent = vi.fn()

vi.mock('./paymentClaim', () => ({
  claimPaymentPaid: (...args: unknown[]) => claimPaymentPaid(...args),
}))
vi.mock('./paymentSync', () => ({
  runPaidBookkeepingThenNotify: (...args: unknown[]) => runPaidBookkeepingThenNotify(...args),
  syncPaymentToParent: (...args: unknown[]) => syncPaymentToParent(...args),
  syncCompetitionEntryOnPayment: (...args: unknown[]) => syncCompetitionEntryOnPayment(...args),
}))
vi.mock('./moneyJobs', () => ({
  enqueueMoneyJobsForPaidPayment: (...args: unknown[]) => enqueueMoneyJobsForPaidPayment(...args),
  markMoneyJobsDoneForPaidPayment: (...args: unknown[]) => markMoneyJobsDoneForPaidPayment(...args),
}))
vi.mock('./settlement', () => ({
  creditOwnerForPaidPayment: (...args: unknown[]) => creditOwnerForPaidPayment(...args),
}))
vi.mock('./payments/service', () => ({
  getPaymentService: (...args: unknown[]) => getPaymentService(...args),
}))

vi.stubGlobal('createError', (opts: { statusCode: number; statusMessage: string }) => {
  const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
  err.statusCode = opts.statusCode
  err.statusMessage = opts.statusMessage
  return err
})

vi.stubGlobal('prisma', {
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    booking: { updateMany: txBookingUpdateMany },
  }),
})

import { confirmZeroAmountCheckout } from './zeroAmountCheckout'
import { financeIncomeAmount } from '#shared/bookingPayment.ts'

describe('confirmZeroAmountCheckout', () => {
  const paidRow = {
    id: 'pay-zero',
    amount: 0,
    status: 'PAID',
    provider: 'sep',
    method: 'IPG',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    txBookingUpdateMany.mockResolvedValue({ count: 1 })
    claimPaymentPaid.mockResolvedValue({ claimed: true, payment: paidRow })
    runPaidBookkeepingThenNotify.mockImplementation(async (_id, _prev, steps) => {
      await steps()
    })
    getPaymentService.mockReturnValue({ createIntent })
    createIntent.mockResolvedValue({ paymentId: 'should-not-run' })
  })

  it('claims PAID without calling the SEP client and runs paid notify bookkeeping', async () => {
    const result = await confirmZeroAmountCheckout({
      paymentId: 'pay-zero',
      bookingId: 'b1',
      previousStatus: 'PENDING_ONLINE',
      existingMetadataJson: null,
    })

    expect(claimPaymentPaid).toHaveBeenCalledTimes(1)
    const meta = JSON.parse(String(claimPaymentPaid.mock.calls[0]![2].metadataJson))
    expect(meta.zeroAmountCheckout).toBe(true)
    expect(meta.gatewayCaptured).toBe(true)
    expect(runPaidBookkeepingThenNotify).toHaveBeenCalledWith(
      'pay-zero',
      'PENDING_ONLINE',
      expect.any(Function),
      { notify: true },
    )
    expect(syncPaymentToParent).toHaveBeenCalledWith('pay-zero')
    expect(creditOwnerForPaidPayment).toHaveBeenCalled()
    expect(createIntent).not.toHaveBeenCalled()
    expect(result.payment.status).toBe('PAID')
    expect(result.claimedNow).toBe(true)
  })

  it('is idempotent on retry when already PAID (notify skipped)', async () => {
    claimPaymentPaid.mockResolvedValue({ claimed: false, payment: paidRow })
    const result = await confirmZeroAmountCheckout({
      paymentId: 'pay-zero',
      bookingId: 'b1',
      previousStatus: 'PAID',
      existingMetadataJson: JSON.stringify({ zeroAmountCheckout: true }),
    })

    expect(runPaidBookkeepingThenNotify).toHaveBeenCalledWith(
      'pay-zero',
      'PAID',
      expect.any(Function),
      { notify: false },
    )
    expect(result.claimedNow).toBe(false)
  })
})

describe('checkout payable gate (server amount, not client)', () => {
  it('stored non-zero payment wins over zero recomputed fallback — not the zero checkout path', () => {
    const payable = financeIncomeAmount({ amount: 500_000 }, 0)
    expect(payable).toBe(500_000)
    expect(payable === 0).toBe(false)
  })

  it('stored zero is exactly zero (discount / complimentary)', () => {
    expect(financeIncomeAmount({ amount: 0 }, 600_000)).toBe(0)
  })
})