/**
 * Owner finance ledger / Excel status — booking lifecycle wins over payment.status.
 * Matches the transaction detail sheet («جزئیات تراکنش»), which shows booking.status.
 */

import { isBlockedFinanceTx } from './financeTransactions.ts'

export type FinanceLedgerStatusInput = {
  kind?: string | null
  bookingStatus?: string | null
  displayStatus?: string | null
  paymentStatus?: string | null
}

/** Raw status token passed to booking.* / booking.paymentStatus* i18n keys. */
export function financeLedgerStatusToken(tx: FinanceLedgerStatusInput): string {
  if (tx.kind === 'slot') {
    return String(tx.bookingStatus || tx.displayStatus || '')
  }
  if (isBlockedFinanceTx(tx)) {
    return String(tx.bookingStatus || tx.displayStatus || 'BLOCKED')
  }
  if (tx.bookingStatus === 'CANCELLED') return 'CANCELLED'
  return String(tx.paymentStatus || '')
}

/** `booking` → use bookingStatusLabel(); `payment` → use paymentStatusLabel(). */
export function financeLedgerStatusKind(tx: FinanceLedgerStatusInput): 'booking' | 'payment' {
  if (tx.kind === 'slot') return 'booking'
  if (isBlockedFinanceTx(tx)) return 'booking'
  if (tx.bookingStatus === 'CANCELLED') return 'booking'
  return 'payment'
}