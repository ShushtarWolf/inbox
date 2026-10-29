import { isOwnerRecurringBooking } from '#shared/recurringReserve.ts'
import { healedDisplayStatusForFreeSlot } from '#shared/slotBookingConsistency.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const query = getQuery(event)
  const from = typeof query.from === 'string' ? query.from : ''
  const to = typeof query.to === 'string' ? query.to : ''

  // Free expired unpaid online holds so owner grid matches public availability.
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
          user: { select: { name: true } },
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

  // Self-heal FREE slots that still carry a live booking (e.g. a desk block whose slot
  // drifted to FREE): otherwise the grid shows a bookable cell with only a ★ note.
  for (const slot of slots) {
    const healed = healedDisplayStatusForFreeSlot({
      displayStatus: slot.displayStatus,
      booking: slot.booking
        ? {
            status: slot.booking.status,
            source: slot.booking.source,
            hasPayment: Boolean(slot.booking.payment),
            packageDraftId: slot.booking.packageDraftId,
            coachId: slot.booking.coachId,
          }
        : null,
    })
    if (!healed) continue
    const res = await prisma.slot.updateMany({
      where: { id: slot.id, displayStatus: 'FREE' },
      data: { displayStatus: healed },
    })
    if (res.count === 1) {
      console.warn('[owner-calendar:heal-free-with-booking]', {
        slotId: slot.id, bookingId: slot.booking?.id, date: slot.date, startTime: slot.startTime, to: healed,
      })
      slot.displayStatus = healed
    }
  }

  return {
    date,
    courts,
    // Cancelled rows still hold unique Booking.slotId — hide them so FREE hours reopen for desk reserve.
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
