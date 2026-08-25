export async function loadInboxOwnerCalendar(clubId: string, date: string) {
  await releaseExpiredOnlinePaymentHolds({ clubId })
  await ensureSlotsForDate(clubId, date)

  const club = await prisma.club.findUniqueOrThrow({ where: { id: clubId } })
  const courtsRaw = await prisma.court.findMany({
    where: { clubId },
    orderBy: { nameFa: 'asc' },
  })
  const courts = courtsRaw.map((court) => ({
    id: court.id,
    nameFa: court.nameFa,
    nameEn: court.nameEn,
    effectiveOpenHour: court.openHour ?? club.openHour,
    effectiveCloseHour: court.closeHour ?? club.closeHour,
  }))

  const slots = await prisma.slot.findMany({
    where: { court: { clubId }, date },
    include: {
      booking: { select: { status: true } },
    },
    orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
  })

  return {
    date,
    courts,
    slots: slots.map((slot) => ({
      courtId: slot.courtId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      displayStatus: slot.booking?.status === 'CANCELLED' ? 'FREE' : slot.displayStatus,
    })),
    sessionDurationMinutes: club.defaultSessionDurationMinutes,
    clubSlug: club.slug,
  }
}
