import { createError } from 'h3'
import { findExternallyBlockedSlots } from '../../../lib/bookingGuardLogic'
import { logExternalCollection } from '../../../lib/collectionLog'
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

  for (const date of [...new Set(opts.slots.map((slot) => slot.date))]) {
    const dateSlots = opts.slots.filter((slot) => slot.date === date)
    const external = await fetchExternalOccupancy({
      mapping,
      date,
      courts,
      sessionDurationMinutes: opts.club.defaultSessionDurationMinutes,
    })

    const dateBlocked = findExternallyBlockedSlots(dateSlots, external.occupied)
    for (const row of dateBlocked) {
      blocked.push({ ...row, date })
    }
  }

  if (blocked.length) {
    logExternalCollection('booking_guard_blocked', {
      clubSlug: opts.club.slug,
      clubId: opts.club.id,
      blocked,
      durationMs: Date.now() - started,
    })
    throw createError({
      statusCode: 409,
      statusMessage: 'Slot occupied on external booking site',
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
