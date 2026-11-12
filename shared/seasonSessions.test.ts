import { describe, expect, it } from 'vitest'
import { jalaliMonthEndIso, jalaaliToIso } from './jalali'
import {
  deriveSeasonRulesFromSlots,
  expandSeasonRules,
  legacySeasonToRules,
  maxIsoDate,
  seasonRulesFromOccurrences,
} from './seasonSessions'
import { groupSeasonRulesForUi } from './seasonFormHydrate'

describe('jalaliMonthEndIso', () => {
  it('returns last day of Farvardin from mid-month', () => {
    // 1405/01/15 → 2026-04-04; Farvardin has 31 days → 1405/01/31 = 2026-04-20
    const mid = jalaaliToIso(1405, 1, 15)
    expect(jalaliMonthEndIso(mid)).toBe(jalaaliToIso(1405, 1, 31))
  })

  it('is shorter than 4 weeks when starting late in a short month', () => {
    // Mehr 1405 has 30 days; start day 20 → end day 30 = 10 days span
    const start = jalaaliToIso(1405, 7, 20)
    const end = jalaliMonthEndIso(start)
    expect(end).toBe(jalaaliToIso(1405, 7, 30))
    const startMs = new Date(`${start}T12:00:00Z`).getTime()
    const endMs = new Date(`${end}T12:00:00Z`).getTime()
    expect((endMs - startMs) / 86400000).toBeLessThan(28)
  })
})

describe('expandSeasonRules', () => {
  it('expands a 23:00–24:00 rule into the last hourly slot', () => {
    const sessions = expandSeasonRules({
      startDate: '2026-09-26',
      finishDate: '2026-09-26',
      rules: [{ weekday: 'Sat', startTime: '23:00', endTime: '24:00', courtId: 'c1' }],
    })
    expect(sessions).toEqual([{ date: '2026-09-26', startTime: '23:00', courtId: 'c1' }])
  })

  it('expands different court/time per weekday', () => {
    const start = '2026-09-26' // Sat
    const finish = '2026-10-02' // Fri
    const sessions = expandSeasonRules({
      startDate: start,
      finishDate: finish,
      rules: [
        { weekday: 'Sat', startTime: '10:00', endTime: '11:00', courtId: 'c1' },
        { weekday: 'Wed', startTime: '18:00', endTime: '19:00', courtId: 'c2' },
      ],
    })
    expect(sessions).toEqual([
      { date: '2026-09-26', startTime: '10:00', courtId: 'c1' },
      { date: '2026-09-30', startTime: '18:00', courtId: 'c2' },
    ])
  })
})

describe('legacySeasonToRules', () => {
  it('maps courts × days', () => {
    const rules = legacySeasonToRules({
      days: ['Mon'],
      times: ['12:00'],
      courtIds: ['a', 'b'],
    })
    expect(rules).toHaveLength(2)
    expect(rules[0]?.courtId).toBe('a')
    expect(rules[1]?.courtId).toBe('b')
  })
})

describe('deriveSeasonRulesFromSlots', () => {
  it('dedupes weekday/time/court patterns', () => {
    const rules = deriveSeasonRulesFromSlots([
      { date: '2026-09-26', startTime: '10:00', endTime: '11:00', courtId: 'c1' }, // Sat
      { date: '2026-10-03', startTime: '10:00', endTime: '11:00', courtId: 'c1' }, // Sat again
      { date: '2026-09-30', startTime: '18:00', endTime: '19:00', courtId: 'c2' }, // Wed
    ])
    expect(rules).toEqual([
      { weekday: 'Sat', startTime: '10:00', endTime: '11:00', courtId: 'c1' },
      { weekday: 'Wed', startTime: '18:00', endTime: '19:00', courtId: 'c2' },
    ])
  })

  it('re-expands into later dates for an extend', () => {
    const rules = deriveSeasonRulesFromSlots([
      { date: '2026-09-26', startTime: '10:00', endTime: '11:00', courtId: 'c1' },
    ])
    const next = expandSeasonRules({
      startDate: '2026-10-03',
      finishDate: '2026-10-10',
      rules,
    })
    expect(next).toEqual([
      { date: '2026-10-03', startTime: '10:00', courtId: 'c1' },
      { date: '2026-10-10', startTime: '10:00', courtId: 'c1' },
    ])
  })
})

describe('maxIsoDate', () => {
  it('picks the latest valid ISO date', () => {
    expect(maxIsoDate('2026-10-01', null, '2026-11-15', '', '2026-09-01')).toBe('2026-11-15')
    expect(maxIsoDate()).toBe('')
  })
})

describe('seasonRulesFromOccurrences (edit / repeat reload)', () => {
  // 2026-11-03, -10, -17 are Tuesdays.
  const tuesdays = ['2026-11-03', '2026-11-10', '2026-11-17']

  it('merges a Tue 18:00–20:00 season back into one rule', () => {
    const sessions = tuesdays.flatMap((date) => [
      { date, startTime: '18:00', courtId: 'z3' },
      { date, startTime: '19:00', courtId: 'z3' },
    ])
    expect(seasonRulesFromOccurrences(sessions)).toEqual([
      { weekday: 'Tue', courtId: 'z3', startTime: '18:00', endTime: '20:00' },
    ])
  })

  it('keeps the full range when one week lost an hour to a conflict', () => {
    const sessions = [
      { date: tuesdays[0]!, startTime: '18:00', courtId: 'z3' },
      { date: tuesdays[0]!, startTime: '19:00', courtId: 'z3' },
      { date: tuesdays[1]!, startTime: '18:00', courtId: 'z3' },
    ]
    expect(seasonRulesFromOccurrences(sessions)).toEqual([
      { weekday: 'Tue', courtId: 'z3', startTime: '18:00', endTime: '20:00' },
    ])
  })

  it('keeps separate ranges when hours are not back to back, and ends at 24:00', () => {
    const sessions = [
      { date: tuesdays[0]!, startTime: '18:00', courtId: 'z3' },
      { date: tuesdays[0]!, startTime: '21:00', courtId: 'z3' },
      { date: tuesdays[0]!, startTime: '22:00', courtId: 'z3' },
      { date: tuesdays[0]!, startTime: '23:00', courtId: 'z3' },
    ]
    expect(seasonRulesFromOccurrences(sessions)).toEqual([
      { weekday: 'Tue', courtId: 'z3', startTime: '18:00', endTime: '19:00' },
      { weekday: 'Tue', courtId: 'z3', startTime: '21:00', endTime: '24:00' },
    ])
  })

  it('reload → save re-expands to exactly the same sessions (no extra, no missing)', () => {
    const original = expandSeasonRules({
      startDate: '2026-11-01',
      finishDate: '2026-11-30',
      rules: [
        { weekday: 'Tue', startTime: '18:00', endTime: '20:00', courtId: 'z3' },
        { weekday: 'Sat', startTime: '21:00', endTime: '22:00', courtId: 'z1' },
      ],
    })
    const reloaded = groupSeasonRulesForUi(seasonRulesFromOccurrences(original))
    expect(reloaded).toHaveLength(2)
    const rules = reloaded.flatMap((row) => row.weekdays.flatMap((weekday) =>
      row.courtIds.map((courtId) => ({ weekday, courtId, startTime: row.startTime, endTime: row.endTime }))))
    const again = expandSeasonRules({ startDate: '2026-11-01', finishDate: '2026-11-30', rules })
    expect(again).toEqual(original)
  })
})
