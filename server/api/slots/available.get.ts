import { isPastDate, isSlotStartInPast } from '#shared/localDate.ts'
import { resolveClubSlugAlias } from '#shared/clubSlugAliases.ts'
import { releaseExpiredOnlinePaymentHolds } from '../../utils/onlinePaymentHold'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clubSlug = resolveClubSlugAlias(String(query.club || ''))
  const date = (query.date as string) || todayDateStr()
  if (!clubSlug) throw createError({ statusCode: 400, statusMessage: 'club required' })

  const club = await prisma.club.findUnique({ where: { slug: clubSlug } })
  if (!club || club.status !== 'ACTIVE') {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  if (isPastDate(date)) return []

  await ensureSlotsForDate(club.id, date)
  await releaseExpiredOnlinePaymentHolds({ clubId: club.id })

  // Public club detail needs booked/blocked cells for Canva legend; default stays FREE-only for booking APIs.
  const includeUnavailable = query.includeUnavailable === '1' || query.includeUnavailable === 'true'

  const slots = await prisma.slot.findMany({
    where: {
      court: { clubId: club.id },
      date,
      ...(includeUnavailable
        ? { displayStatus: { not: 'CLOSED' } }
        : { displayStatus: 'FREE' }),
    },
    include: { court: { include: { sport: true } } },
    orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
  })
  return slots.filter((slot) => !isSlotStartInPast(slot.date, slot.startTime))
})
