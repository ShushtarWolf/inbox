import { describe, expect, it } from 'vitest'
import { countRecurringSessions, timesInRange } from './recurringSessions'

describe('timesInRange', () => {
  it('returns hourly slots between start and end', () => {
    expect(timesInRange('10:00', '13:00')).toEqual(['10:00', '11:00', '12:00'])
  })

  it('returns empty when end is not after start', () => {
    expect(timesInRange('14:00', '14:00')).toEqual([])
    expect(timesInRange('15:00', '14:00')).toEqual([])
  })
})

describe('countRecurringSessions', () => {
  it('multiplies matching weekdays by hours in range over 8 weeks', () => {
    const count = countRecurringSessions(['Sun'], '10:00', '12:00', '2025-07-06')
    expect(count).toBe(8 * 2)
  })
})
