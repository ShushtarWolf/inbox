import { isOwnerRecurringBooking } from '#shared/recurringReserve.ts'
import { resolveClubSlugAlias } from '#shared/clubSlugAliases.ts'
import { requireAdminSecret } from '../../utils/adminAuth'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const clubSlug = resolveClubSlugAlias(typeof query.clubSlug === 'string' ? query.clubSlug.trim() : '')
  const from = typeof query.from === 'string' ? query.from : ''
  const to = typeof query.to === 'string' ? query.to : ''

  if (!clubSlug) {
    throw createError({ statusCode: 400, statusMessage: 'clubSlug required' })
  }

  const club = await prisma.club.findFirst({
    where: { slug: clubSlug, status: 'ACTIVE' },
  })
  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  await releaseExpiredOnlinePaymentHolds({ clubId: club.id })

  if (from && to) {
    const monthSlots = await prisma.slot.findMany({
      where: { court: { clubId: club.id }, date: { gte: from, lte: to } },
      select: { date: true, displayStatus: true },
    })
    const busyDates = new Set<string>()
    const softDates = new Set<string>()
    for (const slot of monthSlots) {
      if (slot.displayStatus === 'PENDING') softDates.add(slot.date)
      else if (slot.displayStatus !== 'FREE' && slot.displayStatus !== 'CANCELLED') busyDates.add(slot.date)
    }
    return { busyDates: [...busyDates], softDates: [...softDates] }
  }

  const date = (query.date as string) || todayDateStr()
  await ensureSlotsForDate(club.id, date)

  const courtsRaw = await prisma.court.findMany({
    where: { clubId: club.id },
    orderBy: { nameFa: 'asc' },
  })
  const courts = courtsRaw.map((court) => ({
    ...court,
    effectiveOpenHour: court.openHour ?? club.openHour,
    effectiveCloseHour: court.closeHour ?? club.closeHour,
  }))
  const slots = await prisma.slot.findMany({
    where: { court: { clubId: club.id }, date },
    include: {
      booking: {
        include: {
          payment: true,
          bookingEquipments: { include: { equipment: true } },
          events: {
            where: { type: 'CREATED' },
            select: { metadataJson: true },
            take: 8,
          },
        },
      },
      court: true,
    },
    orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
  })

  return {
    date,
    clubSlug: club.slug,
    courts,
    slots: slots.map((slot) => {
      const booking = slot.booking?.status === 'CANCELLED' ? null : slot.booking
      if (!booking) return { ...slot, booking: null }
      const { events, ...rest } = booking
      return {
        ...slot,
        booking: {
          ...rest,
          isRecurring: isOwnerRecurringBooking({
            packageDraftId: booking.packageDraftId,
            events,
          }),
        },
      }
    }),
    clubOpenHour: club.openHour,
    clubCloseHour: club.closeHour,
    sessionDurationMinutes: club.defaultSessionDurationMinutes,
  }
})
