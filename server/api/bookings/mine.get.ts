import { linkOrphanBookingsByPhone } from '../../utils/phoneAuth'
import {
  buildSeasonRegisteredSessionCountMaps,
  parseSeriesPaymentMeta,
  resolveSeasonSessionCountForDisplay,
} from '#shared/athleteSeason.ts'
import { athleteEffectiveBookingStatus } from '#shared/athleteHistoryStatus.ts'

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

  const seasonCountMaps = buildSeasonRegisteredSessionCountMaps(
    courtBookings.map((booking) => booking.payment),
  )

  return {
    courtBookings: courtBookings.map((booking) => {
      const meta = parseSeriesPaymentMeta(booking.payment?.metadataJson)
      const seasonBookingId = meta.seasonBookingId?.trim() || null
      const athleteStatus = athleteEffectiveBookingStatus(booking)
      return {
        ...booking,
        athleteStatus,
        seasonBookingId,
        seasonSessionCount: seasonBookingId
          ? resolveSeasonSessionCountForDisplay(meta, seasonCountMaps)
          : null,
      }
    }),
    coachSessions,
    packageBookings,
  }
})
