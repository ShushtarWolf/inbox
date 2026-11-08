import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isDefinitivePaymentFailure } from '#shared/paymentFailure.ts'

const h = vi.hoisted(() => ({
  row: {
    id: 'pay-1',
    amount: 100_000,
    status: 'PENDING_ONLINE',
    provider: 'sep',
    providerRef: 'INBorder',
    gatewayRef: null as string | null,
    metadataJson: '{}',
    userId: 'user-1',
    bookingId: 'book-1',
    purpose: 'booking',
    method: 'IPG',
  },
  clash: false,
}))

const verify = vi.fn()
const reverse = vi.fn()
const recollect = vi.fn()
const enqueue = vi.fn()

vi.mock('./payments/sepClient', () => ({
  isSepSimulatedRef: (ref: string) => String(ref).startsWith('SIM'),
  sepVerifyTransaction: (...args: unknown[]) => verify(...args),
  sepReverseTransaction: (...args: unknown[]) => reverse(...args),
}))

vi.mock('./splitPayWallet', () => ({
  SplitRecollectError: class SplitRecollectError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'SplitRecollectError'
    }
  },
  recollectReleasedSplitWallet: (...args: unknown[]) => recollect(...args),
}))

vi.mock('./moneyJobs', () => ({
  enqueueMoneyJobsForPaidPayment: (...args: unknown[]) => enqueue(...args),
}))

vi.mock('./walletFirstIpg', () => ({
  applyWalletFirstForConfirmedIpg: vi.fn(async () => ({ status: 'applied' })),
}))

function whereMatches(where: {
  id?: string
  status?: { in?: string[] } | string
  gatewayRef?: string | null
  OR?: Array<{ gatewayRef?: string | null }>
}) {
  if (where.id && where.id !== h.row.id) return false
  const status = h.row.status
  if (typeof where.status === 'string' && where.status !== status) return false
  if (where.status && typeof where.status === 'object' && where.status.in && !where.status.in.includes(status)) {
    return false
  }
  if (where.gatewayRef === null && h.row.gatewayRef) return false
  if (where.OR) {
    const ok = where.OR.some((clause) => (
      clause.gatewayRef === null ? h.row.gatewayRef == null : clause.gatewayRef === h.row.gatewayRef
    ))
    if (!ok) return false
  }
  return true
}

vi.mock('./prisma', () => {
  const updateMany = async ({ where, data }: { where: Parameters<typeof whereMatches>[0], data: Record<string, unknown> }) => {
    if (!whereMatches(where)) return { count: 0 }
    if (h.clash && data.gatewayRef) {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      })
    }
    Object.assign(h.row, data)
    return { count: 1 }
  }
  const prisma = {
    payment: {
      findFirst: async () => h.row,
      findUnique: async () => h.row,
      findUniqueOrThrow: async () => h.row,
      updateMany,
    },
    $queryRaw: async () => [],
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  }
  return { prisma }
})

import { confirmSepPayment } from './sepConfirm'
import { SplitRecollectError } from './splitPayWallet'
import { applyWalletFirstForConfirmedIpg } from './walletFirstIpg'

function okVerify(overrides: Record<string, unknown> = {}) {
  verify.mockResolvedValue({
    resultCode: 0,
    amount: 1_000_000,
    resNum: 'INBorder',
    maskedPan: '6037****',
    traceNo: 't1',
    ...overrides,
  })
}

describe('confirmSepPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PAYMENTS_MODE = 'live'
    process.env.SEP_TERMINAL_ID = '12345678'
    h.clash = false
    h.row.status = 'PENDING_ONLINE'
    h.row.gatewayRef = null
    h.row.amount = 100_000
    h.row.providerRef = 'INBorder'
    h.row.metadataJson = '{}'
    recollect.mockResolvedValue({ needed: false })
    reverse.mockResolvedValue({ success: true, resultCode: 0 })
    enqueue.mockResolvedValue({ enqueued: 1 })
    okVerify()
  })

  it('binds a matching verify and is idempotent once PAID', async () => {
    const intent = await confirmSepPayment('INBorder', { refNum: 'bank-ref-1' })
    expect(intent.status).toBe('PAID')
    expect(h.row.gatewayRef).toBe('bank-ref-1')
    expect(h.row.status).toBe('PAID')
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(applyWalletFirstForConfirmedIpg).toHaveBeenCalledTimes(1)

    verify.mockClear()
    const again = await confirmSepPayment('INBorder', { refNum: 'bank-ref-1' })
    expect(again.status).toBe('PAID')
    expect(verify).not.toHaveBeenCalled()
    expect(applyWalletFirstForConfirmedIpg).toHaveBeenCalledTimes(1)
  })

  it('does not pay or fail the row when the RefNum belongs to another ResNum', async () => {
    okVerify({ resultCode: 2, resNum: 'INBother', amount: 1_000_000 })
    await expect(confirmSepPayment('INBorder', { refNum: 'stolen-ref' })).rejects.toMatchObject({
      data: { code: 'SEP_VERIFY_FOREIGN_REF', definitive: false },
    })
    expect(h.row.status).toBe('PENDING_ONLINE')
    expect(h.row.gatewayRef).toBeNull()
    expect(reverse).not.toHaveBeenCalled()
    expect(isDefinitivePaymentFailure(await capture(() => confirmSepPayment('INBorder', { refNum: 'stolen-ref' })))).toBe(false)
  })

  it('leaves the row payable when the amount is missing', async () => {
    okVerify({ amount: undefined, resNum: 'INBorder' })
    const err = await capture(() => confirmSepPayment('INBorder', { refNum: 'bank-ref-1' }))
    expect(isDefinitivePaymentFailure(err)).toBe(false)
    expect(h.row.status).toBe('PENDING_ONLINE')
    expect(JSON.parse(h.row.metadataJson).verifyPendingRefNum).toBe('bank-ref-1')
  })

  it('keeps the bank ref and does not fail the row on a transport error', async () => {
    verify.mockRejectedValue(new Error('fetch failed: timeout'))
    const err = await capture(() => confirmSepPayment('INBorder', { refNum: 'bank-ref-1' }))
    expect(isDefinitivePaymentFailure(err)).toBe(false)
    expect(h.row.status).toBe('PENDING_ONLINE')
    expect(JSON.parse(h.row.metadataJson).verifyPendingRefNum).toBe('bank-ref-1')
    expect(h.row.gatewayRef).toBeNull()
  })

  it('marks a business decline as a definitive failure', async () => {
    okVerify({ resultCode: 5, amount: undefined, resNum: 'INBorder' })
    const err = await capture(() => confirmSepPayment('INBorder', { refNum: 'bank-ref-1' }))
    expect(isDefinitivePaymentFailure(err)).toBe(true)
    expect(h.row.status).toBe('FAILED')
  })

  it('reverses our capture when the rial amount does not match, then fails closed', async () => {
    okVerify({ amount: 100_000, resNum: 'INBorder' })
    const err = await capture(() => confirmSepPayment('INBorder', { refNum: 'bank-ref-1' }))
    expect(isDefinitivePaymentFailure(err)).toBe(true)
    expect(reverse).toHaveBeenCalledWith({ terminalId: '12345678', refNum: 'bank-ref-1' })
    expect(h.row.status).toBe('FAILED')
    expect(h.row.gatewayRef).toBe('bank-ref-1')
    expect(JSON.parse(h.row.metadataJson).gatewayReversed).toBe(true)
  })

  it('does not fail the row when reverse after a mismatch is ambiguous', async () => {
    okVerify({ amount: 100_000, resNum: 'INBorder' })
    reverse.mockRejectedValue(new Error('fetch failed: timeout'))
    const err = await capture(() => confirmSepPayment('INBorder', { refNum: 'bank-ref-1' }))
    expect(isDefinitivePaymentFailure(err)).toBe(false)
    expect(h.row.status).toBe('PENDING_ONLINE')
    expect(h.row.gatewayRef).toBe('bank-ref-1')
    expect(JSON.parse(h.row.metadataJson).reversePending).toBe(true)
  })

  it('refuses to resurrect a refunded payment', async () => {
    h.row.status = 'REFUNDED'
    const err = await capture(() => confirmSepPayment('INBorder', { refNum: 'bank-ref-1' }))
    expect(isDefinitivePaymentFailure(err)).toBe(false)
    expect(verify).not.toHaveBeenCalled()
    expect(h.row.status).toBe('REFUNDED')
  })

  it('recollects a released split wallet before PAID', async () => {
    h.row.amount = 60_000
    h.row.metadataJson = JSON.stringify({
      splitPay: true,
      walletDebitAmount: 40_000,
      ipgChargeAmount: 60_000,
      splitFullAmount: 100_000,
      walletDebitReleased: true,
    })
    okVerify({ amount: 600_000, resNum: 'INBorder' })
    recollect.mockResolvedValue({ needed: true, recollected: true })
    const intent = await confirmSepPayment('INBorder', { refNum: 'bank-ref-1' })
    expect(intent.status).toBe('PAID')
    expect(recollect).toHaveBeenCalled()
    expect(JSON.parse(h.row.metadataJson).walletDebitReleased).toBe(false)
  })

  it('reverses the card instead of confirming when the wallet share cannot be recollected', async () => {
    h.row.amount = 60_000
    h.row.metadataJson = JSON.stringify({
      splitPay: true,
      walletDebitAmount: 40_000,
      splitFullAmount: 100_000,
      walletDebitReleased: true,
    })
    okVerify({ amount: 600_000, resNum: 'INBorder' })
    recollect.mockRejectedValue(new SplitRecollectError('SPLIT_RECOLLECT_INSUFFICIENT'))
    const err = await capture(() => confirmSepPayment('INBorder', { refNum: 'bank-ref-1' }))
    expect(isDefinitivePaymentFailure(err)).toBe(true)
    expect(reverse).toHaveBeenCalled()
    expect(h.row.status).toBe('FAILED')
    expect(JSON.parse(h.row.metadataJson).gatewayReversed).toBe(true)
  })

  it('does not claim a RefNum that another payment already owns', async () => {
    h.clash = true
    const err = await capture(() => confirmSepPayment('INBorder', { refNum: 'bank-ref-1' }))
    expect(isDefinitivePaymentFailure(err)).toBe(false)
    expect(h.row.status).toBe('PENDING_ONLINE')
    expect(h.row.gatewayRef).toBeNull()
  })

  it('does not require a RefNum to fail the payment', async () => {
    const err = await capture(() => confirmSepPayment('INBorder'))
    expect(isDefinitivePaymentFailure(err)).toBe(false)
    expect(h.row.status).toBe('PENDING_ONLINE')
    expect(verify).not.toHaveBeenCalled()
  })
})

async function capture(run: () => Promise<unknown>) {
  try {
    await run()
    return undefined
  } catch (err) {
    return err
  }
}
