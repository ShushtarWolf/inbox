import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const queryRaw = vi.fn()
const findUniqueCompetition = vi.fn()
const findUniqueEntry = vi.fn()
const findFirstEntry = vi.fn()
const findUniquePaymentByKey = vi.fn()
const createPayment = vi.fn()
const updatePayment = vi.fn()
const countEntry = vi.fn()
const createEntry = vi.fn()
const updateEntry = vi.fn()
const updateManyEntry = vi.fn()
const updateCompetition = vi.fn()
const findUniquePayment = vi.fn()

const findManyEntry = vi.fn()
const findUniqueOrThrowCompetition = vi.fn()
const findManyCompetition = vi.fn()
const courtCount = vi.fn()
const slotFindMany = vi.fn()
const walletTransactionFindFirst = vi.fn()
const prizeAwardFindUnique = vi.fn()
const prizeAwardCreate = vi.fn()
const prizeAwardFindUniqueOrThrow = vi.fn()
const findManyPlacedEntries = vi.fn()
const discountCodeFindUnique = vi.fn()

const createCompetitionPrizeDiscountCode = vi.fn()

const transaction = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transaction(...args),
    competition: {
      findUnique: (...args: unknown[]) => findUniqueCompetition(...args),
      findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrowCompetition(...args),
      findFirst: (...args: unknown[]) => findUniqueCompetition(...args),
      findMany: (...args: unknown[]) => findManyCompetition(...args),
      update: (...args: unknown[]) => updateCompetition(...args),
      create: vi.fn(),
    },
    competitionEntry: {
      findUnique: (...args: unknown[]) => findUniqueEntry(...args),
      findUniqueOrThrow: (...args: unknown[]) => findUniqueEntry(...args),
      findFirst: (...args: unknown[]) => findFirstEntry(...args),
      findMany: (...args: unknown[]) => {
        const where = (args[0] as { where?: { placement?: unknown } })?.where
        if (where && 'placement' in where) return findManyPlacedEntries(...args)
        return findManyEntry(...args)
      },
      count: (...args: unknown[]) => countEntry(...args),
      create: (...args: unknown[]) => createEntry(...args),
      update: (...args: unknown[]) => updateEntry(...args),
      updateMany: (...args: unknown[]) => updateManyEntry(...args),
    },
    payment: {
      findUnique: (...args: unknown[]) => {
        const where = (args[0] as { where?: { id?: string; idempotencyKey?: string } })?.where
        if (where?.idempotencyKey) return findUniquePaymentByKey(...args)
        return findUniquePayment(...args)
      },
      create: (...args: unknown[]) => createPayment(...args),
      update: (...args: unknown[]) => updatePayment(...args),
    },
    court: {
      count: (...args: unknown[]) => courtCount(...args),
    },
    slot: {
      findMany: (...args: unknown[]) => slotFindMany(...args),
    },
    walletTransaction: {
      findFirst: (...args: unknown[]) => walletTransactionFindFirst(...args),
    },
    discountCode: {
      findUnique: (...args: unknown[]) => discountCodeFindUnique(...args),
    },
    competitionPrizeAward: {
      findUnique: (...args: unknown[]) => prizeAwardFindUnique(...args),
      create: (...args: unknown[]) => prizeAwardCreate(...args),
      findUniqueOrThrow: (...args: unknown[]) => prizeAwardFindUniqueOrThrow(...args),
    },
    notification: {
      create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    },
    campaign: {
      create: vi.fn(),
    },
    campaignRecipient: {
      createMany: vi.fn(),
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})

import {
  assertCompetitionDraftValid,
  assertCompetitionJoinable,
  awardCompetitionPrizes,
  cancelCompetition,
  cancelCompetitionEntry,
  confirmEntry,
  confirmEntryFromPayment,
  createPendingEntry,
  expireStalePendingEntries,
  joinCompetition,
  markCompetitionEntryPaid,
  transitionCompetitionStatus,
} from './competitions'
import { MAX_COMPETITION_ENTRY_FEE } from '#shared/competition.ts'

const refundPaymentForCancellation = vi.fn().mockResolvedValue({
  refunded: true,
  walletCredited: true,
  gatewayRefunded: false,
  amount: 200000,
})
const creditWallet = vi.fn().mockResolvedValue({ balance: 400000 })

vi.mock('./refunds', () => ({
  refundPaymentForCancellation: (...args: unknown[]) => refundPaymentForCancellation(...args),
}))

vi.mock('./settlement', () => ({
  creditOwnerForPaidPayment: vi.fn().mockResolvedValue({ credited: true, reason: 'ok' }),
}))

vi.mock('./discountCodes', () => ({
  createCompetitionPrizeDiscountCode: (...args: unknown[]) => createCompetitionPrizeDiscountCode(...args),
}))

vi.mock('./wallet', () => ({
  creditWallet: (...args: unknown[]) => creditWallet(...args),
}))

vi.mock('./competitionNotify', () => ({
  notifyCompetitionCancelled: vi.fn().mockResolvedValue(undefined),
}))

const openCompetition = {
  id: 'comp-1',
  clubId: 'club-1',
  sportId: 'sport-1',
  title: 'Summer Open',
  format: 'knockout',
  enrollmentType: 'SINGLE' as const,
  entryFee: 200000,
  prizeType: 'WALLET' as const,
  prizeConfigJson: JSON.stringify({ placements: [{ placement: 1, amount: 1000000 }] }),
  maxParticipants: 2,
  minParticipants: 2,
  registrationOpens: new Date('2026-01-01T00:00:00Z'),
  registrationCloses: new Date('2026-12-31T23:59:59Z'),
  eventAt: new Date('2026-08-01T10:00:00Z'),
  status: 'OPEN' as const,
  sponsorFunded: false,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeTx() {
  return {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    competition: {
      findUnique: (...args: unknown[]) => findUniqueCompetition(...args),
      findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrowCompetition(...args),
      update: (...args: unknown[]) => updateCompetition(...args),
    },
    competitionEntry: {
      findUnique: (...args: unknown[]) => findUniqueEntry(...args),
      findFirst: (...args: unknown[]) => findFirstEntry(...args),
      findMany: (...args: unknown[]) => {
        const where = (args[0] as { where?: { placement?: unknown } })?.where
        if (where && 'placement' in where) return findManyPlacedEntries(...args)
        return findManyEntry(...args)
      },
      count: (...args: unknown[]) => countEntry(...args),
      create: (...args: unknown[]) => createEntry(...args),
      update: (...args: unknown[]) => updateEntry(...args),
      updateMany: (...args: unknown[]) => updateManyEntry(...args),
    },
    payment: {
      findUnique: (...args: unknown[]) => {
        const where = (args[0] as { where?: { id?: string; idempotencyKey?: string } })?.where
        if (where?.idempotencyKey) return findUniquePaymentByKey(...args)
        return findUniquePayment(...args)
      },
      create: (...args: unknown[]) => createPayment(...args),
      update: (...args: unknown[]) => updatePayment(...args),
    },
    walletTransaction: {
      findFirst: (...args: unknown[]) => walletTransactionFindFirst(...args),
    },
    discountCode: {
      findUnique: (...args: unknown[]) => discountCodeFindUnique(...args),
    },
    competitionPrizeAward: {
      findUnique: (...args: unknown[]) => prizeAwardFindUnique(...args),
      create: (...args: unknown[]) => prizeAwardCreate(...args),
      findUniqueOrThrow: (...args: unknown[]) => prizeAwardFindUniqueOrThrow(...args),
    },
    wallet: {
      upsert: vi.fn().mockResolvedValue({ id: 'wallet-1', userId: 'athlete-1', balance: 0 }),
      update: vi.fn().mockResolvedValue({ id: 'wallet-1', balance: 1000000 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'wallet-1', balance: 1000000 }),
    },
  }
}

describe('assertCompetitionJoinable', () => {
  it('rejects when competition is full', () => {
    expect(() => assertCompetitionJoinable(openCompetition, 2)).toThrow('COMPETITION_FULL')
    try {
      assertCompetitionJoinable(openCompetition, 2)
    } catch (error) {
      expect((error as Error & { statusCode: number }).statusCode).toBe(409)
    }
  })

  it('allows join when seats remain', () => {
    expect(() => assertCompetitionJoinable(openCompetition, 1)).not.toThrow()
  })
})

describe('assertCompetitionDraftValid entry fee cap', () => {
  const baseDraft = {
    clubId: 'club-1',
    sportId: 'sport-1',
    title: 'Pilot',
    format: 'knockout',
    enrollmentType: 'SINGLE' as const,
    prizeType: 'DISCOUNT' as const,
    prizeConfigJson: JSON.stringify({ placements: [{ placement: 1, percent: 20 }] }),
    maxParticipants: 16,
    minParticipants: 2,
    registrationOpens: new Date('2026-09-01T10:00:00Z'),
    registrationCloses: new Date('2026-09-20T10:00:00Z'),
    eventAt: new Date('2026-10-01T10:00:00Z'),
    sponsorFunded: false,
  }

  it('rejects entryFee above pilot cap with ENTRY_FEE_TOO_HIGH', () => {
    expect(() => assertCompetitionDraftValid({
      ...baseDraft,
      entryFee: MAX_COMPETITION_ENTRY_FEE + 1,
    })).toThrow('ENTRY_FEE_TOO_HIGH')
  })

  it('allows entryFee at the pilot cap', () => {
    expect(() => assertCompetitionDraftValid({
      ...baseDraft,
      entryFee: MAX_COMPETITION_ENTRY_FEE,
    })).not.toThrow()
  })
})

describe('createPendingEntry', () => {
  beforeEach(() => {
    queryRaw.mockResolvedValue([{ id: 'comp-1' }])
    findUniqueCompetition.mockResolvedValue(openCompetition)
    findFirstEntry.mockResolvedValue(null)
    countEntry.mockResolvedValue(0)
    createEntry.mockResolvedValue({ id: 'entry-1', status: 'PENDING' })
    transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects join when competition is full (409)', async () => {
    countEntry.mockResolvedValue(2)
    await expect(createPendingEntry({
      competitionId: 'comp-1',
      athleteId: 'athlete-3',
    })).rejects.toThrow('COMPETITION_FULL')
    expect(createEntry).not.toHaveBeenCalled()
    expect(queryRaw).toHaveBeenCalled()
  })

  it('rejects double registration (409)', async () => {
    findFirstEntry.mockResolvedValueOnce({ id: 'entry-existing' })
    await expect(createPendingEntry({
      competitionId: 'comp-1',
      athleteId: 'athlete-1',
    })).rejects.toThrow('ALREADY_REGISTERED')
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('creates PENDING entry when joinable', async () => {
    const entry = await createPendingEntry({
      competitionId: 'comp-1',
      athleteId: 'athlete-1',
    })
    expect(entry).toMatchObject({ id: 'entry-1', status: 'PENDING' })
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          athleteId: 'athlete-1',
        }),
      }),
    )
  })
})

describe('cancelCompetition / status transitions', () => {
  beforeEach(() => {
    queryRaw.mockResolvedValue([{ id: 'comp-1' }])
    updateManyEntry.mockResolvedValue({ count: 1 })
    transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('cancels competition and active entries from OPEN', async () => {
    findUniqueCompetition.mockResolvedValue({ ...openCompetition, status: 'OPEN' })
    updateCompetition.mockResolvedValue({ ...openCompetition, status: 'CANCELLED' })
    findManyEntry.mockResolvedValue([
      {
        id: 'entry-1',
        status: 'CONFIRMED',
        payment: { id: 'pay-1', status: 'PAID', amount: 200000 },
        athleteId: 'athlete-1',
      },
    ])
    updateEntry.mockResolvedValue({ id: 'entry-1', status: 'REFUNDED' })

    const result = await cancelCompetition({
      competitionId: 'comp-1',
      cancelledBy: 'owner-1',
      cancelReason: 'Weather',
      refundEntries: true,
    })

    expect(result.status).toBe('CANCELLED')
    expect(updateManyEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          competitionId: 'comp-1',
          status: 'PENDING',
        }),
      }),
    )
    expect(refundPaymentForCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-1', userId: 'athlete-1' }),
    )
    expect(updateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({ status: 'REFUNDED' }),
      }),
    )
  })

  it('rejects invalid status transition DRAFT → COMPLETED', async () => {
    findUniqueCompetition.mockResolvedValue({ ...openCompetition, status: 'DRAFT' })

    await expect(transitionCompetitionStatus({
      competitionId: 'comp-1',
      toStatus: 'COMPLETED',
    })).rejects.toThrow('Invalid competition status transition')
  })
})

describe('cancelCompetitionEntry partner cancel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('allows partner to cancel and refunds the primary registrant', async () => {
    findUniqueEntry.mockResolvedValue({
      id: 'entry-1',
      status: 'CONFIRMED',
      athleteId: 'athlete-1',
      partnerAthleteId: 'partner-1',
      payment: { id: 'pay-1', status: 'PAID', amount: 200000, metadataJson: null },
      competition: {
        ...openCompetition,
        eventAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        club: { cancellationWindowHours: 24 },
      },
    })
    updateEntry.mockResolvedValue({ id: 'entry-1', status: 'REFUNDED' })
    refundPaymentForCancellation.mockResolvedValue({
      refunded: true,
      walletCredited: true,
      gatewayRefunded: false,
      amount: 200000,
    })

    const result = await cancelCompetitionEntry({
      entryId: 'entry-1',
      athleteId: 'partner-1',
      reason: 'Partner cancelled',
    })

    expect(refundPaymentForCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-1', userId: 'athlete-1' }),
    )
    expect(result.refundPending).toBe(false)
    expect(result.refund?.walletCredited).toBe(true)
    expect(updateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          status: 'REFUNDED',
          cancelledBy: 'partner-1',
        }),
      }),
    )
  })

  it('sets refundPending when IPG reverse and wallet fallback both fail', async () => {
    findUniqueEntry.mockResolvedValue({
      id: 'entry-1',
      status: 'CONFIRMED',
      athleteId: 'athlete-1',
      partnerAthleteId: null,
      payment: {
        id: 'pay-1',
        status: 'PAID',
        amount: 200000,
        metadataJson: JSON.stringify({ refNum: '9911' }),
      },
      competition: {
        ...openCompetition,
        eventAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        club: { cancellationWindowHours: 24 },
      },
    })
    updateEntry.mockResolvedValue({ id: 'entry-1', status: 'REFUNDED' })
    updatePayment.mockResolvedValue({})
    refundPaymentForCancellation.mockResolvedValue({
      refunded: true,
      walletCredited: false,
      gatewayRefunded: false,
      amount: 200000,
    })

    const result = await cancelCompetitionEntry({
      entryId: 'entry-1',
      athleteId: 'athlete-1',
      reason: 'Cancel',
    })

    expect(result.refundPending).toBe(true)
    expect(updatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: expect.objectContaining({
          metadataJson: expect.stringContaining('refundPending'),
        }),
      }),
    )
  })

  it('rejects cancel from unrelated athlete', async () => {
    findUniqueEntry.mockResolvedValue({
      id: 'entry-1',
      status: 'CONFIRMED',
      athleteId: 'athlete-1',
      partnerAthleteId: 'partner-1',
      payment: { id: 'pay-1', status: 'PAID' },
      competition: {
        ...openCompetition,
        eventAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        club: { cancellationWindowHours: 24 },
      },
    })

    await expect(cancelCompetitionEntry({
      entryId: 'entry-1',
      athleteId: 'stranger',
    })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('confirmEntry', () => {
  beforeEach(() => {
    transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects CONFIRMED without payment when entryFee > 0', async () => {
    findUniqueEntry.mockResolvedValue({
      id: 'entry-1',
      status: 'PENDING',
      paymentId: null,
      payment: null,
      competition: { ...openCompetition, entryFee: 200000 },
    })

    await expect(confirmEntry({ entryId: 'entry-1' })).rejects.toThrow('Payment required')
    expect(updateEntry).not.toHaveBeenCalled()
  })

  it('confirms when payment is PAID', async () => {
    findUniqueEntry.mockResolvedValue({
      id: 'entry-1',
      status: 'PENDING',
      paymentId: 'pay-1',
      payment: { id: 'pay-1', status: 'PAID', amount: 200000 },
      competition: { ...openCompetition, entryFee: 200000 },
    })
    updateEntry.mockResolvedValue({ id: 'entry-1', status: 'CONFIRMED' })

    const result = await confirmEntry({ entryId: 'entry-1', paymentId: 'pay-1' })
    expect(result.status).toBe('CONFIRMED')
  })
})

describe('join → pay → confirm flow', () => {
  beforeEach(() => {
    queryRaw.mockResolvedValue([{ id: 'comp-1' }])
    findUniqueCompetition.mockResolvedValue(openCompetition)
    findUniqueOrThrowCompetition.mockResolvedValue(openCompetition)
    findFirstEntry.mockResolvedValue(null)
    countEntry.mockResolvedValue(0)
    createEntry.mockResolvedValue({ id: 'entry-1', status: 'PENDING', competitionId: 'comp-1', athleteId: 'athlete-1' })
    findUniquePaymentByKey.mockResolvedValue(null)
    createPayment.mockResolvedValue({ id: 'pay-1', amount: 200000, status: 'PENDING_ONLINE' })
    findUniqueEntry.mockResolvedValue({
      id: 'entry-1',
      status: 'PENDING',
      payment: { id: 'pay-1', status: 'PENDING_ONLINE', amount: 200000 },
      competition: openCompetition,
    })
    updateEntry.mockResolvedValue({ id: 'entry-1', status: 'CONFIRMED', paymentId: 'pay-1' })
    transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns existing entry on retry (no double charge)', async () => {
    findFirstEntry.mockResolvedValueOnce({
      id: 'entry-existing',
      status: 'PENDING',
      payment: { id: 'pay-existing', status: 'PENDING_ONLINE', amount: 200000 },
      competition: openCompetition,
    })

    const result = await joinCompetition({
      competitionId: 'comp-1',
      athleteId: 'athlete-1',
    })

    expect(result.created).toBe(false)
    expect(result.entry.id).toBe('entry-existing')
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('confirms entry idempotently from PAID payment', async () => {
    findUniquePayment.mockResolvedValue({
      id: 'pay-1',
      status: 'PAID',
      amount: 200000,
      competitionEntry: {
        id: 'entry-1',
        status: 'PENDING',
        competition: { ...openCompetition, entryFee: 200000 },
      },
    })
    findUniqueEntry.mockResolvedValue({
      id: 'entry-1',
      status: 'PENDING',
      paymentId: 'pay-1',
      payment: { id: 'pay-1', status: 'PAID', amount: 200000 },
      competition: { ...openCompetition, entryFee: 200000 },
    })
    updateEntry.mockResolvedValue({ id: 'entry-1', status: 'CONFIRMED' })

    const first = await confirmEntryFromPayment('pay-1')
    expect(first?.status).toBe('CONFIRMED')

    findUniquePayment.mockResolvedValue({
      id: 'pay-1',
      status: 'PAID',
      amount: 200000,
      competitionEntry: { id: 'entry-1', status: 'CONFIRMED', competition: openCompetition },
    })
    const second = await confirmEntryFromPayment('pay-1')
    expect(second?.status).toBe('CONFIRMED')
    expect(updateEntry).toHaveBeenCalledTimes(1)
  })

  it('does not confirm on PAY_AT_CLUB alone', async () => {
    findUniquePayment.mockResolvedValue({
      id: 'pay-1',
      status: 'PAY_AT_CLUB',
      amount: 200000,
      competitionEntry: {
        id: 'entry-1',
        status: 'PENDING',
        competition: { ...openCompetition, entryFee: 200000 },
      },
    })

    const result = await confirmEntryFromPayment('pay-1')
    expect(result).toBeNull()
    expect(updateEntry).not.toHaveBeenCalled()
  })

  it('rejects athlete pay-at-club competition join', async () => {
    const prevMode = process.env.PAYMENTS_MODE
    process.env.PAYMENTS_MODE = 'pay_at_club'
    try {
      findFirstEntry.mockResolvedValue(null)
      createEntry.mockResolvedValue({
        id: 'entry-1',
        status: 'PENDING',
        competitionId: 'comp-1',
        athleteId: 'athlete-1',
        paymentId: null,
      })

      await expect(joinCompetition({
        competitionId: 'comp-1',
        athleteId: 'athlete-1',
        payAtClub: true,
      })).rejects.toThrow('PAY_AT_CLUB_NOT_ALLOWED')
    } finally {
      if (prevMode === undefined) delete process.env.PAYMENTS_MODE
      else process.env.PAYMENTS_MODE = prevMode
    }
  })

  it('requires online payments for paid competition join', async () => {
    const prevMode = process.env.PAYMENTS_MODE
    process.env.PAYMENTS_MODE = 'pay_at_club'
    try {
      findFirstEntry.mockResolvedValue(null)
      createEntry.mockResolvedValue({
        id: 'entry-1',
        status: 'PENDING',
        competitionId: 'comp-1',
        athleteId: 'athlete-1',
        paymentId: null,
      })

      await expect(joinCompetition({
        competitionId: 'comp-1',
        athleteId: 'athlete-1',
        payAtClub: false,
      })).rejects.toThrow('ONLINE_PAYMENTS_REQUIRED')
    } finally {
      if (prevMode === undefined) delete process.env.PAYMENTS_MODE
      else process.env.PAYMENTS_MODE = prevMode
    }
  })

  it('confirms via metadata fallback when entry.paymentId is stale', async () => {
    findUniquePayment.mockResolvedValue({
      id: 'pay-checkout',
      status: 'PAID',
      amount: 200000,
      userId: 'athlete-1',
      metadataJson: JSON.stringify({ competitionEntryId: 'entry-1' }),
      competitionEntry: null,
    })
    findUniqueEntry.mockResolvedValue({
      id: 'entry-1',
      status: 'PENDING',
      paymentId: null,
      athleteId: 'athlete-1',
      competition: { ...openCompetition, entryFee: 200000 },
    })
    updateEntry.mockResolvedValue({ id: 'entry-1', status: 'CONFIRMED', paymentId: 'pay-checkout' })

    const result = await confirmEntryFromPayment('pay-checkout')
    expect(result?.status).toBe('CONFIRMED')
    expect(updateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({ paymentId: 'pay-checkout', status: 'CONFIRMED' }),
      }),
    )
  })
})

describe('markCompetitionEntryPaid', () => {
  const pendingPayAtClubEntry = {
    id: 'entry-1',
    competitionId: 'comp-1',
    status: 'PENDING' as const,
    paymentId: 'pay-1',
    payment: { id: 'pay-1', status: 'PAY_AT_CLUB', amount: 200000, provider: 'pay_at_club', method: 'CASH' },
    competition: openCompetition,
  }

  beforeEach(() => {
    transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()))
    updatePayment.mockResolvedValue({ id: 'pay-1', status: 'PAID', method: 'CASH' })
    updateEntry.mockResolvedValue({ id: 'entry-1', status: 'CONFIRMED', paymentId: 'pay-1' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('marks pay-at-club payment PAID and confirms entry', async () => {
    findUniqueEntry.mockResolvedValue(pendingPayAtClubEntry)
    findUniqueEntry.mockResolvedValueOnce(pendingPayAtClubEntry)
    findUniqueEntry.mockResolvedValue({
      ...pendingPayAtClubEntry,
      payment: { ...pendingPayAtClubEntry.payment, status: 'PAID' },
    })

    const result = await markCompetitionEntryPaid({
      competitionId: 'comp-1',
      entryId: 'entry-1',
      clubId: 'club-1',
      actorUserId: 'owner-1',
    })

    expect(updatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: expect.objectContaining({ status: 'PAID', method: 'CASH' }),
      }),
    )
    expect(result.status).toBe('CONFIRMED')
  })

  it('rejects already CONFIRMED entry with 409', async () => {
    findUniqueEntry.mockResolvedValue({
      ...pendingPayAtClubEntry,
      status: 'CONFIRMED',
      payment: { ...pendingPayAtClubEntry.payment, status: 'PAID' },
    })

    await expect(markCompetitionEntryPaid({
      competitionId: 'comp-1',
      entryId: 'entry-1',
      clubId: 'club-1',
    })).rejects.toThrow('Entry already confirmed')
    expect(updatePayment).not.toHaveBeenCalled()
  })

  it('rejects wrong club with 404', async () => {
    findUniqueEntry.mockResolvedValue(pendingPayAtClubEntry)

    await expect(markCompetitionEntryPaid({
      competitionId: 'comp-1',
      entryId: 'entry-1',
      clubId: 'other-club',
    })).rejects.toThrow('Entry not found')
  })

  it('rejects missing payment when entryFee > 0 with 400', async () => {
    findUniqueEntry.mockResolvedValue({
      ...pendingPayAtClubEntry,
      paymentId: null,
      payment: null,
    })

    await expect(markCompetitionEntryPaid({
      competitionId: 'comp-1',
      entryId: 'entry-1',
      clubId: 'club-1',
    })).rejects.toThrow('Payment required')
  })

  it('double mark leaves one CONFIRMED entry', async () => {
    findUniqueEntry.mockResolvedValue(pendingPayAtClubEntry)
    findUniqueEntry.mockResolvedValueOnce(pendingPayAtClubEntry)
    findUniqueEntry.mockResolvedValue({
      ...pendingPayAtClubEntry,
      payment: { ...pendingPayAtClubEntry.payment, status: 'PAID' },
    })

    await markCompetitionEntryPaid({
      competitionId: 'comp-1',
      entryId: 'entry-1',
      clubId: 'club-1',
    })

    findUniqueEntry.mockResolvedValue({
      ...pendingPayAtClubEntry,
      status: 'CONFIRMED',
      payment: { ...pendingPayAtClubEntry.payment, status: 'PAID' },
    })

    await expect(markCompetitionEntryPaid({
      competitionId: 'comp-1',
      entryId: 'entry-1',
      clubId: 'club-1',
    })).rejects.toThrow('Entry already confirmed')

    expect(updateEntry).toHaveBeenCalledTimes(1)
  })
})

describe('awardCompetitionPrizes', () => {
  beforeEach(() => {
    queryRaw.mockResolvedValue([{ id: 'comp-1' }])
    walletTransactionFindFirst.mockResolvedValue(null)
    prizeAwardFindUnique.mockResolvedValue(null)
    prizeAwardCreate.mockResolvedValue({ id: 'award-1', prizeType: 'WALLET', amount: 1000000, percent: null })
    findManyPlacedEntries.mockResolvedValue([
      { id: 'entry-1', athleteId: 'athlete-1', status: 'CONFIRMED', placement: 1 },
    ])
    updateCompetition.mockImplementation((args) => Promise.resolve({
      ...openCompetition,
      status: 'COMPLETED',
      prizesAwardedAt: new Date(),
      prizeAwardAuditJson: JSON.stringify({ winnerEntryIds: { '1': 'entry-1' }, awardIds: ['award-1'] }),
      ...(args[0]?.data || {}),
    }))
    transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('awards WALLET prize once and is idempotent on retry', async () => {
    findUniqueOrThrowCompetition.mockResolvedValue({
      ...openCompetition,
      status: 'COMPLETED',
      prizesAwardedAt: null,
      prizeAwardAuditJson: null,
      club: { id: 'club-1' },
    })

    const first = await awardCompetitionPrizes('comp-1')
    expect(first.awards).toHaveLength(1)
    expect(first.awards[0]?.skipped).toBe(false)
    expect(creditWallet).toHaveBeenCalledTimes(1)
    expect(creditWallet).toHaveBeenCalledWith(
      'athlete-1',
      1000000,
      expect.objectContaining({ note: 'competition:comp-1:place:1' }),
      expect.anything(),
    )

    prizeAwardFindUnique.mockResolvedValue({
      id: 'award-1',
      prizeType: 'WALLET',
      amount: 1000000,
      percent: null,
      discountCodeId: null,
    })

    const second = await awardCompetitionPrizes('comp-1')
    expect(second.awards[0]?.skipped).toBe(true)
    expect(creditWallet).toHaveBeenCalledTimes(1)
  })
})

describe('expireStalePendingEntries', () => {
  it('cancels old PENDING entries without PAID payment', async () => {
    const staleDate = new Date(Date.now() - 15 * 60 * 1000)
    findManyEntry.mockResolvedValue([
      {
        id: 'entry-stale',
        status: 'PENDING',
        createdAt: staleDate,
        payment: { id: 'pay-1', status: 'PENDING_ONLINE' },
      },
    ])
    updateEntry.mockResolvedValue({ id: 'entry-stale', status: 'CANCELLED' })
    updatePayment.mockResolvedValue({ id: 'pay-1', status: 'FAILED' })

    const result = await expireStalePendingEntries()
    expect(result.expired).toBe(1)
    expect(updateEntry).toHaveBeenCalled()
  })
})
