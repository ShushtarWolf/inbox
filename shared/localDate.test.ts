import { describe, expect, it } from 'vitest'
import {
  daysBetweenCalendarDates,
  isPastDate,
  isSlotStartInPast,
  localDateString,
  localTimeString,
  minutesUntilSlotStart,
} from './localDate'

describe('localDateString', () => {
  it('formats YYYY-MM-DD in Asia/Tehran', () => {
    const date = new Date('2026-03-20T20:30:00Z')
    expect(localDateString(date, 'Asia/Tehran')).toBe('2026-03-21')
  })

  it('formats in UTC timezone', () => {
    const date = new Date('2026-03-21T12:00:00Z')
    expect(localDateString(date, 'UTC')).toBe('2026-03-21')
  })
})

describe('todayDateString', () => {
  it('matches localDateString for now', () => {
    const now = new Date('2026-07-14T10:15:00Z')
    expect(localDateString(now, 'UTC')).toBe('2026-07-14')
  })
})

describe('daysBetweenCalendarDates', () => {
  it('counts whole calendar days', () => {
    expect(daysBetweenCalendarDates('2026-07-14', '2026-07-16')).toBe(2)
  })
})

describe('isPastDate', () => {
  it('detects dates before today in Tehran', () => {
    const now = new Date('2026-07-14T10:15:00Z')
    expect(isPastDate('2026-07-13', now, 'UTC')).toBe(true)
    expect(isPastDate('2026-07-14', now, 'UTC')).toBe(false)
  })
})

describe('isSlotStartInPast', () => {
  it('treats earlier times today as past', () => {
    const now = new Date('2026-07-14T15:30:00Z')
    expect(isSlotStartInPast('2026-07-14', '14:00', now, 'UTC')).toBe(true)
    expect(isSlotStartInPast('2026-07-14', '16:00', now, 'UTC')).toBe(false)
  })

  it('treats yesterday as past regardless of time', () => {
    const now = new Date('2026-07-14T15:30:00Z')
    expect(isSlotStartInPast('2026-07-13', '23:00', now, 'UTC')).toBe(true)
  })
})

describe('minutesUntilSlotStart', () => {
  it('returns negative minutes for past slots', () => {
    const now = new Date('2026-07-14T15:30:00Z')
    expect(minutesUntilSlotStart('2026-07-14', '14:00', now, 'UTC')).toBe(-90)
  })
})

describe('localTimeString', () => {
  it('formats HH:mm in the given timezone', () => {
    const date = new Date('2026-07-14T15:30:00Z')
    expect(localTimeString(date, 'UTC')).toBe('15:30')
  })
})
