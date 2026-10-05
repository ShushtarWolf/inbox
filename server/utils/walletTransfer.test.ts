import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueCoach = vi.fn()
const findFirstMembership = vi.fn()
const transaction = vi.fn()
const creditWallet = vi.fn()
const debitWallet = vi.fn()
const getOrCreateClubWallet = vi.fn()
const clubWalletUpdateMany = vi.fn()
const clubWalletUpdate = vi.fn()
const clubWalletTxCreate = vi.fn()

vi.mock('./wallet', () => ({
  creditWallet: (...args: unknown[]) => creditWallet(...args),
  debitWallet: (...args: unknown[]) => debitWallet(...args),
}))

vi.mock('./settlement', () => ({
  getOrCreateClubWallet: (...args: unknown[]) => getOrCreateClubWallet(...args),
}))

vi.stubGlobal('prisma', {
  coach: { findUnique: (...args: unknown[]) => findUniqueCoach(...args) },
  staffMembership: { findFirst: (...args: unknown[]) => findFirstMembership(...args) },
  clubWallet: {
    updateMany: (...args: unknown[]) => clubWalletUpdateMany(...args),
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

import { transferClubCoach } from './walletTransfer'

describe('transferClubCoach affiliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getOrCreateClubWallet.mockResolvedValue({ id: 'cw-1', clubId: 'club-home', availableBalance: 1_000_000, balance: 1_000_000 })
    clubWalletUpdateMany.mockResolvedValue({ count: 1 })
    clubWalletUpdate.mockResolvedValue({})
    clubWalletTxCreate.mockResolvedValue({})
    creditWallet.mockResolvedValue({})
    debitWallet.mockResolvedValue({})
    transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma as never))
    findFirstMembership.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('allows club_to_coach when coach.clubId matches', async () => {
    findUniqueCoach.mockResolvedValue({ id: 'coach-1', userId: 'user-coach', clubId: 'club-home' })

    const result = await transferClubCoach({
      direction: 'club_to_coach',
      clubId: 'club-home',
      coachId: 'coach-1',
      amount: 50_000,
    })

    expect(result).toMatchObject({ amount: 50_000, direction: 'club_to_coach' })
    expect(creditWallet).toHaveBeenCalledWith(
      'user-coach',
      50_000,
      expect.objectContaining({ type: 'INTERNAL_TRANSFER_IN' }),
      expect.anything(),
    )
    expect(findFirstMembership).not.toHaveBeenCalled()
  })

  it('rejects cross-club coachId (no membership) before any wallet mutation', async () => {
    findUniqueCoach.mockResolvedValue({ id: 'coach-other', userId: 'user-other', clubId: 'club-other' })

    await expect(
      transferClubCoach({
        direction: 'coach_to_club',
        clubId: 'club-home',
        coachId: 'coach-other',
        amount: 50_000,
      }),
    ).rejects.toMatchObject({ statusCode: 403, message: 'Coach is not affiliated with this club' })

    expect(transaction).not.toHaveBeenCalled()
    expect(creditWallet).not.toHaveBeenCalled()
    expect(debitWallet).not.toHaveBeenCalled()
  })

  it('rejects unaffiliated coach with null clubId (marketplace coach)', async () => {
    findUniqueCoach.mockResolvedValue({ id: 'coach-free', userId: 'user-free', clubId: null })

    await expect(
      transferClubCoach({
        direction: 'club_to_coach',
        clubId: 'club-home',
        coachId: 'coach-free',
        amount: 10_000,
      }),
    ).rejects.toMatchObject({ statusCode: 403 })

    expect(findFirstMembership).toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('allows transfer when coach.clubId is null but active COACH staff membership exists', async () => {
    findUniqueCoach.mockResolvedValue({ id: 'coach-staff', userId: 'user-staff', clubId: null })
    findFirstMembership.mockResolvedValue({ id: 'mem-1' })

    const result = await transferClubCoach({
      direction: 'coach_to_club',
      clubId: 'club-home',
      coachId: 'coach-staff',
      amount: 20_000,
    })

    expect(result).toMatchObject({ amount: 20_000, direction: 'coach_to_club' })
    expect(debitWallet).toHaveBeenCalledWith(
      'user-staff',
      20_000,
      expect.objectContaining({ type: 'INTERNAL_TRANSFER_OUT' }),
      expect.anything(),
    )
  })
})
