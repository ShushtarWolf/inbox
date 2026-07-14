import { isPastDate, isSlotStartInPast } from '#shared/localDate.ts'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clubSlug = query.club as string
  const date = (query.date as string) || todayDateStr()
  if (!clubSlug) throw createError({ statusCode: 400, statusMessage: 'club required' })

  const club = await prisma.club.findUnique({ where: { slug: clubSlug } })
  if (!club) throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  if (isPastDate(date)) return []

  await ensureSlotsForDate(club.id, date)

  const slots = await prisma.slot.findMany({
    where: { court: { clubId: club.id }, date, displayStatus: 'FREE' },
    include: { court: { include: { sport: true } } },
    orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
  })
  return slots.filter((slot) => !isSlotStartInPast(slot.date, slot.startTime))
})
