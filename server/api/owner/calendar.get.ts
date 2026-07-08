export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const query = getQuery(event)
  const date = (query.date as string) || todayDateStr()
  await ensureSlotsForDate(club.id, date)

  const courts = await prisma.court.findMany({
    where: { clubId: club.id },
    orderBy: { nameFa: 'asc' },
  })
  const slots = await prisma.slot.findMany({
    where: { court: { clubId: club.id }, date },
    include: { booking: true, court: true },
    orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
  })

  return { date, courts, slots }
})
