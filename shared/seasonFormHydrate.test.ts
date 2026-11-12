import { describe, expect, it } from 'vitest'
import { groupSeasonRulesForUi, resolveSeasonGuestFields } from './seasonFormHydrate'

describe('groupSeasonRulesForUi', () => {
  it('groups weekdays only when they share the same courts and time range', () => {
    const rows = groupSeasonRulesForUi([
      { weekday: 'Sat', startTime: '10:00', endTime: '11:00', courtId: 'c1' },
      { weekday: 'Wed', startTime: '10:00', endTime: '11:00', courtId: 'c1' },
      { weekday: 'Sat', startTime: '10:00', endTime: '11:00', courtId: 'c2' },
      { weekday: 'Mon', startTime: '10:00', endTime: '11:00', courtId: 'c1' },
      { weekday: 'Fri', startTime: '18:00', endTime: '19:00', courtId: 'c1' },
    ])
    expect(rows).toHaveLength(3)
    expect(rows).toContainEqual({ weekdays: ['Sat'], startTime: '10:00', endTime: '11:00', courtIds: ['c1', 'c2'] })
    expect(rows).toContainEqual({ weekdays: ['Wed', 'Mon'], startTime: '10:00', endTime: '11:00', courtIds: ['c1'] })
    expect(rows).toContainEqual({ weekdays: ['Fri'], startTime: '18:00', endTime: '19:00', courtIds: ['c1'] })
  })

  it('never cross-multiplies weekdays and courts that were not booked together', () => {
    const input = [
      { weekday: 'Tue', startTime: '21:00', endTime: '22:00', courtId: 'court3' },
      { weekday: 'Sat', startTime: '21:00', endTime: '22:00', courtId: 'court1' },
    ]
    const rows = groupSeasonRulesForUi(input)
    const expanded = rows.flatMap((row) => row.weekdays.flatMap((weekday) =>
      row.courtIds.map((courtId) => `${weekday}|${courtId}|${row.startTime}`)))
    expect(expanded.sort()).toEqual(['Sat|court1|21:00', 'Tue|court3|21:00'])
  })
})

describe('resolveSeasonGuestFields', () => {
  it('splits a legacy full name stored only in guestName', () => {
    const resolved = resolveSeasonGuestFields({ guestName: 'الهه عباسی', guestFamily: '' })
    expect(resolved.guestName).toBe('الهه')
    expect(resolved.guestFamily).toBe('عباسی')
    expect(resolved.guestLabel).toBe('الهه عباسی')
  })

  it('keeps explicit first and family columns', () => {
    const resolved = resolveSeasonGuestFields({ guestName: 'محسن', guestFamily: 'رهنما' })
    expect(resolved.guestLabel).toBe('محسن رهنما')
  })
})
