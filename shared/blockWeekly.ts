import { clampWeeklyWeeks, weeklyOccurrenceDates } from './weeklyOccurrences.ts'

export type BlockConflictReason = 'OCCUPIED' | 'PAST' | 'OUTSIDE_HOURS' | 'CLAIM_RACE' | 'MISSING'

export type BlockSlotRef = {
  date: string
  startTime: string
  courtId?: string
  slotId?: string
}

export type BlockConflictRef = BlockSlotRef & {
  reason: BlockConflictReason
}

export type WeeklyBlockAnchor = {
  courtId: string
  startTime: string
  anchorDate: string
}

export type UnblockConflictReason = 'NOT_BLOCKED' | 'NOT_CLUB' | 'MISSING'

export type UnblockConflictRef = BlockSlotRef & {
  reason: UnblockConflictReason
}

/**
 * Whether owner block may claim/update this slot (mirrors /api/owner/block rules).
 * FREE always; BLOCKED only when no live booking or CLUB-sourced booking.
 */
export function classifyBlockCandidate(opts: {
  displayStatus?: string | null
  bookingSource?: string | null
  bookingStatus?: string | null
}): 'BLOCKABLE' | 'OCCUPIED' {
  const status = opts.displayStatus || 'FREE'
  if (status === 'FREE') return 'BLOCKABLE'
  if (status === 'BLOCKED') {
    const live = Boolean(opts.bookingStatus && opts.bookingStatus !== 'CANCELLED')
    if (!live) return 'BLOCKABLE'
    if (opts.bookingSource === 'CLUB') return 'BLOCKABLE'
    return 'OCCUPIED'
  }
  return 'OCCUPIED'
}

/** Whether owner may unblock this slot (club block or empty BLOCKED). */
export function classifyUnblockCandidate(opts: {
  displayStatus?: string | null
  bookingSource?: string | null
  bookingStatus?: string | null
}): 'UNBLOCKABLE' | 'NOT_BLOCKED' | 'NOT_CLUB' {
  const status = opts.displayStatus || 'FREE'
  if (status !== 'BLOCKED') return 'NOT_BLOCKED'
  const live = Boolean(opts.bookingStatus && opts.bookingStatus !== 'CANCELLED')
  if (!live) return 'UNBLOCKABLE'
  if (opts.bookingSource === 'CLUB') return 'UNBLOCKABLE'
  return 'NOT_CLUB'
}

/** Unique (court, date, startTime) rows for every anchor × weekly occurrence. */
export function expandWeeklyAnchorOccurrences(
  anchors: WeeklyBlockAnchor[],
  weeks: number,
): Array<{ courtId: string; startTime: string; date: string }> {
  const n = clampWeeklyWeeks(weeks)
  const seen = new Set<string>()
  const rows: Array<{ courtId: string; startTime: string; date: string }> = []
  for (const anchor of anchors) {
    const startTime = anchor.startTime.slice(0, 5)
    for (const date of weeklyOccurrenceDates(anchor.anchorDate, n)) {
      const key = `${anchor.courtId}|${date}|${startTime}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ courtId: anchor.courtId, startTime, date })
    }
  }
  return rows
}
