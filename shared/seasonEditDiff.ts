/**
 * Diff-based season edit: old live bookings and new form rows are both reduced to atomic
 * (court, date, hour) units, so overlapping form rows (18–20 and 19–21 on one court) count
 * 19:00 once, and unchanged hours keep their existing booking.
 */
import type { SeasonSessionOccurrence } from './seasonSessions.ts'

export type SeasonUnit = SeasonSessionOccurrence

export type ExistingSeasonUnit<T = unknown> = SeasonUnit & {
  bookingId: string
  /** Slot already started — never cancelled or re-created by an edit. */
  past: boolean
  ref?: T
}

/** HH:MM with zero padding (accepts "9:00" or "09:00:00"). */
export function normalizeUnitTime(raw: string): string {
  const [h, m] = String(raw || '').trim().split(':')
  const hh = String(Math.max(0, Math.min(24, Number(h) || 0))).padStart(2, '0')
  const mm = String(Math.max(0, Math.min(59, Number(m) || 0))).padStart(2, '0')
  return `${hh}:${mm}`
}

export function seasonUnitKey(unit: SeasonUnit): string {
  return `${unit.courtId}|${unit.date}|${normalizeUnitTime(unit.startTime)}`
}

/** Dedupe form occurrences into unique units (overlapping rows collapse). */
export function uniqueSeasonUnits(units: SeasonUnit[]): SeasonUnit[] {
  const seen = new Map<string, SeasonUnit>()
  for (const unit of units) {
    if (!unit?.date || !unit.startTime || !unit.courtId) continue
    const normalized = { date: unit.date, startTime: normalizeUnitTime(unit.startTime), courtId: unit.courtId }
    const key = seasonUnitKey(normalized)
    if (!seen.has(key)) seen.set(key, normalized)
  }
  return [...seen.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId))
}

export type SeasonEditDiff<T = unknown> = {
  /** Desired and already booked — booking left untouched. */
  unchanged: ExistingSeasonUnit<T>[]
  /** Desired, not booked yet — create (subject to conflict checks). */
  added: SeasonUnit[]
  /** Booked, future, no longer desired — cancel with normal refund rules. */
  removed: ExistingSeasonUnit<T>[]
  /** Booked but already started — always kept, even when no longer in the form. */
  keptPast: ExistingSeasonUnit<T>[]
}

export function diffSeasonUnits<T>(opts: {
  existing: ExistingSeasonUnit<T>[]
  desired: SeasonUnit[]
  /** Form units whose start is already past are ignored (cannot add a past hour). */
  isPast?: (unit: SeasonUnit) => boolean
}): SeasonEditDiff<T> {
  const desired = uniqueSeasonUnits(opts.desired)
  const desiredKeys = new Set(desired.map(seasonUnitKey))
  const existingByKey = new Map<string, ExistingSeasonUnit<T>>()
  const unchanged: ExistingSeasonUnit<T>[] = []
  const removed: ExistingSeasonUnit<T>[] = []
  const keptPast: ExistingSeasonUnit<T>[] = []

  for (const row of opts.existing) {
    const key = seasonUnitKey(row)
    // Two live bookings on one unit (legacy duplicate) — keep the first, treat others as removable.
    if (existingByKey.has(key)) {
      if (row.past) keptPast.push(row)
      else removed.push(row)
      continue
    }
    existingByKey.set(key, row)
    if (desiredKeys.has(key)) unchanged.push(row)
    else if (row.past) keptPast.push(row)
    else removed.push(row)
  }

  const added = desired.filter((unit) =>
    !existingByKey.has(seasonUnitKey(unit)) && !(opts.isPast?.(unit) ?? false))

  return { unchanged, added, removed, keptPast }
}

export function seasonEditHasChanges(diff: Pick<SeasonEditDiff, 'added' | 'removed'>): boolean {
  return diff.added.length > 0 || diff.removed.length > 0
}

export type SeasonUnitRange = { date: string; courtId: string; startTime: string; endTime: string; hours: number }

/** Merge back-to-back hours on the same date and court for display (18,19 → 18:00–20:00). */
export function aggregateSeasonUnits(units: SeasonUnit[], slotMinutes = 60): SeasonUnitRange[] {
  const toMin = (t: string) => {
    const [h, m] = normalizeUnitTime(t).split(':')
    return Number(h) * 60 + Number(m)
  }
  const fromMin = (n: number) => (n >= 24 * 60
    ? '24:00'
    : `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`)
  const sorted = uniqueSeasonUnits(units).sort((a, b) =>
    a.date.localeCompare(b.date) || a.courtId.localeCompare(b.courtId) || a.startTime.localeCompare(b.startTime))
  const out: SeasonUnitRange[] = []
  for (const unit of sorted) {
    const start = toMin(unit.startTime)
    const last = out[out.length - 1]
    if (last && last.date === unit.date && last.courtId === unit.courtId && toMin(last.endTime) === start) {
      last.endTime = fromMin(start + slotMinutes)
      last.hours += 1
      continue
    }
    out.push({ date: unit.date, courtId: unit.courtId, startTime: fromMin(start), endTime: fromMin(start + slotMinutes), hours: 1 })
  }
  return out
}
