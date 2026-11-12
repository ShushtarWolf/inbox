import { beforeEach, describe, expect, it, vi } from 'vitest'

type Ledger = {
  id: string
  paymentId: string
  clubId: string
  gross: number
  commissionBps: number
  commission: number
  clawedBackAt: Date | null
  club: { nameFa: string; commissionBps: number | null }
}

const state = vi.hoisted(() => ({
  platformBps: 0 as number,
  clubs: {} as Record<string, { commissionBps: number | null }>,
  ledgers: [] as Array<Record<string, unknown>>,
  walletIncrements: [] as Array<{ clubId: string; amount: number }>,
  ledgerUpdates: [] as string[],
}))

vi.mock('./prisma', () => {
  const tx = {
    settlementLedgerEntry: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        state.ledgers.find((l) => l.id === where.id) ?? null),
      update: vi.fn(async ({ where }: { where: { id: string } }) => { state.ledgerUpdates.push(where.id) }),
    },
    clubWalletTransaction: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
    club: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.clubs[where.id] ?? null),
    },
    clubWallet: {
      upsert: vi.fn(async ({ where }: { where: { clubId: string } }) => ({ id: `w-${where.clubId}`, clubId: where.clubId })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { balance: { increment: number } } }) => {
        state.walletIncrements.push({ clubId: where.id.slice(2), amount: data.balance.increment })
      }),
    },
  }
  return {
    prisma: {
      platformCommissionSetting: {
        findUnique: vi.fn(async () => ({ commissionBps: state.platformBps })),
      },
      settlementLedgerEntry: {
        findMany: vi.fn(async () => state.ledgers),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  }
})

const { correctZeroPastCommission, isClubEffectivelyZeroCommission } = await import('./correctZeroPastCommission')
const { invalidatePlatformCommissionCache } = await import('./platformCommission.ts')

function ledger(id: string, clubId: string, clubBps: number | null, gross: number, bps = 1000): Ledger {
  return {
    id,
    paymentId: `p-${id}`,
    clubId,
    gross,
    commissionBps: bps,
    commission: Math.floor((gross * bps) / 10_000),
    clawedBackAt: null,
    club: { nameFa: clubId, commissionBps: clubBps },
  }
}

beforeEach(() => {
  invalidatePlatformCommissionCache()
  state.platformBps = 0
  state.walletIncrements = []
  state.ledgerUpdates = []
  // Eli-like club on platform default 0%; promo club explicit 0%; paying club explicit 5%.
  state.clubs = { eli: { commissionBps: null }, promo: { commissionBps: 0 }, paying: { commissionBps: 500 } }
  state.ledgers = [
    ledger('a', 'eli', null, 500_000),
    ledger('b', 'eli', null, 450_000),
    ledger('c', 'promo', 0, 200_000),
    ledger('d', 'paying', 500, 300_000, 500),
  ]
})

describe('isClubEffectivelyZeroCommission', () => {
  it('uses the club override, else the platform default', () => {
    expect(isClubEffectivelyZeroCommission(null, 0)).toBe(true)
    expect(isClubEffectivelyZeroCommission(0, 1000)).toBe(true)
    expect(isClubEffectivelyZeroCommission(500, 0)).toBe(false)
    expect(isClubEffectivelyZeroCommission(null, 1000)).toBe(false)
  })
})

describe('correctZeroPastCommission', () => {
  it('dry-run by default: reports owed fees only for 0% clubs and writes nothing', async () => {
    const summary = await correctZeroPastCommission()
    expect(summary.applied).toBe(false)
    expect(summary.platformCommissionBps).toBe(0)
    expect(summary.entryCount).toBe(3)
    expect(summary.totalRefundToman).toBe(50_000 + 45_000 + 20_000)
    expect(summary.clubs.find((c) => c.clubId === 'eli')?.refundToman).toBe(95_000)
    expect(summary.excludedClubs).toEqual([
      { clubId: 'paying', clubName: 'paying', effectiveBps: 500, entryCount: 1 },
    ])
    expect(state.walletIncrements).toEqual([])
    expect(state.ledgerUpdates).toEqual([])
  })

  it('apply never refunds a club whose current rate is above 0%', async () => {
    const summary = await correctZeroPastCommission({ apply: true })
    expect(summary.ok).toBe(3)
    expect(state.ledgerUpdates).not.toContain('d')
    expect(state.walletIncrements.filter((w) => w.clubId === 'paying')).toEqual([])
    expect(state.walletIncrements.filter((w) => w.clubId === 'eli').reduce((s, w) => s + w.amount, 0)).toBe(95_000)
  })

  it('apply skips a club whose rate was raised after the scan', async () => {
    const scan = correctZeroPastCommission({ apply: true })
    state.clubs.promo = { commissionBps: 1000 }
    const summary = await scan
    expect(summary.skipped).toBe(1)
    expect(state.walletIncrements.filter((w) => w.clubId === 'promo')).toEqual([])
  })

  it('when the platform default is above 0%, default-rate clubs are excluded', async () => {
    state.platformBps = 1000
    const summary = await correctZeroPastCommission()
    expect(summary.clubs.map((c) => c.clubId)).toEqual(['promo'])
  })
})
