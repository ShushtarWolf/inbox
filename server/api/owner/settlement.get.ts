import { getClubWithdrawableBalance } from '../../utils/settlement'
import { resolveClubCommissionBps } from '#shared/settlement.ts'
import {
  attachClubWalletBalanceAfter,
  CLUB_WALLET_STATEMENT_TYPES,
  clubWalletStatementSignedAmount,
} from '#shared/clubWalletStatement.ts'
import { loadPlatformCommissionBps } from '../../utils/platformCommission.ts'
import { getClubShebaState, serializeShebaRequest } from '../../utils/shebaChange'
import { resolveShebaRequestUiStatus } from '#shared/shebaApproval.ts'

export default defineEventHandler(async (event) => {
  // Read wallet/statement with finance:view; withdraw POST still requires finance:payouts.
  const { club } = await requireOwnerClub(event, 'finance:view')

  const [walletBalances, recentCredits, pendingWithdraws, recentWithdraws, shebaState, walletRow] = await Promise.all([
    getClubWithdrawableBalance(club.id),
    prisma.settlementLedgerEntry.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.withdrawRequest.findMany({
      where: { clubId: club.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.withdrawRequest.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    getClubShebaState(club.id),
    prisma.clubWallet.findUnique({
      where: { clubId: club.id },
      select: { id: true },
    }),
  ])

  const platformCommissionBps = await loadPlatformCommissionBps()

  const shebaUiStatus = resolveShebaRequestUiStatus({
    approvedSheba: shebaState.sheba,
    pendingRequest: shebaState.pendingRequest,
    lastRejected: shebaState.lastRejected,
  })

  /** Release schedule shares pendingClassBalance math (season unlock, clawbacks, blocked IPG). */
  const pendingReleases = walletBalances.pendingReleases

  const statementRowsRaw = walletRow
    ? await prisma.clubWalletTransaction.findMany({
      where: {
        walletId: walletRow.id,
        type: { in: [...CLUB_WALLET_STATEMENT_TYPES] },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        amount: true,
        type: true,
        note: true,
        createdAt: true,
        paymentId: true,
        bookingId: true,
        withdrawRequestId: true,
      },
    })
    : []

  const withdrawIds = statementRowsRaw
    .map((row) => row.withdrawRequestId)
    .filter((id): id is string => Boolean(id))
  const withdrawAmounts = withdrawIds.length
    ? await prisma.withdrawRequest.findMany({
      where: { id: { in: withdrawIds } },
      select: { id: true, amount: true },
    })
    : []
  const withdrawAmountById = new Map(withdrawAmounts.map((row) => [row.id, row.amount]))

  const statementBase = statementRowsRaw.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount,
    note: row.note,
    createdAt: row.createdAt,
    paymentId: row.paymentId,
    bookingId: row.bookingId,
    withdrawRequestId: row.withdrawRequestId,
    withdrawAmount: row.withdrawRequestId ? (withdrawAmountById.get(row.withdrawRequestId) ?? null) : null,
  }))
  const statementWithBalance = attachClubWalletBalanceAfter(statementBase, walletBalances.balance)
  const statement = statementWithBalance.map((row) => ({
    id: row.id,
    type: row.type,
    /** Signed owner-facing amount (WITHDRAW_PAID uses request amount). */
    signedAmount: clubWalletStatementSignedAmount(row),
    balanceAfter: row.balanceAfter,
    note: row.note,
    createdAt: row.createdAt,
    paymentId: row.paymentId,
    bookingId: row.bookingId,
  }))

  const withdrawable = walletBalances.withdrawableBalance
  const pendingRelease = walletBalances.pendingClassBalance
  // lockedBalance also holds class-locked credits (already in pendingRelease) — only open withdraw requests are "in payout".
  const inPayout = pendingWithdraws.reduce((sum, req) => sum + req.amount, 0)
  const balance = walletBalances.balance
  const debt = balance < 0 ? Math.abs(balance) : 0
  // Soft check — debt / blocked payments / season unlock can leave a gap; UI must not invent equality.
  const partsSum = withdrawable + pendingRelease + inPayout - debt
  const walletPartsGap = Math.abs(partsSum - Math.max(0, balance))

  return {
    sheba: shebaState.sheba,
    shebaUiStatus,
    pendingShebaRequest: shebaState.pendingRequest ? serializeShebaRequest(shebaState.pendingRequest) : null,
    lastShebaRejection: shebaState.lastRejected
      ? {
          adminNote: shebaState.lastRejected.adminNote,
          reviewedAt: shebaState.lastRejected.reviewedAt?.toISOString() ?? null,
        }
      : null,
    balance,
    availableBalance: walletBalances.availableBalance,
    lockedBalance: walletBalances.lockedBalance,
    withdrawableBalance: withdrawable,
    pendingClassBalance: pendingRelease,
    /** Snapp-style wallet parts (online rail only). */
    wallet: {
      balance,
      withdrawable,
      pendingRelease,
      inPayout,
      debt,
      partsGap: walletPartsGap,
    },
    pendingReleases,
    statement,
    commissionBps: resolveClubCommissionBps(club.commissionBps, platformCommissionBps),
    ledger: recentCredits.map((entry) => ({
      id: entry.id,
      paymentId: entry.paymentId,
      bookingId: entry.bookingId,
      classDate: entry.classDate,
      gross: entry.gross,
      commissionBps: entry.commissionBps,
      commission: entry.commission,
      ownerNet: entry.ownerNet,
      clawedBackAt: entry.clawedBackAt,
      createdAt: entry.createdAt,
    })),
    pendingWithdraws,
    withdraws: recentWithdraws,
  }
})
