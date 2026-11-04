import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const createMany = vi.fn()
const findMany = vi.fn()
const update = vi.fn()
const updateMany = vi.fn()
const ledgerFindUnique = vi.fn()
const walletTxFindFirst = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    payment: { findUnique: (...args: unknown[]) => findUnique(...args) },
    moneyJob: {
      createMany: (...args: unknown[]) => createMany(...args),
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => update(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
    settlementLedgerEntry: { findUnique: (...args: unknown[]) => ledgerFindUnique(...args) },
    walletTransaction: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: (...args: unknown[]) => walletTxFindFirst(...args),
    },
  },
}))

const creditOwnerForPaidPayment = vi.fn()
const creditWalletForTopUpPayment = vi.fn()
const promoteSplitPayAmountOnPaid = vi.fn()

vi.mock('./settlement', () => ({
  creditOwnerForPaidPayment: (...args: unknown[]) => creditOwnerForPaidPayment(...args),
}))

vi.mock('./wallet', () => ({
  creditWalletForTopUpPayment: (...args: unknown[]) => creditWalletForTopUpPayment(...args),
}))

vi.mock('./adminNotify', () => ({
  notifyAdminSms: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./splitPayWallet', () => ({

  promoteSplitPayAmountOnPaid: (...args: unknown[]) => promoteSplitPayAmountOnPaid(...args),
}))

import {
  enqueueMoneyJobsForPaidPayment,
  markMoneyJobsDoneForPaidPayment,
  processPendingMoneyJobs,
} from './moneyJobs'

describe('moneyJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createMany.mockResolvedValue({ count: 1 })
    update.mockResolvedValue({})
    updateMany.mockResolvedValue({ count: 1 })
    ledgerFindUnique.mockResolvedValue(null)
    walletTxFindFirst.mockResolvedValue(null)
  })

  it('enqueues SETTLE for PAID booking IPG payment', async () => {
    findUnique.mockResolvedValue({
      id: 'pay-1',
      status: 'PAID',
      purpose: 'booking',
      method: 'IPG',
    })

    const result = await enqueueMoneyJobsForPaidPayment('pay-1')

    expect(result.enqueued).toBe(1)
    expect(createMany).toHaveBeenCalledWith({
      data: [{ paymentId: 'pay-1', type: 'SETTLE', status: 'PENDING' }],
      skipDuplicates: true,
    })
  })

  it('enqueues TOPUP_CREDIT for PAID top-up', async () => {
    findUnique.mockResolvedValue({
      id: 'pay-t',
      status: 'PAID',
      purpose: 'topup',
      method: 'IPG',
    })

    await enqueueMoneyJobsForPaidPayment('pay-t')

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ type: 'TOPUP_CREDIT' })],
      }),
    )
  })

  it('ignores duplicate enqueue without throwing (safe inside a txn)', async () => {
    findUnique.mockResolvedValue({
      id: 'pay-1',
      status: 'PAID',
      purpose: 'booking',
      method: 'IPG',
    })
    createMany.mockResolvedValue({ count: 0 })

    const result = await enqueueMoneyJobsForPaidPayment('pay-1')

    expect(result.enqueued).toBe(0)
  })

  it('repeat callback (no ledger yet) must not close the SETTLE job', async () => {
    await markMoneyJobsDoneForPaidPayment('pay-1')
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('closes only the job whose effect exists', async () => {
    ledgerFindUnique.mockResolvedValue({ id: 'ledger-1' })
    await markMoneyJobsDoneForPaidPayment('pay-1')
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paymentId: 'pay-1', status: 'PENDING', type: { in: ['SETTLE'] } },
      }),
    )
  })

  it('processPendingMoneyJobs promotes split then marks SETTLE done when already settled', async () => {
    findMany.mockResolvedValue([
      { id: 'j1', paymentId: 'pay-1', type: 'SETTLE', attempts: 0 },
    ])
    findUnique.mockResolvedValue({ id: 'pay-1', status: 'PAID', purpose: 'booking', method: 'IPG' })
    creditOwnerForPaidPayment.mockResolvedValue({ credited: false, reason: 'already_settled' })

    const result = await processPendingMoneyJobs()

    expect(result.scanned).toBe(1)
    expect(promoteSplitPayAmountOnPaid).toHaveBeenCalledWith('pay-1')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'j1' },
        data: expect.objectContaining({ status: 'DONE' }),
      }),
    )
  })
})
