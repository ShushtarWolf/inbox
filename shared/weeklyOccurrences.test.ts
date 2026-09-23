import { describe, expect, it } from 'vitest'
import {
  WEEKLY_OCCURRENCE_MAX_WEEKS,
  clampWeeklyWeeks,
  weeklyOccurrenceDates,
} from './weeklyOccurrences.ts'

describe('clampWeeklyWeeks', () => {
  it('defaults invalid to 1 and caps at max', () => {
    expect(clampWeeklyWeeks(0)).toBe(1)
    expect(clampWeeklyWeeks(-2)).toBe(1)
    expect(clampWeeklyWeeks(3.9)).toBe(3)
    expect(clampWeeklyWeeks(99)).toBe(WEEKLY_OCCURRENCE_MAX_WEEKS)
  })
})

describe('weeklyOccurrenceDates', () => {
  it('returns only the anchor for 1 week', () => {
    expect(weeklyOccurrenceDates('2026-09-23', 1)).toEqual(['2026-09-23'])
  })

  it('steps by 7 days', () => {
    expect(weeklyOccurrenceDates('2026-09-23', 3)).toEqual([
      '2026-09-23',
      '2026-09-30',
      '2026-10-07',
    ])
  })
})
