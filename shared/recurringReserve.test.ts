import { describe, expect, it } from 'vitest'
import { canClaimExistingSlotForRecurring, isRecurringReserveEnabled } from './recurringReserve'

describe('isRecurringReserveEnabled', () => {
  it('is off for court-booking MVP', () => {
    expect(isRecurringReserveEnabled()).toBe(false)
  })
})

describe('canClaimExistingSlotForRecurring', () => {
  it('allows missing slots (will create)', () => {
    expect(canClaimExistingSlotForRecurring(null)).toBe(true)
  })

  it('allows FREE with no booking', () => {
    expect(canClaimExistingSlotForRecurring({ displayStatus: 'FREE', booking: null })).toBe(true)
  })

  it('allows FREE with cancelled booking', () => {
    expect(canClaimExistingSlotForRecurring({
      displayStatus: 'FREE',
      booking: { status: 'CANCELLED' },
    })).toBe(true)
  })

  it('rejects FREE with live booking (incl. PLATFORM)', () => {
    expect(canClaimExistingSlotForRecurring({
      displayStatus: 'FREE',
      booking: { status: 'CONFIRMED' },
    })).toBe(false)
  })

  it('rejects non-FREE including RESERVED / BLOCKED / CLOSED', () => {
    for (const displayStatus of ['RESERVED', 'TEAM', 'PENDING', 'BLOCKED', 'CLOSED', 'PUBLIC']) {
      expect(canClaimExistingSlotForRecurring({ displayStatus, booking: null })).toBe(false)
    }
  })
})
