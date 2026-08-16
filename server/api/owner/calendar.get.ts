export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const query = getQuery(event)
  const from = typeof query.from === 'string' ? query.from : ''
  const to = typeof query.to === 'string' ? query.to : ''
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
        },
      },
      court: true,
    },
    orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
  })

  return {
    date,
    courts,
    // Cancelled rows still hold unique Booking.slotId — hide them so FREE hours reopen for desk reserve.
    slots: slots.map((slot) => ({
      ...slot,
      booking: slot.booking?.status === 'CANCELLED' ? null : slot.booking,
    })),
    clubOpenHour: club.openHour,
    clubCloseHour: club.closeHour,
    sessionDurationMinutes: club.defaultSessionDurationMinutes,
  }
})
