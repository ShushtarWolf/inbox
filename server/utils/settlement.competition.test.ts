import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUniquePayment = vi.fn()
const findUniqueLedger = vi.fn()
const createLedger = vi.fn()
const clubWalletUpsert = vi.fn()
const clubWalletUpdate = vi.fn()
const clubWalletTxCreate = vi.fn()
const transaction = vi.fn()

vi.stubGlobal('prisma', {
  payment: { findUnique: (...args: unknown[]) => findUniquePayment(...args) },
  settlementLedgerEntry: {
    findUnique: (...args: unknown[]) => findUniqueLedger(...args),
    create: (...args: unknown[]) => createLedger(...args),
  },
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

import { creditOwnerForPaidPayment } from './settlement'

describe('creditOwnerForPaidPayment competition entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PLATFORM_COMMISSION_BPS = '1000'
    clubWalletUpsert.mockResolvedValue({ id: 'cw-1', clubId: 'club-1', balance: 0 })
    clubWalletUpdate.mockResolvedValue({ id: 'cw-1', balance: 180_000 })
    clubWalletTxCreate.mockResolvedValue({})
    createLedger.mockResolvedValue({ id: 'led-1', ownerNet: 180_000 })
    transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma as never))
    findUniqueLedger.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('settles competition purpose payment to club wallet', async () => {
    findUniquePayment.mockImplementation(async (args: { include?: unknown }) => {
      const base = {
        id: 'pay-1',
        amount: 200_000,
        status: 'PAID',
        purpose: 'competition',
        metadataJson: null,
        coachSessionId: null,
        bookingId: null,
        packageBookingId: null,
        competitionEntry: {
          id: 'entry-1',
          competition: { clubId: 'club-1' },
        },
      }
      if (args?.include) return base
      return {
        id: 'pay-1',
        amount: 200_000,
        status: 'PAID',
        purpose: 'competition',
        metadataJson: null,
        coachSessionId: null,
      }
    })

    const result = await creditOwnerForPaidPayment('pay-1')

    expect(result.credited).toBe(true)
    expect(createLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clubId: 'club-1',
          paymentId: 'pay-1',
          bookingId: 'entry-1',
          gross: 200_000,
          ownerNet: 180_000,
        }),
      }),
    )
  })
})
