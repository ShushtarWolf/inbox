/**
 * Athlete payment history: booking lifecycle wins over payment.status when cancelled.
 * Mirrors owner finance ledger (`financeLedgerStatusToken`).
 */
export function athletePaymentStatusForDisplay(row: {
  status: string
  bookingStatus?: string | null
}): string {
  if (row.bookingStatus === 'CANCELLED') return 'CANCELLED'
  return row.status
}