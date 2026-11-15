import { describe, expect, it } from 'vitest'
import {
  expandSeasonUnitRanges,
  seasonEditAddedKeySet,
  seasonEditStep3NeedsPayment,
  seasonEditStep3SaveOnly,
} from './seasonEditPreview'

describe('seasonEditStep3NeedsPayment', () => {
  it('is false when shortening only (removed, no added)', () => {
    expect(seasonEditStep3NeedsPayment(true, { added: 0, removed: 3, unchanged: 5 })).toBe(false)
  })
  it('is true when new hours are added', () => {
    expect(seasonEditStep3NeedsPayment(true, { added: 2, removed: 0, unchanged: 4 })).toBe(true)
  })
  it('is false for new season (not editing)', () => {
    expect(seasonEditStep3NeedsPayment(false, { added: 5, removed: 0 })).toBe(false)
  })
})

describe('seasonEditStep3SaveOnly', () => {
  it('is true for remove-only edit', () => {
    expect(seasonEditStep3SaveOnly(true, { added: 0, removed: 2, unchanged: 3 })).toBe(true)
  })
  it('is false when added hours need payment', () => {
    expect(seasonEditStep3SaveOnly(true, { added: 1, removed: 1 })).toBe(false)
  })
  it('is false with no session changes', () => {
    expect(seasonEditStep3SaveOnly(true, { added: 0, removed: 0, unchanged: 4 })).toBe(false)
  })
})

describe('seasonEditAddedKeySet', () => {
  it('normalizes keys for matching preview rows', () => {
    const keys = seasonEditAddedKeySet([{ date: '2026-12-06', startTime: '9:00', courtId: 'c1' }])
    expect(keys.has('c1|2026-12-06|09:00')).toBe(true)
  })
})

describe('expandSeasonUnitRanges', () => {
  it('splits a two-hour range into two units', () => {
    expect(expandSeasonUnitRanges([
      { date: '2026-12-06', courtId: 'z1', startTime: '18:00', endTime: '20:00', hours: 2 },
    ])).toEqual([
      { date: '2026-12-06', courtId: 'z1', startTime: '18:00' },
      { date: '2026-12-06', courtId: 'z1', startTime: '19:00' },
    ])
  })
})