import { describe, expect, it } from 'vitest'
import { expandCoachSeries, matchCoachSeries, type CoachSeriesSlot } from './coachSeries'

function slot(partial: Partial<CoachSeriesSlot> & Pick<CoachSeriesSlot, 'id' | 'courtId' | 'date' | 'startTime'>): CoachSeriesSlot {
  return {
    endTime: '11:00',
    displayStatus: 'FREE',
    bookingActive: false,
    staleCancelledBookingId: null,
    charge: 1000,
    courtPrice: 1000,
    pricingJson: null,
    ...partial,
  }
}

describe('expandCoachSeries', () => {
  it('expands two weekday patterns inside the date range', () => {
    const result = expandCoachSeries({
      startDate: '2026-09-26',
      finishDate: '2026-10-02',
      rules: [
        { weekday: 'Sat', startTime: '10:00', endTime: '11:00', courtId: 'c1' },
        { weekday: 'Wed', startTime: '18:00', endTime: '19:00', courtId: 'c2' },
      ],
    })
    expect(result).toEqual({
      ok: true,
      occurrences: [
        { date: '2026-09-26', startTime: '10:00', courtId: 'c1' },
        { date: '2026-09-30', startTime: '18:00', courtId: 'c2' },
      ],
    })
  })

  it('refuses a series larger than the cap', () => {
    const result = expandCoachSeries({
      startDate: '2026-09-26',
      finishDate: '2027-09-25',
      rules: [{ weekday: 'Sat', startTime: '10:00', endTime: '11:00', courtId: 'c1' }],
    })
    expect(result).toEqual({ ok: false, reason: 'cap' })
  })
})

describe('matchCoachSeries', () => {
  it('books every free hour or none when one is taken or the coach is already busy', () => {
    const matched = matchCoachSeries({
      occurrences: [
        { date: '2026-09-26', startTime: '10:00', courtId: 'c1' },
        { date: '2026-09-30', startTime: '18:00', courtId: 'c2' },
        { date: '2026-10-03', startTime: '10:00', courtId: 'c1' },
      ],
      slots: [
        slot({ id: 's1', courtId: 'c1', date: '2026-09-26', startTime: '10:00', charge: 1500 }),
        slot({ id: 's2', courtId: 'c2', date: '2026-09-30', startTime: '18:00', displayStatus: 'RESERVED', bookingActive: true }),
        slot({ id: 's3', courtId: 'c1', date: '2026-10-03', startTime: '10:00', charge: 1500 }),
      ],
      busyKeys: ['2026-10-03|10:00'],
    })
    expect(matched.conflicts.map((row) => row.reason)).toEqual(['taken', 'busy'])
    expect(matched.bookable.map((row) => row.id)).toEqual(['s1'])
    expect(matched.totalCourtCharge).toBe(1500)
  })

  it('treats a second court at the same hour as the coach being busy', () => {
    const matched = matchCoachSeries({
      occurrences: [
        { date: '2026-09-26', startTime: '10:00', courtId: 'c1' },
        { date: '2026-09-26', startTime: '10:00', courtId: 'c2' },
      ],
      slots: [
        slot({ id: 's1', courtId: 'c1', date: '2026-09-26', startTime: '10:00' }),
        slot({ id: 's2', courtId: 'c2', date: '2026-09-26', startTime: '10:00' }),
      ],
      busyKeys: [],
    })
    expect(matched.bookable.map((row) => row.id)).toEqual(['s1'])
    expect(matched.conflicts).toEqual([
      { date: '2026-09-26', startTime: '10:00', courtId: 'c2', reason: 'busy' },
    ])
  })
})
