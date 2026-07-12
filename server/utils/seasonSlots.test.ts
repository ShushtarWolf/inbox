import { describe, expect, it } from 'vitest'
import { datesForWeekdays, datesForWeekdaysInRange, hourFromTime } from './seasonSlots'

describe('datesForWeekdays', () => {
  it('returns dates matching weekdays from anchor', () => {
    const dates = datesForWeekdays('2026-07-06', ['Mon', 'Wed'], 2)
    expect(dates.length).toBeGreaterThan(0)
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true)
  })

  it('returns empty for unknown days', () => {
    expect(datesForWeekdays('2026-07-06', [], 2)).toEqual([])
  })
})

describe('datesForWeekdaysInRange', () => {
  it('returns matching weekdays between start and finish dates', () => {
    const dates = datesForWeekdaysInRange('2026-07-06', '2026-07-20', ['Mon', 'Wed'])
    expect(dates).toEqual(['2026-07-06', '2026-07-08', '2026-07-13', '2026-07-15', '2026-07-20'])
  })
})

describe('hourFromTime', () => {
  it('parses hour from time string', () => {
    expect(hourFromTime('14:00')).toBe(14)
    expect(hourFromTime('09:30')).toBe(9)
  })
})
