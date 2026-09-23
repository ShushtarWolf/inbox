import { createError } from 'h3'
import { slotOccupancyKey } from '../../../lib/bookingGuardLogic'
import { logExternalCollection } from '../../../lib/collectionLog'
import { findBookingGuardBlockedSlots, type ManualOverrideRow } from '../../../lib/manualOverrideLogic'
import { fetchExternalOccupancy } from './adapters'
import { getClubMapping, hasExternalMapping } from './mappings'

export type ExternalBookingSlot = {
  courtId: string
  date: string
  startTime: string
}

export type ExternalBookingClub = {
  id: string
  slug: string
  defaultSessionDurationMinutes: number
  openHour: number
  closeHour: number
}

/**
 * Live external occupancy check for booking APIs.
 * Blocks only on reconciled EXTERNAL_BUSY; never uses DB snapshots.
 */
export async function assertExternalBookingAllowed(opts: {
  club: ExternalBookingClub
  slots: ExternalBookingSlot[]
}): Promise<void> {
  if (!hasExternalMapping(opts.club.slug) || !opts.slots.length) return

  const started = Date.now()
  logExternalCollection('booking_guard_start', {
    clubSlug: opts.club.slug,
    clubId: opts.club.id,
    slotCount: opts.slots.length,
    dates: [...new Set(opts.slots.map((slot) => slot.date))],
  })

  const courtsRaw = await prisma.court.findMany({
    where: { clubId: opts.club.id },
    orderBy: { nameFa: 'asc' },
  })
  const courts = courtsRaw.map((court) => ({
    id: court.id,
    nameFa: court.nameFa,
    effectiveOpenHour: court.openHour ?? opts.club.openHour,
    effectiveCloseHour: court.closeHour ?? opts.club.closeHour,
  }))

  const mapping = getClubMapping(opts.club.slug)
  const blocked: Array<{ courtId: string; startTime: string; date: string }> = []
  const dates = [...new Set(opts.slots.map((slot) => slot.date))]
  const overrideRows = await prisma.manualAvailabilityOverride.findMany({
    where: { clubId: opts.club.id, date: { in: dates } },
    select: { courtId: true, date: true, startTime: true, type: true },
  })
  const overridesByDate = new Map<string, ManualOverrideRow[]>()
  for (const row of overrideRows) {
    const list = overridesByDate.get(row.date) ?? []
    list.push({
      courtId: row.courtId,
      startTime: row.startTime.slice(0, 5),
      type: row.type,
    })
    overridesByDate.set(row.date, list)
  }

  for (const date of dates) {
    const dateSlots = opts.slots.filter((slot) => slot.date === date)
    let external: Awaited<ReturnType<typeof fetchExternalOccupancy>>
    try {
      external = await fetchExternalOccupancy({
        mapping,
        date,
        courts,
        sessionDurationMinutes: opts.club.defaultSessionDurationMinutes,
      })
    } catch (error) {
      // Availability-first: unexpected fetch failure → UNKNOWN, never block booking.
      logExternalCollection('booking_guard_fetch_failed', {
        clubSlug: opts.club.slug,
        clubId: opts.club.id,
        date,
        slotCount: dateSlots.length,
        error: error instanceof Error ? error.message : String(error),
        policy: 'fail_open_unknown',
      })
      continue
    }

    const dateBlocked = findBookingGuardBlockedSlots(
      dateSlots,
      external.occupied,
      overridesByDate.get(date) ?? [],
    )
    for (const row of dateBlocked) {
      blocked.push({ ...row, date })
    }
  }

  if (blocked.length) {
    const manualOnly = blocked.every((row) => {
      const key = slotOccupancyKey(row.courtId, row.startTime)
      const override = overridesByDate.get(row.date)?.find(
        (item) => slotOccupancyKey(item.courtId, item.startTime) === key,
      )
      return override?.type === 'BLOCK'
    })
    logExternalCollection('booking_guard_blocked', {
      clubSlug: opts.club.slug,
      clubId: opts.club.id,
      blocked,
      manualOnly,
      durationMs: Date.now() - started,
    })
    throw createError({
      statusCode: 409,
      statusMessage: manualOnly ? 'Slot not available' : 'Slot occupied on external booking site',
    })
  }

  logExternalCollection('booking_guard_done', {
    clubSlug: opts.club.slug,
    clubId: opts.club.id,
    slotCount: opts.slots.length,
    blockedCount: 0,
    durationMs: Date.now() - started,
  })
}
