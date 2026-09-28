import { expandSeasonRules, type SeasonSessionOccurrence, type SeasonSessionRule } from './seasonSessions.ts'

/** Hard ceiling so one confirm cannot reserve a whole season of hourly slots. */
export const MAX_COACH_SERIES_OCCURRENCES = 48

export function expandCoachSeries(opts: {
  startDate: string
  finishDate: string
  rules: SeasonSessionRule[]
}): { ok: true; occurrences: SeasonSessionOccurrence[] } | { ok: false; reason: 'empty' | 'cap' } {
  const occurrences = expandSeasonRules(opts)
  if (!occurrences.length) return { ok: false, reason: 'empty' }
  if (occurrences.length > MAX_COACH_SERIES_OCCURRENCES) return { ok: false, reason: 'cap' }
  return { ok: true, occurrences }
}

export type CoachSeriesSlot = {
  id: string
  courtId: string
  date: string
  startTime: string
  endTime: string
  displayStatus: string
  /** True when a non-cancelled booking already sits on the slot. */
  bookingActive: boolean
  staleCancelledBookingId: string | null
  charge: number
  courtPrice: number
  pricingJson: string | null
}

export type CoachSeriesConflict = {
  date: string
  startTime: string
  courtId: string
  reason: 'missing' | 'taken' | 'busy'
}

function slotKey(courtId: string, date: string, startTime: string) {
  return `${courtId}|${date}|${startTime.slice(0, 5)}`
}

function coachBusyKey(date: string, startTime: string) {
  return `${date}|${startTime.slice(0, 5)}`
}

/**
 * Pair expanded rules with real slots. A coach cannot hold two courts at the same hour.
 * Any conflict means the caller must book nothing.
 */
export function matchCoachSeries(opts: {
  occurrences: SeasonSessionOccurrence[]
  slots: CoachSeriesSlot[]
  busyKeys: Iterable<string>
}): {
  bookable: CoachSeriesSlot[]
  conflicts: CoachSeriesConflict[]
  totalCourtCharge: number
} {
  const byKey = new Map<string, CoachSeriesSlot>()
  for (const slot of opts.slots) {
    byKey.set(slotKey(slot.courtId, slot.date, slot.startTime), slot)
  }
  const busy = new Set(opts.busyKeys)
  const bookable: CoachSeriesSlot[] = []
  const conflicts: CoachSeriesConflict[] = []

  for (const row of opts.occurrences) {
    const time = row.startTime.slice(0, 5)
    const busyKey = coachBusyKey(row.date, time)
    if (busy.has(busyKey)) {
      conflicts.push({ date: row.date, startTime: time, courtId: row.courtId, reason: 'busy' })
      continue
    }
    const slot = byKey.get(slotKey(row.courtId, row.date, time))
    if (!slot) {
      conflicts.push({ date: row.date, startTime: time, courtId: row.courtId, reason: 'missing' })
      continue
    }
    const free = slot.displayStatus === 'FREE' && !slot.bookingActive
    if (!free) {
      conflicts.push({ date: row.date, startTime: time, courtId: row.courtId, reason: 'taken' })
      continue
    }
    busy.add(busyKey)
    bookable.push({ ...slot, startTime: time })
  }

  return {
    bookable,
    conflicts,
    totalCourtCharge: bookable.reduce((sum, slot) => sum + slot.charge, 0),
  }
}

export function coachBusyKeyFromSession(date: string, startTime: string) {
  return coachBusyKey(date, startTime)
}
