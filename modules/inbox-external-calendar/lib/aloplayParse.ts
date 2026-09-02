import { normalizeClockTime } from '../runtime/server/lib/time'

/** Stable key for a free AloPlay slot: productId + session start (HH:mm). */
export function freeSlotKey(productId: number, startTime: string): string {
  return `${productId}:${startTime}`
}

export function isAloPlaySlotFree(freeSlots: Set<string>, productId: number, startTime: string): boolean {
  const normalized = normalizeClockTime(startTime)
  if (!normalized) return false
  return freeSlots.has(freeSlotKey(productId, normalized))
}

/** Parse AloPlay GetAvailableTime `{ data: [{ fromTime, toTime, productId }] }`. */
export function parseAvailableTimePayload(payload: unknown): { freeSlots: Set<string>; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { freeSlots: new Set(), error: 'GetAvailableTime response is not an object' }
  }

  const record = payload as Record<string, unknown>
  if (typeof record.statusCode === 'number' && record.statusCode !== 0) {
    const message = typeof record.message === 'string' ? record.message : 'GetAvailableTime failed'
    return { freeSlots: new Set(), error: message }
  }

  const rows = record.data
  if (rows == null) {
    return { freeSlots: new Set(), error: 'GetAvailableTime missing data array' }
  }
  if (!Array.isArray(rows)) {
    return { freeSlots: new Set(), error: 'GetAvailableTime data is not an array' }
  }

  const freeSlots = new Set<string>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const productId = item.productId
    const fromTime = normalizeClockTime(String(item.fromTime ?? ''))
    if (typeof productId !== 'number' || !fromTime) continue
    freeSlots.add(freeSlotKey(productId, fromTime))
  }

  return { freeSlots }
}

export function unionFreeSlots(results: Array<{ freeSlots: Set<string> }>): Set<string> {
  const union = new Set<string>()
  for (const result of results) {
    for (const key of result.freeSlots) union.add(key)
  }
  return union
}


/** Keys are `productId:HH:mm`. One distinct clock time is a truncated payload, not a booked-out club. */
export function isTruncatedAloPlayFreeSet(freeSlots: Set<string>): boolean {
  const starts = new Set<string>()
  for (const key of freeSlots) {
    const colon = key.indexOf(':')
    if (colon === -1) continue
    starts.add(key.slice(colon + 1))
  }
  return starts.size < 2
}

/** Slots not listed in GetAvailableTime union are suspected occupied. */
export function suspectedOccupiedFromFreeSet(
  mappedCourts: Array<{ courtKey: string; productId: number; starts: string[] }>,
  freeSlots: Set<string>,
): Array<{ courtKey: string; startTime: string }> {
  const occupied: Array<{ courtKey: string; startTime: string }> = []
  for (const { courtKey, productId, starts } of mappedCourts) {
    for (const startTime of starts) {
      if (!isAloPlaySlotFree(freeSlots, productId, startTime)) {
        occupied.push({ courtKey, startTime })
      }
    }
  }
  return occupied
}
