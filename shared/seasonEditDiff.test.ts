import { describe, expect, it } from 'vitest'
import { expandSeasonRules } from './seasonSessions'
import { aggregateSeasonUnits, diffSeasonUnits, seasonEditHasChanges, uniqueSeasonUnits } from './seasonEditDiff'

const tue = '2026-12-01' // Tuesday
const live = (startTime: string, opts: { past?: boolean; courtId?: string; date?: string; id?: string } = {}) => ({
  date: opts.date || tue,
  startTime,
  courtId: opts.courtId || 'z3',
  bookingId: opts.id || `b-${opts.date || tue}-${startTime}-${opts.courtId || 'z3'}`,
  past: Boolean(opts.past),
})

describe('diffSeasonUnits', () => {
  it('unchanged form → nothing added or removed', () => {
    const diff = diffSeasonUnits({
      existing: [live('18:00'), live('19:00')],
      desired: [{ date: tue, startTime: '18:00', courtId: 'z3' }, { date: tue, startTime: '19:00', courtId: 'z3' }],
    })
    expect(diff.unchanged).toHaveLength(2)
    expect(seasonEditHasChanges(diff)).toBe(false)
  })

  it('18–20 → 18–21 adds only the 20:00 hour', () => {
    const diff = diffSeasonUnits({
      existing: [live('18:00'), live('19:00')],
      desired: ['18:00', '19:00', '20:00'].map((startTime) => ({ date: tue, startTime, courtId: 'z3' })),
    })
    expect(diff.added).toEqual([{ date: tue, startTime: '20:00', courtId: 'z3' }])
    expect(diff.removed).toEqual([])
  })

  it('18–20 → 19–20 removes only 18:00', () => {
    const diff = diffSeasonUnits({
      existing: [live('18:00'), live('19:00')],
      desired: [{ date: tue, startTime: '19:00', courtId: 'z3' }],
    })
    expect(diff.removed.map((r) => r.startTime)).toEqual(['18:00'])
    expect(diff.unchanged.map((r) => r.startTime)).toEqual(['19:00'])
  })

  it('overlapping form rows 18–20 and 19–21 on one court book 19:00 once', () => {
    const desired = expandSeasonRules({
      startDate: tue,
      finishDate: tue,
      rules: [
        { weekday: 'Tue', startTime: '18:00', endTime: '20:00', courtId: 'z3' },
        { weekday: 'Tue', startTime: '19:00', endTime: '21:00', courtId: 'z3' },
      ],
    })
    // Even if a client sends duplicates, units collapse.
    const diff = diffSeasonUnits({ existing: [], desired: [...desired, ...desired] })
    expect(diff.added.map((u) => u.startTime)).toEqual(['18:00', '19:00', '20:00'])
  })

  it('past hours are never removed or re-added', () => {
    const diff = diffSeasonUnits({
      existing: [live('18:00', { past: true })],
      desired: [{ date: '2026-11-01', startTime: '10:00', courtId: 'z3' }],
      isPast: (u) => u.date < '2026-11-15',
    })
    expect(diff.keptPast).toHaveLength(1)
    expect(diff.removed).toEqual([])
    expect(diff.added).toEqual([])
  })

  it('moving a session to another court is one remove + one add', () => {
    const diff = diffSeasonUnits({
      existing: [live('18:00', { courtId: 'z1' })],
      desired: [{ date: tue, startTime: '18:00', courtId: 'z2' }],
    })
    expect(diff.removed).toHaveLength(1)
    expect(diff.added).toEqual([{ date: tue, startTime: '18:00', courtId: 'z2' }])
  })

  it('normalizes times so 9:00 and 09:00 are the same unit', () => {
    expect(uniqueSeasonUnits([
      { date: tue, startTime: '9:00', courtId: 'a' },
      { date: tue, startTime: '09:00:00', courtId: 'a' },
    ])).toHaveLength(1)
  })
})

describe('aggregateSeasonUnits', () => {
  it('merges contiguous same-date same-court hours for display', () => {
    expect(aggregateSeasonUnits([
      { date: tue, startTime: '19:00', courtId: 'z3' },
      { date: tue, startTime: '18:00', courtId: 'z3' },
      { date: tue, startTime: '21:00', courtId: 'z3' },
      { date: tue, startTime: '18:00', courtId: 'z1' },
    ])).toEqual([
      { date: tue, courtId: 'z1', startTime: '18:00', endTime: '19:00', hours: 1 },
      { date: tue, courtId: 'z3', startTime: '18:00', endTime: '20:00', hours: 2 },
      { date: tue, courtId: 'z3', startTime: '21:00', endTime: '22:00', hours: 1 },
    ])
  })
})
