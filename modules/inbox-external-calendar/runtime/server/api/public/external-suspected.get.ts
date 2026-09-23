import { getClubMapping, hasExternalMapping } from '../../lib/mappings'
import { fetchExternalOccupancy } from '../../lib/adapters'
import { persistAndMergeExternalOccupancy } from '../../lib/occupancySnapshots'
import { computeSuspectedSlots } from '../../lib/suspected'
import { loadPublicClubSlots, resolveActiveClubBySlug } from '../../lib/publicClubSlots'
import type { ManualOverrideRow } from '../../../../lib/manualOverrideLogic'

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

  const overrideRows = await prisma.manualAvailabilityOverride.findMany({
    where: { clubId: club.id, date },
    select: { courtId: true, startTime: true, type: true },
  })
  const manualOverrides: ManualOverrideRow[] = overrideRows.map((row) => ({
    courtId: row.courtId,
    startTime: row.startTime.slice(0, 5),
    type: row.type,
  }))

  const external = await fetchExternalOccupancy({
    mapping,
    date,
    courts,
    sessionDurationMinutes: club.defaultSessionDurationMinutes,
  })

  // Same reconcile path as owner calendar — confirmed EXTERNAL_BUSY only.
  const occupied = await persistAndMergeExternalOccupancy({
    clubId: club.id,
    date,
    liveOccupied: external.occupied,
    persistOccupied: external.persistOccupied,
    adapters: external.adapters,
  })

  return {
    // RELEASE → not suspected on public calendar (owner opened for Inboxs renters).
    suspected: computeSuspectedSlots(inboxSlots, occupied, manualOverrides),
  }
})
