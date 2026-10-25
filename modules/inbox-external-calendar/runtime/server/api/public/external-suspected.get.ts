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
    return { suspected: [] as Array<{ slotId?: string; startTime: string; courtId: string; suspected: true }>, uncertain: [] as Array<{ slotId?: string; startTime: string; courtId: string }> }
  }

  const mapping = getClubMapping(club.slug)
  const inboxSlots = await loadPublicClubSlots(club.id, date)
  if (!inboxSlots.length) return { suspected: [], uncertain: [] }

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

  const suspected = computeSuspectedSlots(inboxSlots, occupied, manualOverrides)
  const suspectedKeys = new Set(suspected.map((row) => `${row.courtId}:${row.startTime}`))
  const releaseKeys = new Set(
    manualOverrides.filter((row) => row.type === 'RELEASE').map((row) => `${row.courtId}:${row.startTime}`),
  )
  const uncertainKeys = new Set((external.uncertain ?? []).map((row) => `${row.courtKey}:${row.startTime.slice(0, 5)}`))
  // Guest-facing: UNKNOWN/STALE with no confident FREE → non-bookable «وضعیت نامشخص».
  const uncertain = inboxSlots
    .filter((slot) => {
      if (slot.displayStatus && slot.displayStatus !== 'FREE') return false
      const key = `${slot.courtId}:${slot.startTime.slice(0, 5)}`
      return uncertainKeys.has(key) && !releaseKeys.has(key) && !suspectedKeys.has(key)
    })
    .map((slot) => ({ slotId: slot.id, startTime: slot.startTime.slice(0, 5), courtId: slot.courtId }))

  return {
    uncertain,
    // RELEASE → not suspected on public calendar (owner opened for Inboxs renters).
    suspected,
  }
})
