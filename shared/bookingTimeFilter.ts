/** Athlete history time chips — matches HTML prototype filterList (پیش‌رو / گذشته / همه). */

export type BookingTimeFilter = 'upcoming' | 'past' | 'all'

export function filterBookingsByTime<T extends { date: string; status: string }>(
  items: T[],
  timeFilter: BookingTimeFilter,
  todayIso: string,
): T[] {
  if (timeFilter === 'upcoming') {
    return items.filter((item) => item.status !== 'CANCELLED' && item.date >= todayIso)
  }
  if (timeFilter === 'past') {
    // HTML: cancelled (cx) lands in past even when the date is still upcoming.
    return items.filter((item) => item.date < todayIso || item.status === 'CANCELLED')
  }
  return items
}
