import { describe, expect, it } from 'vitest'
import { healedDisplayStatusForFreeSlot } from './slotBookingConsistency'

describe('healedDisplayStatusForFreeSlot', () => {
  it('restores a desk block that drifted to FREE', () => {
    expect(healedDisplayStatusForFreeSlot({
      displayStatus: 'FREE',
      booking: { status: 'CONFIRMED', source: 'CLUB', hasPayment: false },
    })).toBe('BLOCKED')
  })
  it('restores note-only hold to PENDING', () => {
    expect(healedDisplayStatusForFreeSlot({
      displayStatus: 'FREE',
      booking: { status: 'PENDING', source: 'CLUB', hasPayment: false },
    })).toBe('PENDING')
  })
  it('keeps paid/desk reserves sold', () => {
    expect(healedDisplayStatusForFreeSlot({
      displayStatus: 'FREE',
      booking: { status: 'CONFIRMED', source: 'CLUB', hasPayment: true },
    })).toBe('RESERVED')
  })
  it('ignores consistent rows', () => {
    expect(healedDisplayStatusForFreeSlot({ displayStatus: 'FREE', booking: null })).toBeNull()
    expect(healedDisplayStatusForFreeSlot({ displayStatus: 'FREE', booking: { status: 'CANCELLED', source: 'CLUB' } })).toBeNull()
    expect(healedDisplayStatusForFreeSlot({ displayStatus: 'BLOCKED', booking: { status: 'CONFIRMED', source: 'CLUB' } })).toBeNull()
  })
})
