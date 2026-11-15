/**
 * Pure helpers for owner day-calendar selection (booked/blocked multi-select vs free slots).
 */

export type OwnerCalendarDisplayStatus =
  | 'FREE'
  | 'RESERVED'
  | 'BLOCKED'
  | string
  | null
  | undefined

/**
 * When the booked/blocked batch-select toggle is on, tapping a FREE hour should leave that
 * mode and continue with normal free-slot selection — not silently ignore the tap.
 */
export function shouldExitBookedSelectForFreeSlot(
  bookedSelectMode: boolean,
  displayStatus: OwnerCalendarDisplayStatus,
): boolean {
  return bookedSelectMode && String(displayStatus || 'FREE') === 'FREE'
}

/** Legacy guard — FREE taps were no-ops while booked select mode was active. */
export function blocksFreeSlotWhenBookedSelect(
  bookedSelectMode: boolean,
  displayStatus: OwnerCalendarDisplayStatus,
): boolean {
  return bookedSelectMode && String(displayStatus || 'FREE') === 'FREE'
}