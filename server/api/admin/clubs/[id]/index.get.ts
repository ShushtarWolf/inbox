import { paymentRowChannelWhere } from '#shared/bookingPayment.ts'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, email: true, name: true, phone: true, disabledAt: true } },
      courts: {
        select: { id: true, nameFa: true, nameEn: true, sport: { select: { slug: true, nameFa: true } } },
        orderBy: { nameFa: 'asc' },
      },
      memberships: {
        where: { active: true },
        select: {
          role: true,
          user: { select: { id: true, email: true, name: true } },
        },
        take: 20,
      },
      _count: { select: { courts: true, media: true } },
    },
  })

  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  const clubPaidParent = {
    OR: [
      { booking: { is: { slot: { court: { clubId: club.id } } } } },
      { coachSession: { is: { coach: { clubId: club.id } } } },
    ],
  }

  const [bookingCount, wallet, pendingWithdraws, walletTx, paidIpg, paidOnSite] = await Promise.all([
    prisma.booking.count({
      where: { slot: { court: { clubId: club.id } } },
    }),
    prisma.clubWallet.findUnique({ where: { clubId: club.id } }),
    prisma.withdrawRequest.findMany({
      where: { clubId: club.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.clubWalletTransaction.findMany({
      where: { wallet: { clubId: club.id } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.payment.aggregate({
      where: {
        AND: [{ status: 'PAID' }, paymentRowChannelWhere('IPG')!, clubPaidParent],
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        AND: [{ status: 'PAID' }, paymentRowChannelWhere('ON_SITE')!, clubPaidParent],
      },
      _sum: { amount: true },
      _count: true,
    }),
  ])

  return {
    id: club.id,
    slug: club.slug,
    nameFa: club.nameFa,
    nameEn: club.nameEn,
    city: club.city,
    district: club.district,
    addressFa: club.addressFa,
    status: club.status,
    phone: club.phone,
    openHour: club.openHour,
    closeHour: club.closeHour,
    priceFrom: club.priceFrom,
    priceTo: club.priceTo,
    owner: club.owner,
    courts: club.courts,
    staff: club.memberships,
    courtCount: club._count.courts,
    mediaCount: club._count.media,
    bookingCount,
    paidIpgAmount: paidIpg._sum.amount || 0,
    paidOnSiteAmount: paidOnSite._sum.amount || 0,
    sheba: club.sheba,
    wallet: {
      balance: wallet?.balance ?? 0,
      pendingWithdrawCount: pendingWithdraws.length,
      pendingWithdrawAmount: pendingWithdraws.reduce((sum, row) => sum + row.amount, 0),
      pendingWithdraws: pendingWithdraws.map((row) => ({
        id: row.id,
        amount: row.amount,
        shebaSnapshot: row.shebaSnapshot,
        createdAt: row.createdAt,
      })),
      transactions: walletTx.map((row) => ({
        id: row.id,
        amount: row.amount,
        type: row.type,
        note: row.note,
        createdAt: row.createdAt,
        bookingId: row.bookingId,
        withdrawRequestId: row.withdrawRequestId,
      })),
    },
  }
})
