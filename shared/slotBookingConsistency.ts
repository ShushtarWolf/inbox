/**
 * Owner desk invariant: a slot that still has a live (non-cancelled) booking must not be FREE.
 * FREE + live booking renders as an empty bookable cell with a ★ (the booking note) — the
 * "blocks vanished after season reserve" report. Infer the status the booking implies so the
 * calendar can self-heal instead of offering the hour for sale.
 */
export type ConsistencySlot = {
  displayStatus: string
  booking?: {
    status: string
    source?: string | null
    paymentId?: string | null
    hasPayment?: boolean
    packageDraftId?: string | null
    coachId?: string | null
  } | null
}

export function healedDisplayStatusForFreeSlot(slot: ConsistencySlot): 'BLOCKED' | 'PENDING' | 'RESERVED' | null {
  if (slot.displayStatus !== 'FREE') return null
  const b = slot.booking
  if (!b || b.status === 'CANCELLED') return null
  // Desk block / note-only holds: CLUB, no payment row, no package/coach.
  const deskHold = b.source === 'CLUB' && !b.hasPayment && !b.packageDraftId && !b.coachId
  if (deskHold) return b.status === 'PENDING' ? 'PENDING' : 'BLOCKED'
  // Any other live booking: keep the hour sold rather than re-offering it.
  return b.status === 'PENDING' ? 'PENDING' : 'RESERVED'
}
