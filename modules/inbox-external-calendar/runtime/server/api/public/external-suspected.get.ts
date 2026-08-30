import { getClubMapping, hasExternalMapping } from '../../lib/mappings'
import { fetchExternalOccupancy } from '../../lib/adapters'
import { persistAndMergeExternalOccupancy } from '../../lib/occupancySnapshots'
import { computeSuspectedSlots } from '../../lib/suspected'
import { loadPublicClubSlots, resolveActiveClubBySlug } from '../../lib/publicClubSlots'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  const clubSlug = typeof query.club === 'string' ? query.club : ''
  const date = (typeof query.date === 'string' && query.date) ? query.date : todayDateStr()

  const club = await resolveActiveClubBySlug(clubSlug)
  if (!club || !hasExternalMapping(club.slug)) {
    return { suspected: [] as Array<{ slotId?: string; startTime: string; courtId: string; suspected: true }> }
  }

  const mapping = getClubMapping(club.slug)
  const inboxSlots = await loadPublicClubSlots(club.id, date)
  if (!inboxSlots.length) return { suspected: [] }

  const courtsRaw = await prisma.court.findMany({
    where: { clubId: club.id },
    orderBy: { nameFa: 'asc' },
  })
  const courts = courtsRaw.map((court) => ({
    id: court.id,
    nameFa: court.nameFa,
    nameEn: court.nameEn,
    effectiveOpenHour: court.openHour ?? club.openHour,
    effectiveCloseHour: court.closeHour ?? club.closeHour,
  }))

  const external = await fetchExternalOccupancy({
    mapping,
    date,
    courts,
    sessionDurationMinutes: club.defaultSessionDurationMinutes,
  })

  const occupied = await persistAndMergeExternalOccupancy({
    clubId: club.id,
    date,
    liveOccupied: external.occupied,
  })

  return {
    suspected: computeSuspectedSlots(inboxSlots, occupied),
  }
})
