import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assessClubDeletionBlockers,
  CLUB_DELETE_BLOCKED_MESSAGE,
  deleteClubWithDependents,
} from './adminClubDelete'

function makeDb(overrides: {
  booking?: number
  seasonBooking?: number
  coachSession?: number
  payment?: number
  settlement?: number
  withdraw?: number
  walletTx?: number
  wallet?: { balance: number; availableBalance: number; lockedBalance: number } | null
  competitionEntry?: number
  packageBooking?: number
}) {
  const wallet = overrides.wallet === undefined
    ? null
    : overrides.wallet
  const walletId = wallet ? 'wallet-1' : null

  return {
    booking: { count: vi.fn(async () => overrides.booking ?? 0) },
    seasonBooking: { count: vi.fn(async () => overrides.seasonBooking ?? 0) },
    coachSession: { count: vi.fn(async () => overrides.coachSession ?? 0) },
    payment: { count: vi.fn(async () => overrides.payment ?? 0) },
    settlementLedgerEntry: { count: vi.fn(async () => overrides.settlement ?? 0) },
    withdrawRequest: { count: vi.fn(async () => overrides.withdraw ?? 0) },
    clubWallet: {
      findUnique: vi.fn(async () => (wallet
        ? { id: walletId, clubId: 'club-1', ...wallet }
        : null)),
    },
    clubWalletTransaction: { count: vi.fn(async () => overrides.walletTx ?? 0) },
    competitionEntry: { count: vi.fn(async () => overrides.competitionEntry ?? 0) },
    packageBooking: { count: vi.fn(async () => overrides.packageBooking ?? 0) },
  }
}

describe('assessClubDeletionBlockers', () => {
  it('returns null for a clean club', async () => {
    const db = makeDb({})
    await expect(assessClubDeletionBlockers(db, 'club-1')).resolves.toBeNull()
  })

  it('blocks when court bookings exist', async () => {
    const db = makeDb({ booking: 1 })
    await expect(assessClubDeletionBlockers(db, 'club-1')).resolves.toBe('booking')
  })

  it('blocks when club wallet has a non-zero balance', async () => {
    const db = makeDb({
      wallet: { balance: 1000, availableBalance: 1000, lockedBalance: 0 },
    })
    await expect(assessClubDeletionBlockers(db, 'club-1')).resolves.toBe('wallet_balance')
  })

  it('blocks when club wallet has transactions', async () => {
    const db = makeDb({ walletTx: 2, wallet: { balance: 0, availableBalance: 0, lockedBalance: 0 } })
    await expect(assessClubDeletionBlockers(db, 'club-1')).resolves.toBe('wallet_transaction')
  })

  it('exposes a Persian blocked message', () => {
    expect(CLUB_DELETE_BLOCKED_MESSAGE).toMatch(/حذف/)
    expect(CLUB_DELETE_BLOCKED_MESSAGE).toMatch(/رزرو/)
  })
})

describe('deleteClubWithDependents', () => {
  const clubDelete = vi.fn()
  const coachUpdateMany = vi.fn()
  const walletTxDeleteMany = vi.fn()
  const walletDelete = vi.fn()
  const walletFindUnique = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    walletFindUnique.mockResolvedValue(null)
  })

  it('deletes club when no wallet exists', async () => {
    const tx = {
      clubWallet: {
        findUnique: walletFindUnique,
        delete: walletDelete,
      },
      clubWalletTransaction: { deleteMany: walletTxDeleteMany },
      coach: { updateMany: coachUpdateMany },
      club: { delete: clubDelete },
    }
    await deleteClubWithDependents(tx as never, 'club-clean')
    expect(coachUpdateMany).toHaveBeenCalledWith({ where: { clubId: 'club-clean' }, data: { clubId: null } })
    expect(walletTxDeleteMany).not.toHaveBeenCalled()
    expect(clubDelete).toHaveBeenCalledWith({ where: { id: 'club-clean' } })
  })

  it('removes empty wallet before club delete', async () => {
    walletFindUnique.mockResolvedValue({ id: 'w1', balance: 0, availableBalance: 0, lockedBalance: 0 })
    const tx = {
      clubWallet: {
        findUnique: walletFindUnique,
        delete: walletDelete,
      },
      clubWalletTransaction: { deleteMany: walletTxDeleteMany },
      coach: { updateMany: coachUpdateMany },
      club: { delete: clubDelete },
    }
    await deleteClubWithDependents(tx as never, 'club-clean')
    expect(walletTxDeleteMany).toHaveBeenCalledWith({ where: { walletId: 'w1' } })
    expect(walletDelete).toHaveBeenCalledWith({ where: { id: 'w1' } })
    expect(clubDelete).toHaveBeenCalled()
  })
})