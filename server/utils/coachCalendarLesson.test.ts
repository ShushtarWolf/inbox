import { describe, expect, it } from 'vitest'
import { coachHourIsOpen, padCoachTime } from './coachCalendarLesson'

const windows = [{ dayOfWeek: 4, startTime: '09:00', endTime: '18:00' }]

describe('padCoachTime', () => {
  it('pads a single-digit hour and rejects junk', () => {
    expect(padCoachTime('9:00')).toBe('09:00')
    expect(padCoachTime('09:00:00')).toBe('09:00')
    expect(padCoachTime('24:00')).toBeNull()
    expect(padCoachTime('noon')).toBeNull()
  })
})

describe('coachHourIsOpen', () => {
  it('accepts an on-window hour and rejects the end, another day, and earlier hours', () => {
    expect(coachHourIsOpen(windows, 4, '09:00')).toBe(true)
    expect(coachHourIsOpen(windows, 4, '17:00')).toBe(true)
    expect(coachHourIsOpen(windows, 4, '18:00')).toBe(false)
    expect(coachHourIsOpen(windows, 4, '08:00')).toBe(false)
    expect(coachHourIsOpen(windows, 5, '09:00')).toBe(false)
  })
})
