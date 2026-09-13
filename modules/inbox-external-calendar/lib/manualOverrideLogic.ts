import type { ExternalCellState } from './observation'
import { displayBlocksExternal } from './observation'
import { slotOccupancyKey, type BookingSlotRef, type ConfirmedOccupiedRow } from './bookingGuardLogic'

export type ManualOverrideType = 'RELEASE' | 'BLOCK'

export type ManualOverrideRow = {
  courtId: string
  startTime: string
  type: ManualOverrideType
}

export function manualOverrideKey(courtId: string, startTime: string): string {
  return slotOccupancyKey(courtId, startTime)
}

export function indexManualOverrides(rows: ManualOverrideRow[]): Map<string, ManualOverrideType> {
  const map = new Map<string, ManualOverrideType>()
  for (const row of rows) {
    map.set(manualOverrideKey(row.courtId, row.startTime), row.type)
  }
  return map
}

/**
 * Apply manual overrides on top of external guard blocking.
 * RELEASE removes an external BUSY block for the exact slot.
 * BLOCK adds a block even when external occupancy is empty.
 */
export function findBookingGuardBlockedSlots(
  slots: BookingSlotRef[],
  externalOccupied: ConfirmedOccupiedRow[],
  manualOverrides: ManualOverrideRow[],
): BookingSlotRef[] {
  const busyKeys = new Set<string>()
  for (const row of externalOccupied) {
    if (row.state && row.state !== 'EXTERNAL_BUSY') continue
    busyKeys.add(slotOccupancyKey(row.courtKey, row.startTime))
  }

  const overrides = indexManualOverrides(manualOverrides)
  for (const [key, type] of overrides) {
    if (type === 'RELEASE') busyKeys.delete(key)
    if (type === 'BLOCK') busyKeys.add(key)
  }

  const blocked: BookingSlotRef[] = []
  for (const slot of slots) {
    const key = slotOccupancyKey(slot.courtId, slot.startTime)
    if (busyKeys.has(key)) {
      blocked.push({ courtId: slot.courtId, startTime: slot.startTime.slice(0, 5) })
    }
  }
  return blocked
}

/** Whether a slot should block customer/coach booking after manual override layer. */
export function effectiveBlocksBooking(opts: {
  externalState?: ExternalCellState | null
  manualOverride?: ManualOverrideType | null
}): boolean {
  const externalBlocks = displayBlocksExternal(opts.externalState ?? 'AVAILABLE')
  if (opts.manualOverride === 'RELEASE') return false
  if (opts.manualOverride === 'BLOCK') return true
  return externalBlocks
}

/** Final availability label semantics for staff calendar (external state is preserved separately). */
export function effectiveAvailabilityKind(opts: {
  externalState?: ExternalCellState | null
  manualOverride?: ManualOverrideType | null
}): 'available' | 'blocked' | 'uncertain' {
  if (opts.manualOverride === 'RELEASE') return 'available'
  if (opts.manualOverride === 'BLOCK') return 'blocked'
  const state = opts.externalState ?? 'AVAILABLE'
  if (displayBlocksExternal(state)) return 'blocked'
  if (state === 'UNKNOWN' || state === 'STALE' || state === 'CONFLICT') return 'uncertain'
  return 'available'
}
