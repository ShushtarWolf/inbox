import { describe, expect, it } from 'vitest'
import { expandPackageSessions } from '../utils/packages'

describe('expandPackageSessions', () => {
  it('expands weekday ranges into concrete sessions', () => {
    const sessions = expandPackageSessions({
      startDate: '2026-09-05', // Saturday
      finishDate: '2026-09-06', // Sunday
      days: ['Sat'],
      dayTimes: { Sat: { start: '16:00', end: '18:00' } },
    }, 60)
    expect(sessions.length).toBeGreaterThanOrEqual(1)
    expect(sessions.every((s) => s.startTime >= '16:00' && s.startTime < '18:00')).toBe(true)
  })

  it('returns empty when no matching weekdays', () => {
    const sessions = expandPackageSessions({
      startDate: '2026-09-07', // Monday
      finishDate: '2026-09-07',
      days: ['Sat'],
      dayTimes: { Sat: { start: '16:00', end: '17:00' } },
    }, 60)
    expect(sessions).toEqual([])
  })
})
