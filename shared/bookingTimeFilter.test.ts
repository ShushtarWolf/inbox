import { describe, expect, it } from 'vitest'
import { filterBookingsByTime } from './bookingTimeFilter.ts'

describe('filterBookingsByTime', () => {
  const today = '2026-10-26'
  const rows = [
    { id: '1', date: '2026-10-27', status: 'CONFIRMED' },
    { id: '2', date: '2026-10-27', status: 'CANCELLED' },
    { id: '3', date: '2026-10-20', status: 'CONFIRMED' },
    { id: '4', date: '2026-10-20', status: 'CANCELLED' },
  ]

  it('keeps only non-cancelled upcoming in پیش‌رو', () => {
    expect(filterBookingsByTime(rows, 'upcoming', today).map((r) => r.id)).toEqual(['1'])
  })

  it('puts past dates and all cancelled into گذشته (HTML cx rule)', () => {
    expect(filterBookingsByTime(rows, 'past', today).map((r) => r.id)).toEqual(['2', '3', '4'])
  })

  it('returns everything for همه', () => {
    expect(filterBookingsByTime(rows, 'all', today).map((r) => r.id)).toEqual(['1', '2', '3', '4'])
  })
})
