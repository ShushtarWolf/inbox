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

/** CREATED-event markers written by season / package-reserve / class-package flows. */
const RECURRING_EVENT_MARKERS = ['owner-recurring', 'class-package'] as const

/**
 * Owner calendar: season/package series or class-package court hold.
 * Uses packageDraftId and/or CREATED ReservationEvent metadata (no schema migration).
 */
export function isOwnerRecurringBooking(booking: {
  packageDraftId?: string | null
  isRecurring?: boolean | null
  events?: Array<{ metadataJson?: string | null }> | null
} | null | undefined): boolean {
  if (!booking) return false
  if (booking.isRecurring === true) return true
  if (booking.packageDraftId) return true
  return (booking.events || []).some((event) => {
    const meta = event.metadataJson || ''
    return RECURRING_EVENT_MARKERS.some((marker) => meta.includes(marker))
  })
}
