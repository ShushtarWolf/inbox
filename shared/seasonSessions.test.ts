import { describe, expect, it } from 'vitest'
import { jalaliMonthEndIso, jalaaliToIso } from './jalali'
import { expandSeasonRules, legacySeasonToRules } from './seasonSessions'

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
