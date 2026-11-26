import type { BookingTimeFilter } from './bookingTimeFilter.ts'

export type BookingHistorySortRow = {
  date: string
  startTime: string
  status: string
  /** Court name or coach title — tiebreaker after session start. */
  tieBreaker: string
}

function sessionStartKey(row: BookingHistorySortRow): string {
  return `${row.date}T${row.startTime || '00:00'}`
}

/** Ascending by session start, then tieBreaker (e.g. court name). */
export function compareBookingHistoryBySessionStart(
  a: BookingHistorySortRow,
  b: BookingHistorySortRow,
): number {
  const byStart = sessionStartKey(a).localeCompare(sessionStartKey(b))
  if (byStart !== 0) return byStart
  return a.tieBreaker.localeCompare(b.tieBreaker, 'fa')
}

function isUpcomingLive(row: BookingHistorySortRow, todayIso: string): boolean {
  return row.status !== 'CANCELLED' && row.date >= todayIso
}

/**
 * Athlete history list order — پیش‌رو nearest-first; گذشته most-recent-first;
 * همه upcoming (live) ascending, then everything else descending.
 */
export function sortBookingHistoryItems<T extends BookingHistorySortRow>(
  items: T[],
  timeFilter: BookingTimeFilter,
  todayIso: string,
): T[] {
  const copy = [...items]
  if (timeFilter === 'upcoming') {
    copy.sort(compareBookingHistoryBySessionStart)
    return copy
  }
  if (timeFilter === 'past') {
    copy.sort((a, b) => -compareBookingHistoryBySessionStart(a, b))
    return copy
  }
  const upcoming: T[] = []
  const rest: T[] = []
  for (const row of copy) {
    if (isUpcomingLive(row, todayIso)) upcoming.push(row)
    else rest.push(row)
  }
  upcoming.sort(compareBookingHistoryBySessionStart)
  rest.sort((a, b) => -compareBookingHistoryBySessionStart(a, b))
  return [...upcoming, ...rest]
}