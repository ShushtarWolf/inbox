import { normalizeIranPhone } from './phone.ts'

export type OrphanGuestBooking = {
  id: string
  guestMobile: string
  guestName: string
  guestFamily: string | null
  createdAt: Date
}

/** Latest non-empty guest name pair for a phone group (by booking createdAt). */
export function pickDeskGuestNameForBackfill(rows: OrphanGuestBooking[]): {
  name?: string
  nameFamily?: string | null
} {
  const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  for (const row of sorted) {
    const name = row.guestName?.trim()
    if (name) {
      return {
        name,
        nameFamily: row.guestFamily?.trim() || null,
      }
    }
  }
  return {}
}

/** Group orphan bookings by normalized Iranian mobile; skip invalid phones. */
export function groupOrphanBookingsByPhone(
  rows: OrphanGuestBooking[],
): Map<string, OrphanGuestBooking[]> {
  const map = new Map<string, OrphanGuestBooking[]>()
  for (const row of rows) {
    const phone = normalizeIranPhone(row.guestMobile)
    if (!phone) continue
    const list = map.get(phone) || []
    list.push(row)
    map.set(phone, list)
  }
  return map
}