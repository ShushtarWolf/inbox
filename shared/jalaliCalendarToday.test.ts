import { describe, expect, it } from 'vitest'
import { jalaliCalendarTodayDisabled } from './jalaliCalendarToday.ts'

describe('jalaliCalendarTodayDisabled', () => {
  it('stays enabled on the current month view', () => {
    expect(jalaliCalendarTodayDisabled({ todayIso: '2026-11-16' })).toBe(false)
  })

  it('disables when today is before minDate', () => {
    expect(jalaliCalendarTodayDisabled({ todayIso: '2026-11-16', minDate: '2026-11-17' })).toBe(true)
  })

  it('disables when today is after maxDate', () => {
    expect(jalaliCalendarTodayDisabled({ todayIso: '2026-11-16', maxDate: '2026-11-15' })).toBe(true)
  })
})