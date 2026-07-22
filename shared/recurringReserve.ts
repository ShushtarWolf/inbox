/** Court-booking MVP: season/package recurring reserve is off until overwrite-safe. */
export function isRecurringReserveEnabled(): boolean {
  return false
}

/**
 * Whether generateRecurringCourtSlots may claim this existing slot.
 * Only FREE slots without a live (non-cancelled) booking are safe.
 */
export function canClaimExistingSlotForRecurring(existing: {
  displayStatus: string
  booking?: { status: string } | null
} | null): boolean {
  if (!existing) return true
  if (existing.displayStatus !== 'FREE') return false
  if (existing.booking && existing.booking.status !== 'CANCELLED') return false
  return true
}
