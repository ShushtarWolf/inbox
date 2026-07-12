import { describe, expect, it } from 'vitest'
import { computeMissingSlots, formatHour, hourEnd, slotStatusLabel } from './slots'

describe('computeMissingSlots', () => {
  it('returns only slots not in existing set', () => {
    const courts = [{ courtId: 'c1', price: 100, openHour: 9, closeHour: 11 }]
    const existing = new Set(['c1:2026-07-11:09:00'])
    const missing = computeMissingSlots(courts, '2026-07-11', existing)
    expect(missing).toHaveLength(1)
    expect(missing[0].startTime).toBe('10:00')
  })

  it('tiles 30-minute sessions', () => {
    const courts = [{ courtId: 'c1', price: 100, openHour: 9, closeHour: 10, sessionDurationMinutes: 30 }]
    const missing = computeMissingSlots(courts, '2026-07-11', new Set())
    expect(missing.map((slot) => slot.startTime)).toEqual(['09:00', '09:30'])
    expect(missing[0].endTime).toBe('09:30')
  })

  it('returns empty when all slots exist', () => {
    const courts = [{ courtId: 'c1', price: 100, openHour: 9, closeHour: 10 }]
    const existing = new Set(['c1:2026-07-11:09:00'])
    expect(computeMissingSlots(courts, '2026-07-11', existing)).toHaveLength(0)
  })
})

describe('formatHour', () => {
  it('zero-pads single-digit hours', () => {
    expect(formatHour(9)).toBe('09:00')
    expect(formatHour(14)).toBe('14:00')
  })
})

describe('hourEnd', () => {
  it('returns next hour', () => {
    expect(hourEnd(9)).toBe('10:00')
    expect(hourEnd(23)).toBe('24:00')
  })
})

describe('slotStatusLabel', () => {
  it('returns Persian labels by default', () => {
    expect(slotStatusLabel('FREE')).toBe('آزاد')
    expect(slotStatusLabel('CANCELLED')).toBe('کنسل')
  })

  it('returns English labels when locale is en', () => {
    expect(slotStatusLabel('FREE', 'en')).toBe('Free')
    expect(slotStatusLabel('RESERVED', 'en')).toBe('Reserved')
  })
})
