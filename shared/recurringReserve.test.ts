import { describe, expect, it } from 'vitest'
import {
  canClaimExistingSlotForRecurring,
  isOwnerRecurringBooking,
  isRecurringReserveEnabled,
} from './recurringReserve'

describe('isRecurringReserveEnabled', () => {
  it('is on with overwrite-safe recurring claims', () => {
    expect(isRecurringReserveEnabled()).toBe(true)
  })
})

describe('isOwnerRecurringBooking', () => {
  it('is false for empty booking', () => {
    expect(isOwnerRecurringBooking(null)).toBe(false)
    expect(isOwnerRecurringBooking({})).toBe(false)
  })

  it('treats packageDraftId as recurring', () => {
    expect(isOwnerRecurringBooking({ packageDraftId: 'pkg-1' })).toBe(true)
  })

  it('detects season/package CREATED event metadata', () => {
    expect(isOwnerRecurringBooking({
      events: [{ metadataJson: JSON.stringify({ source: 'owner-recurring' }) }],
    })).toBe(true)
  })

  it('detects class-package CREATED event metadata', () => {
    expect(isOwnerRecurringBooking({
      events: [{ metadataJson: JSON.stringify({ source: 'class-package', packageId: 'x' }) }],
    })).toBe(true)
  })

  it('honors explicit isRecurring flag from API', () => {
    expect(isOwnerRecurringBooking({ isRecurring: true })).toBe(true)
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
