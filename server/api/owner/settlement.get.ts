import { getClubWithdrawableBalance } from '../../utils/settlement'
import { resolvePlatformCommissionBps } from '#shared/settlement.ts'
import { getClubShebaState, serializeShebaRequest } from '../../utils/shebaChange'
import { resolveShebaRequestUiStatus } from '#shared/shebaApproval.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'finance:payouts')

  const [walletBalances, recentCredits, pendingWithdraws, recentWithdraws, shebaState] = await Promise.all([
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
  ])

  const shebaUiStatus = resolveShebaRequestUiStatus({
    approvedSheba: shebaState.sheba,
    pendingRequest: shebaState.pendingRequest,
    lastRejected: shebaState.lastRejected,
  })

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
    balance: walletBalances.balance,
    availableBalance: walletBalances.availableBalance,
    lockedBalance: walletBalances.lockedBalance,
    withdrawableBalance: walletBalances.withdrawableBalance,
    pendingClassBalance: walletBalances.pendingClassBalance,
    commissionBps: resolvePlatformCommissionBps(),
    ledger: recentCredits.map((entry) => ({
      id: entry.id,
      paymentId: entry.paymentId,
      bookingId: entry.bookingId,
      classDate: entry.classDate,
      gross: entry.gross,
      commission: entry.commission,
      ownerNet: entry.ownerNet,
      clawedBackAt: entry.clawedBackAt,
      createdAt: entry.createdAt,
    })),
    pendingWithdraws,
    withdraws: recentWithdraws,
  }
})
