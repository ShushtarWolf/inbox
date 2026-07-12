import { describe, expect, it } from 'vitest'
import {
  countRecurringSessions,
  countRecurringSessionsByDay,
  countRecurringSessionsByDayInRange,
  expandDayTimeRanges,
  hasValidDayTimes,
  parseSeasonTimesJson,
  timesInRange,
  weekdayNameFromDate,
} from './recurringSessions'

describe('timesInRange', () => {
  it('returns hourly slots between start and end', () => {
    expect(timesInRange('10:00', '13:00')).toEqual(['10:00', '11:00', '12:00'])
  })

  it('returns empty when end is not after start', () => {
    expect(timesInRange('14:00', '14:00')).toEqual([])
    expect(timesInRange('15:00', '14:00')).toEqual([])
  })

  it('supports custom step minutes', () => {
    expect(timesInRange('10:00', '11:00', 30)).toEqual(['10:00', '10:30'])
  })
})

describe('countRecurringSessions', () => {
  it('multiplies matching weekdays by hours in range over 8 weeks', () => {
    const count = countRecurringSessions(['Sun'], '10:00', '12:00', '2025-07-06')
    expect(count).toBe(8 * 2)
  })
})

describe('countRecurringSessionsByDay', () => {
  it('counts sessions per weekday with different hours', () => {
    const dayTimes = {
      Mon: { start: '10:00', end: '12:00' },
      Wed: { start: '18:00', end: '20:00' },
    }
    const count = countRecurringSessionsByDay(dayTimes, ['Mon', 'Wed'], '2025-07-07')
    expect(count).toBe(8 * 2 + 8 * 2)
  })
})

describe('countRecurringSessionsByDayInRange', () => {
  it('counts sessions within an explicit date range', () => {
    const dayTimes = { Mon: { start: '10:00', end: '12:00' } }
    const count = countRecurringSessionsByDayInRange(dayTimes, ['Mon'], '2025-07-07', '2025-07-21')
    expect(count).toBe(3 * 2)
  })
})

describe('expandDayTimeRanges', () => {
  it('expands each weekday range to hourly times', () => {
    expect(expandDayTimeRanges({ Mon: { start: '10:00', end: '12:00' } })).toEqual({
      Mon: ['10:00', '11:00'],
    })
  })
})

describe('hasValidDayTimes', () => {
  it('returns true when at least one day has times', () => {
    expect(hasValidDayTimes({ Mon: { start: '10:00', end: '12:00' } }, ['Mon', 'Tue'])).toBe(true)
    expect(hasValidDayTimes({ Mon: { start: '12:00', end: '12:00' } }, ['Mon'])).toBe(false)
  })
})

describe('parseSeasonTimesJson', () => {
  it('parses per-day object', () => {
    const json = JSON.stringify({ Mon: { start: '10:00', end: '12:00' } })
    expect(parseSeasonTimesJson(json, ['Mon'])).toEqual({ Mon: { start: '10:00', end: '12:00' } })
  })

  it('maps legacy flat array to all days', () => {
    expect(parseSeasonTimesJson('["10:00","11:00"]', ['Mon', 'Wed'], { start: '09:00', end: '10:00' })).toEqual({
      Mon: { start: '10:00', end: '12:00' },
      Wed: { start: '10:00', end: '12:00' },
    })
  })
})

describe('weekdayNameFromDate', () => {
  it('returns weekday name from ISO date', () => {
    expect(weekdayNameFromDate('2025-07-07')).toBe('Mon')
  })
})
