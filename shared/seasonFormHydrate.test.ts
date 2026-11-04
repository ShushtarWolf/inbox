import { describe, expect, it } from 'vitest'
import { groupSeasonRulesForUi, resolveSeasonGuestFields } from './seasonFormHydrate'

describe('groupSeasonRulesForUi', () => {
  it('merges weekdays and courts that share the same time range', () => {
    const rows = groupSeasonRulesForUi([
      { weekday: 'Sat', startTime: '10:00', endTime: '11:00', courtId: 'c1' },
      { weekday: 'Wed', startTime: '10:00', endTime: '11:00', courtId: 'c1' },
      { weekday: 'Sat', startTime: '10:00', endTime: '11:00', courtId: 'c2' },
      { weekday: 'Fri', startTime: '18:00', endTime: '19:00', courtId: 'c1' },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      startTime: '10:00',
      endTime: '11:00',
      weekdays: expect.arrayContaining(['Sat', 'Wed']),
      courtIds: expect.arrayContaining(['c1', 'c2']),
    })
    expect(rows[1]).toEqual({
      weekdays: ['Fri'],
      startTime: '18:00',
      endTime: '19:00',
      courtIds: ['c1'],
    })
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
