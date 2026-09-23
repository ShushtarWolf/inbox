export type ConfirmedOccupiedRow = {
  courtKey: string
  startTime: string
  state?: string
}

export function slotOccupancyKey(courtId: string, startTime: string): string {
  return `${courtId}:${startTime.slice(0, 5)}`
}

/** Confirmed EXTERNAL_BUSY rows only — live reconcile output, not raw adapter union. */
export function confirmedExternalBusyKeys(occupied: ConfirmedOccupiedRow[]): Set<string> {
  const keys = new Set<string>()
  for (const row of occupied) {
    if (row.state && row.state !== 'EXTERNAL_BUSY') continue
    keys.add(slotOccupancyKey(row.courtKey, row.startTime))
  }
  return keys
}

export type BookingSlotRef = {
  courtId: string
  startTime: string
}

export function findExternallyBlockedSlots(
  slots: BookingSlotRef[],
  occupied: ConfirmedOccupiedRow[],
): BookingSlotRef[] {
  const busyKeys = confirmedExternalBusyKeys(occupied)
  if (!busyKeys.size) return []
  const blocked: BookingSlotRef[] = []
  for (const slot of slots) {
    const key = slotOccupancyKey(slot.courtId, slot.startTime)
    if (busyKeys.has(key)) {
      blocked.push({ courtId: slot.courtId, startTime: slot.startTime.slice(0, 5) })
    }
  }
  return blocked
}
