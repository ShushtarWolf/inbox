/** Slot payload shape used when resolving desk payment writes on the owner calendar. */
export type DeskPaymentAnchorSlot = {
  id: string
  displayStatus?: string | null
  booking?: { status?: string | null } | null
}

function isFreeDeskSlot(slot: DeskPaymentAnchorSlot | null | undefined) {
  if (!slot) return false
  const booking = slot.booking
  if (booking && booking.status !== 'CANCELLED') return false
  return !slot.displayStatus || slot.displayStatus === 'FREE'
}

/**
 * Pick the slot whose existing payment row informs a desk write.
 * For new reserves, ignore a stale selectedSlot that still points at an occupied
 * booking after the owner multi-selected other FREE hours.
 */
export function deskPaymentAnchorSlot(
  selectedSlot: DeskPaymentAnchorSlot | null | undefined,
  reserveSlots: DeskPaymentAnchorSlot[],
  isNewReservation: boolean,
): DeskPaymentAnchorSlot | null {
  if (!isNewReservation) return selectedSlot ?? null
  const freeTargets = reserveSlots.filter(isFreeDeskSlot)
  if (!freeTargets.length) return selectedSlot ?? null
  if (selectedSlot && freeTargets.some((slot) => slot.id === selectedSlot.id)) return selectedSlot
  return freeTargets[0] ?? null
}
