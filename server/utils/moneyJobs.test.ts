import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const create = vi.fn()
const findMany = vi.fn()
const update = vi.fn()
const updateMany = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    payment: { findUnique: (...args: unknown[]) => findUnique(...args) },
    moneyJob: {
      create: (...args: unknown[]) => create(...args),
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => update(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
    walletTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

const creditOwnerForPaidPayment = vi.fn()
const creditWalletForTopUpPayment = vi.fn()

vi.mock('./settlement', () => ({
  creditOwnerForPaidPayment: (...args: unknown[]) => creditOwnerForPaidPayment(...args),
}))

vi.mock('./wallet', () => ({
  creditWalletForTopUpPayment: (...args: unknown[]) => creditWalletForTopUpPayment(...args),
}))

import { enqueueMoneyJobsForPaidPayment, processPendingMoneyJobs } from './moneyJobs'

describe('moneyJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockResolvedValue({ id: 'job-1' })
    update.mockResolvedValue({})
    updateMany.mockResolvedValue({ count: 1 })
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
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { paymentId: 'pay-1', type: 'SETTLE', status: 'PENDING' },
      }),
    )
  })

  it('enqueues TOPUP_CREDIT for PAID top-up', async () => {
    findUnique.mockResolvedValue({
      id: 'pay-t',
      status: 'PAID',
      purpose: 'topup',
      method: 'IPG',
    })

    await enqueueMoneyJobsForPaidPayment('pay-t')

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'TOPUP_CREDIT' }),
      }),
    )
  })

  it('ignores duplicate enqueue (P2002)', async () => {
    findUnique.mockResolvedValue({
      id: 'pay-1',
      status: 'PAID',
      purpose: 'booking',
      method: 'IPG',
    })
    create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }))

    const result = await enqueueMoneyJobsForPaidPayment('pay-1')

    expect(result.enqueued).toBe(0)
  })

  it('processPendingMoneyJobs marks SETTLE done when already settled', async () => {
    findMany.mockResolvedValue([
      { id: 'j1', paymentId: 'pay-1', type: 'SETTLE', attempts: 0 },
    ])
    findUnique.mockResolvedValue({ id: 'pay-1', status: 'PAID', purpose: 'booking', method: 'IPG' })
    creditOwnerForPaidPayment.mockResolvedValue({ credited: false, reason: 'already_settled' })

    const result = await processPendingMoneyJobs()

    expect(result.scanned).toBe(1)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'j1' },
        data: expect.objectContaining({ status: 'DONE' }),
      }),
    )
  })
})
