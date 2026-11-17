/** Calendar block / note holds: CLUB desk row with no Payment (never platform receivables). */
export function isClubDeskHoldBooking(booking: {
  source?: string | null
  payment?: { id?: string } | null
  packageDraftId?: string | null
  coachId?: string | null
}): boolean {
  if (booking.source !== 'CLUB') return false
  if (booking.packageDraftId || booking.coachId) return false
  if (booking.payment?.id) return false
  return true
}