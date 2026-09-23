import { describe, expect, it, afterEach } from 'vitest'
import {
  canClaimExistingSlotForRecurring,
  isOwnerRecurringBooking,
  isRecurringReserveEnabled,
  mergeRecurringResults,
  type RecurringGenerateResult,
} from './recurringReserve'

describe('isRecurringReserveEnabled', () => {
  const prev = process.env.RECURRING_RESERVE_ENABLED
  const prevPublic = process.env.NUXT_PUBLIC_RECURRING_RESERVE_ENABLED

  afterEach(() => {
    if (prev === undefined) delete process.env.RECURRING_RESERVE_ENABLED
    else process.env.RECURRING_RESERVE_ENABLED = prev
    if (prevPublic === undefined) delete process.env.NUXT_PUBLIC_RECURRING_RESERVE_ENABLED
    else process.env.NUXT_PUBLIC_RECURRING_RESERVE_ENABLED = prevPublic
  })

  it('is off by default (Behnaz freeze)', () => {
    delete process.env.RECURRING_RESERVE_ENABLED
    delete process.env.NUXT_PUBLIC_RECURRING_RESERVE_ENABLED
    expect(isRecurringReserveEnabled()).toBe(false)
  })

  it('opts in via RECURRING_RESERVE_ENABLED', () => {
    process.env.RECURRING_RESERVE_ENABLED = 'true'
    delete process.env.NUXT_PUBLIC_RECURRING_RESERVE_ENABLED
    expect(isRecurringReserveEnabled()).toBe(true)
  })

  it('honors explicit enabled override (runtimeConfig)', () => {
    delete process.env.RECURRING_RESERVE_ENABLED
    delete process.env.NUXT_PUBLIC_RECURRING_RESERVE_ENABLED
    expect(isRecurringReserveEnabled({ enabled: true })).toBe(true)
    expect(isRecurringReserveEnabled({ enabled: false })).toBe(false)
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

  it('detects athlete-season CREATED event metadata', () => {
    expect(isOwnerRecurringBooking({
      events: [{ metadataJson: JSON.stringify({ source: 'athlete-season', seasonBookingId: 's1' }) }],
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

describe('mergeRecurringResults', () => {
  it('sums created/skipped and concatenates lists', () => {
    const a: RecurringGenerateResult = {
      created: 2,
      skipped: 1,
      willCreate: [
        { date: '2026-09-01', startTime: '10:00', courtId: 'c1' },
        { date: '2026-09-08', startTime: '10:00', courtId: 'c1' },
      ],
      conflicts: [{ date: '2026-09-15', startTime: '10:00', reason: 'OCCUPIED', courtId: 'c1' }],
    }
    const b: RecurringGenerateResult = {
      created: 1,
      skipped: 0,
      willCreate: [{ date: '2026-09-01', startTime: '10:00', courtId: 'c2' }],
      conflicts: [],
    }
    expect(mergeRecurringResults([a, b])).toEqual({
      created: 3,
      skipped: 1,
      willCreate: [...a.willCreate, ...b.willCreate],
      conflicts: a.conflicts,
    })
  })
})
