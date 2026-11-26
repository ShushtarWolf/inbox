import { describe, expect, it } from 'vitest'
import { filterBookingsByTime } from './bookingTimeFilter.ts'
import { sortBookingHistoryItems } from './bookingHistorySort.ts'

describe('sortBookingHistoryItems', () => {
  const today = '2026-11-26'
  const rows = [
    { id: 'far', date: '2026-12-29', startTime: '19:00', status: 'CONFIRMED', tieBreaker: 'B' },
    { id: 'near', date: '2026-12-22', startTime: '20:00', status: 'CONFIRMED', tieBreaker: 'A' },
    { id: 'same-day-late', date: '2026-12-22', startTime: '21:00', status: 'CONFIRMED', tieBreaker: 'C' },
    { id: 'past', date: '2026-11-20', startTime: '18:00', status: 'CONFIRMED', tieBreaker: 'D' },
    { id: 'cancel-future', date: '2026-12-30', startTime: '10:00', status: 'CANCELLED', tieBreaker: 'E' },
  ].map((r) => r as typeof r & { id: string })

  it('sorts پیش‌رو ascending (nearest session first)', () => {
    const scoped = filterBookingsByTime(rows, 'upcoming', today)
    const ids = sortBookingHistoryItems(scoped, 'upcoming', today).map((r) => r.id)
    expect(ids).toEqual(['near', 'same-day-late', 'far'])
  })

  it('sorts گذشته descending (most recent first)', () => {
    const scoped = filterBookingsByTime(rows, 'past', today)
    const ids = sortBookingHistoryItems(scoped, 'past', today).map((r) => r.id)
    expect(ids).toEqual(['cancel-future', 'past'])
  })

  it('sorts همه with upcoming live ascending then rest descending', () => {
    const ids = sortBookingHistoryItems(rows, 'all', today).map((r) => r.id)
    expect(ids).toEqual(['near', 'same-day-late', 'far', 'cancel-future', 'past'])
  })

  it('uses court tiebreaker when date and start time match', () => {
    const tied = [
      { id: 'z', date: '2026-12-22', startTime: '18:00', status: 'CONFIRMED', tieBreaker: 'زمین ۲' },
      { id: 'a', date: '2026-12-22', startTime: '18:00', status: 'CONFIRMED', tieBreaker: 'زمین ۱' },
    ]
    const ids = sortBookingHistoryItems(tied, 'upcoming', today).map((r) => r.id)
    expect(ids).toEqual(['a', 'z'])
  })
})