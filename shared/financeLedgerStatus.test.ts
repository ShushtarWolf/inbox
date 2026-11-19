import { describe, expect, it } from 'vitest'
import { financeLedgerStatusKind, financeLedgerStatusToken } from './financeLedgerStatus.ts'

describe('financeLedgerStatus', () => {
  it('prefers cancelled booking status over PAID payment status for export', () => {
    const tx = {
      kind: 'court',
      bookingStatus: 'CANCELLED',
      paymentStatus: 'PAID',
      paymentMethod: 'CASH',
    }
    expect(financeLedgerStatusToken(tx)).toBe('CANCELLED')
    expect(financeLedgerStatusKind(tx)).toBe('booking')
  })

  it('keeps payment status for active bookings', () => {
    const tx = {
      kind: 'court',
      bookingStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
    }
    expect(financeLedgerStatusToken(tx)).toBe('PAID')
    expect(financeLedgerStatusKind(tx)).toBe('payment')
  })

  it('uses display status for empty FREE slot rows', () => {
    const tx = {
      kind: 'slot',
      bookingStatus: 'FREE',
      displayStatus: 'FREE',
      paymentStatus: '',
    }
    expect(financeLedgerStatusToken(tx)).toBe('FREE')
    expect(financeLedgerStatusKind(tx)).toBe('booking')
  })
})