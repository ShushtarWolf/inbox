import { describe, expect, it } from 'vitest'
import { expandPackageSessions } from '../utils/packages'

/** Fixed reference before the fixture range — never use wall clock for assertions. */
const FIXED_NOW = new Date('2026-09-01T09:00:00+03:30') // Tehran morning, before 2026-09-05

describe('expandPackageSessions', () => {
  it('expands weekday ranges into concrete sessions', () => {
    const sessions = expandPackageSessions({
      startDate: '2026-09-05', // Saturday
      finishDate: '2026-09-06', // Sunday
      days: ['Sat'],
      dayTimes: { Sat: { start: '16:00', end: '18:00' } },
    }, 60, FIXED_NOW)
    expect(sessions.length).toBeGreaterThanOrEqual(1)
    expect(sessions.every((s) => s.startTime >= '16:00' && s.startTime < '18:00')).toBe(true)
    expect(sessions.every((s) => s.date === '2026-09-05')).toBe(true)
  })

  it('returns empty when no matching weekdays', () => {
    const sessions = expandPackageSessions({
      startDate: '2026-09-07', // Monday
      finishDate: '2026-09-07',
      days: ['Sat'],
      dayTimes: { Sat: { start: '16:00', end: '17:00' } },
    }, 60, FIXED_NOW)
    expect(sessions).toEqual([])
  })

  it('drops sessions that are already in the past relative to now', () => {
    const afterRange = new Date('2026-09-08T12:00:00+03:30')
    const sessions = expandPackageSessions({
      startDate: '2026-09-05',
      finishDate: '2026-09-06',
      days: ['Sat'],
      dayTimes: { Sat: { start: '16:00', end: '18:00' } },
    }, 60, afterRange)
    expect(sessions).toEqual([])
  })
})
