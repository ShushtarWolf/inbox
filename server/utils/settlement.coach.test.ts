import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUniquePayment = vi.fn()
const findUniqueLedger = vi.fn()
const createLedger = vi.fn()
const updateLedger = vi.fn()
const findUniqueCoach = vi.fn()
const clubWalletUpsert = vi.fn()
const clubWalletUpdate = vi.fn()
const clubWalletTxCreate = vi.fn()
const transaction = vi.fn()
const creditWallet = vi.fn()
const debitWallet = vi.fn()

vi.mock('./wallet', () => ({
  creditWallet: (...args: unknown[]) => creditWallet(...args),
  debitWallet: (...args: unknown[]) => debitWallet(...args),
}))

vi.stubGlobal('prisma', {
  payment: { findUnique: (...args: unknown[]) => findUniquePayment(...args) },
  settlementLedgerEntry: {
    findUnique: (...args: unknown[]) => findUniqueLedger(...args),
    create: (...args: unknown[]) => createLedger(...args),
    update: (...args: unknown[]) => updateLedger(...args),
  },
  coach: { findUnique: (...args: unknown[]) => findUniqueCoach(...args) },
  clubWallet: {
    upsert: (...args: unknown[]) => clubWalletUpsert(...args),
    update: (...args: unknown[]) => clubWalletUpdate(...args),
  },
  clubWalletTransaction: {
    create: (...args: unknown[]) => clubWalletTxCreate(...args),
  },
  $transaction: (...args: unknown[]) => transaction(...args),
})

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})

import { clawbackOwnerForPayment, creditOwnerForPaidPayment } from './settlement'

describe('coach lesson settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PLATFORM_COMMISSION_BPS = '1000'
    delete process.env.COACH_COMMISSION_BPS
    clubWalletUpsert.mockResolvedValue({ id: 'cw-1', clubId: 'club-1', balance: 0 })
    clubWalletUpdate.mockResolvedValue({ id: 'cw-1', balance: 500_000 })
    clubWalletTxCreate.mockResolvedValue({})
    createLedger.mockResolvedValue({ id: 'led-1', ownerNet: 450_000 })
    creditWallet.mockResolvedValue({})
    debitWallet.mockResolvedValue({})
    transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma as never))
    findUniqueLedger.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('credits coach wallet net after 10% on lesson fee PAID', async () => {
    findUniquePayment.mockImplementation(async (args: { include?: unknown }) => {
      const base = {
        id: 'pay-lesson',
        amount: 500_000,
        status: 'PAID',
        purpose: null,
        metadataJson: null,
        coachSessionId: 'sess-1',
        bookingId: null,
        packageBookingId: null,
        coachSession: {
          id: 'sess-1',
          date: '2026-09-01',
          coach: { id: 'coach-1', userId: 'user-coach' },
        },
      }
      if (args?.include) return base
      return {
        id: 'pay-lesson',
        amount: 500_000,
        status: 'PAID',
        purpose: null,
        metadataJson: null,
        coachSessionId: 'sess-1',
      }
    })

    const result = await creditOwnerForPaidPayment('pay-lesson')

    expect(result.credited).toBe(true)
    expect(createLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coachId: 'coach-1',
          paymentId: 'pay-lesson',
          bookingId: 'sess-1',
          classDate: '2026-09-01',
          gross: 500_000,
          commissionBps: 1000,
          commission: 50_000,
          ownerNet: 450_000,
        }),
      }),
    )
    expect(creditWallet).toHaveBeenCalledWith(
      'user-coach',
      450_000,
      expect.objectContaining({ type: 'SETTLEMENT_CREDIT', paymentId: 'pay-lesson' }),
      expect.anything(),
    )
    expect(clubWalletUpdate).not.toHaveBeenCalled()
  })

  it('settles coach-lesson-court to club at 0 bps (full charge)', async () => {
    findUniquePayment.mockImplementation(async (args: { include?: unknown }) => {
      const base = {
        id: 'pay-court',
        amount: 600_000,
        status: 'PAID',
        purpose: null,
        metadataJson: JSON.stringify({ source: 'coach-lesson-court' }),
        coachSessionId: null,
        bookingId: 'book-1',
        packageBookingId: null,
        booking: {
          id: 'book-1',
          slot: { date: '2026-09-01', court: { clubId: 'club-1' } },
        },
      }
      if (args?.include) return base
      return {
        id: 'pay-court',
        amount: 600_000,
        status: 'PAID',
        purpose: null,
        metadataJson: JSON.stringify({ source: 'coach-lesson-court' }),
        coachSessionId: null,
      }
    })

    const result = await creditOwnerForPaidPayment('pay-court')

    expect(result.credited).toBe(true)
    expect(createLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clubId: 'club-1',
          paymentId: 'pay-court',
          gross: 600_000,
          commissionBps: 0,
          commission: 0,
          ownerNet: 600_000,
        }),
      }),
    )
    expect(creditWallet).not.toHaveBeenCalled()
  })

  it('claws back coach settlement on cancel (allow negative wallet)', async () => {
    findUniqueLedger.mockResolvedValue({
      id: 'led-coach',
      paymentId: 'pay-lesson',
      coachId: 'coach-1',
      clubId: null,
      ownerNet: 450_000,
      bookingId: 'sess-1',
      clawedBackAt: null,
    })
    findUniqueCoach.mockResolvedValue({ userId: 'user-coach' })
    updateLedger.mockResolvedValue({})

    const result = await clawbackOwnerForPayment('pay-lesson')

    expect(result.clawed).toBe(true)
    expect(debitWallet).toHaveBeenCalledWith(
      'user-coach',
      450_000,
      expect.objectContaining({
        type: 'SETTLEMENT_CLAWBACK',
        allowNegative: true,
        paymentId: 'pay-lesson',
      }),
      expect.anything(),
    )
  })

  it('is idempotent when lesson settlement already exists', async () => {
    findUniquePayment.mockResolvedValue({
      id: 'pay-lesson',
      amount: 500_000,
      status: 'PAID',
      purpose: null,
      metadataJson: null,
      coachSessionId: 'sess-1',
    })
    findUniqueLedger.mockResolvedValue({ id: 'led-existing', ownerNet: 450_000 })

    const result = await creditOwnerForPaidPayment('pay-lesson')

    expect(result.credited).toBe(false)
    expect(result.reason).toBe('already_settled')
    expect(createLedger).not.toHaveBeenCalled()
  })
})
