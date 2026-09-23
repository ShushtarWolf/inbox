import { linkOrphanBookingsByPhone } from '../../utils/phoneAuth'
import { parseSeriesPaymentMeta } from '#shared/athleteSeason.ts'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  // Desk (CLUB) bookings were often created with guestMobile but no userId.
  // Link them when the athlete opens My Bookings so cancel/reschedule also work.
  await linkOrphanBookingsByPhone(user.id, user.phone)

  const courtBookings = await prisma.booking.findMany({
    where: { userId: user.id },
    include: {
      slot: { include: { court: { include: { club: true, sport: true } } } },
      coach: true,
      payment: true,
      bookingEquipments: { include: { equipment: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  const coachSessions = await prisma.coachSession.findMany({
    where: { athleteId: user.id },
    include: { coach: { include: { sport: true, club: true } }, payment: true },
    orderBy: { createdAt: 'desc' },
  })
  const packageBookings = await prisma.packageBooking.findMany({
    where: { athleteId: user.id },
    include: {
      package: { include: { club: true, coach: true } },
      payment: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const seasonCounts = new Map<string, number>()
  for (const booking of courtBookings) {
    if (booking.status === 'CANCELLED') continue
    const seasonId = parseSeriesPaymentMeta(booking.payment?.metadataJson).seasonBookingId
    if (!seasonId) continue
    seasonCounts.set(seasonId, (seasonCounts.get(seasonId) || 0) + 1)
  }

  return {
    courtBookings: courtBookings.map((booking) => {
      const seasonBookingId = parseSeriesPaymentMeta(booking.payment?.metadataJson).seasonBookingId || null
      return {
        ...booking,
        seasonBookingId,
        seasonSessionCount: seasonBookingId ? (seasonCounts.get(seasonBookingId) || 0) : null,
      }
    }),
    coachSessions,
    packageBookings,
  }
})
