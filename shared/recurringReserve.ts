/** Desk season/package recurring reserve — overwrite-safe FREE-only claims. */
export function isRecurringReserveEnabled(): boolean {
  return true
}

export type RecurringConflictReason = 'OCCUPIED' | 'PAST' | 'OUTSIDE_HOURS' | 'CLAIM_RACE'

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
