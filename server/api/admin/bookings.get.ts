export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 50, 100)

  const bookings = await prisma.booking.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, email: true, name: true } },
      payment: { select: { id: true, amount: true, status: true, method: true } },
      slot: {
        include: {
          court: {
            include: {
              club: { select: { id: true, nameFa: true, nameEn: true, slug: true, city: true } },
            },
          },
        },
      },
    },
  })

  return {
    bookings: bookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      source: booking.source,
      createdAt: booking.createdAt,
      guestName: booking.guestName,
      guestMobile: booking.guestMobile,
      user: booking.user,
      payment: booking.payment,
      club: booking.slot.court.club,
      courtNameFa: booking.slot.court.nameFa,
      date: booking.slot.date,
      startTime: booking.slot.startTime,
    })),
  }
})
