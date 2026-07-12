export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const query = getQuery(event)
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
    slots,
    clubOpenHour: club.openHour,
    clubCloseHour: club.closeHour,
    sessionDurationMinutes: club.defaultSessionDurationMinutes,
  }
})
