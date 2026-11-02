import { paymentRowChannelWhere } from '#shared/bookingPayment.ts'
import { adminPaymentCreatedAtFilter, parseAdminDateBound } from '../../utils/adminDateRange'
import { requireAdminSecret } from '../../utils/adminAuth'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const from = parseAdminDateBound(query.from, false)
  const to = parseAdminDateBound(query.to, true)

  const createdAtFilter = adminPaymentCreatedAtFilter(from, to)

  const paidBase = {
    status: 'PAID' as const,
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
  }

  const paidIpgWhere = { ...paidBase, ...paymentRowChannelWhere('IPG')! }
  const paidOnSiteWhere = { ...paidBase, ...paymentRowChannelWhere('ON_SITE')! }
  const paidWalletWhere = { ...paidBase, method: 'PAID' as const }

  const [
    paidAll,
    paidIpg,
    paidOnSite,
    paidWallet,
    paidOther,
    pendingWithdrawsClub,
    pendingWithdrawsAthlete,
    topClubsRaw,
  ] = await Promise.all([
    prisma.payment.aggregate({ where: paidBase, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: paidIpgWhere, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: paidOnSiteWhere, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: paidWalletWhere, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({
      where: {
        ...paidBase,
        method: { notIn: ['IPG', 'CASH', 'PAID'] },
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.withdrawRequest.aggregate({
      where: { status: 'PENDING' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.userWithdrawRequest.aggregate({
      where: { status: 'PENDING' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.findMany({
      where: {
        ...paidBase,
        NOT: { bookingId: null },
      },
      select: {
        amount: true,
        booking: {
          select: {
            slot: {
              select: {
                court: { select: { club: { select: { id: true, slug: true, nameFa: true } } } },
              },
            },
          },
        },
      },
      take: 5000,
    }),
  ])

  const clubTotals = new Map<string, { clubId: string; slug: string; nameFa: string; amount: number; count: number }>()
  for (const row of topClubsRaw) {
    const club = row.booking?.slot?.court?.club
    if (!club) continue
    const prev = clubTotals.get(club.id) || {
      clubId: club.id,
      slug: club.slug,
      nameFa: club.nameFa,
      amount: 0,
      count: 0,
    }
    prev.amount += row.amount
    prev.count += 1
    clubTotals.set(club.id, prev)
  }

  const clubBreakdown = [...clubTotals.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 25)

  return {
    range: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    },
    payments: {
      paidAmount: paidAll._sum.amount || 0,
      paidCount: paidAll._count,
      paidIpgAmount: paidIpg._sum.amount || 0,
      paidIpgCount: paidIpg._count,
      paidOnSiteAmount: paidOnSite._sum.amount || 0,
      paidOnSiteCount: paidOnSite._count,
      /** Wallet balance spend — not new money inflow from a bank gateway. */
      paidWalletAmount: paidWallet._sum.amount || 0,
      paidWalletCount: paidWallet._count,
      paidOtherAmount: paidOther._sum.amount || 0,
      paidOtherCount: paidOther._count,
    },
    withdrawals: {
      clubPendingAmount: pendingWithdrawsClub._sum.amount || 0,
      clubPendingCount: pendingWithdrawsClub._count,
      athletePendingAmount: pendingWithdrawsAthlete._sum.amount || 0,
      athletePendingCount: pendingWithdrawsAthlete._count,
      pendingAmount: (pendingWithdrawsClub._sum.amount || 0) + (pendingWithdrawsAthlete._sum.amount || 0),
      pendingCount: pendingWithdrawsClub._count + pendingWithdrawsAthlete._count,
    },
    clubBreakdown,
    notes: {
      wallet: 'paidWalletAmount is internal wallet spend (method PAID), not SEP/cash inflow.',
      clubBreakdown: 'Club breakdown uses up to 5000 recent PAID booking payments in range; coach-only payments may be omitted.',
    },
  }
})
