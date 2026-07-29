import { getClubWalletBalance } from '../../utils/settlement'
import { resolvePlatformCommissionBps } from '#shared/settlement.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'finance:payouts')

  const [balance, recentCredits, pendingWithdraws, recentWithdraws] = await Promise.all([
    getClubWalletBalance(club.id),
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
    balance,
    commissionBps: resolvePlatformCommissionBps(),
    ledger: recentCredits.map((entry) => ({
      id: entry.id,
      paymentId: entry.paymentId,
      bookingId: entry.bookingId,
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
