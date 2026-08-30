import { getClubWithdrawableBalance } from '../../utils/settlement'
import { resolvePlatformCommissionBps } from '#shared/settlement.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'finance:payouts')

  const [walletBalances, recentCredits, pendingWithdraws, recentWithdraws] = await Promise.all([
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
  ])

  return {
    sheba: club.sheba,
    balance: walletBalances.balance,
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
