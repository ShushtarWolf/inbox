import { describe, expect, it } from 'vitest'
import { countFutureFreeOverviewSlots } from './ownerCalendarOverview.ts'

const tehranMorning = new Date('2026-11-16T08:00:00+03:30')

describe('countFutureFreeOverviewSlots', () => {
  const neverExternal = () => false
  const alwaysExternal = () => true

  it('excludes past FREE slots on today (Tehran)', () => {
    const slots = [
      { displayStatus: 'FREE', startTime: '07:00' },
      { displayStatus: 'FREE', startTime: '09:00' },
      { displayStatus: 'RESERVED', startTime: '10:00' },
    ]
    expect(countFutureFreeOverviewSlots(slots, '2026-11-16', neverExternal, tehranMorning)).toBe(1)
  })

  it('counts all FREE slots on a future calendar day', () => {
    const slots = [
      { displayStatus: 'FREE', startTime: '07:00' },
      { displayStatus: 'FREE', startTime: '22:00' },
    ]
    expect(countFutureFreeOverviewSlots(slots, '2026-11-20', neverExternal, tehranMorning)).toBe(2)
  })

  it('does not count external-only occupied as free', () => {
    const slots = [{ displayStatus: 'FREE', startTime: '12:00' }]
    expect(countFutureFreeOverviewSlots(slots, '2026-11-16', alwaysExternal, tehranMorning)).toBe(0)
  })

  it('ignores CLOSED slots (caller passes bookable list only)', () => {
    const bookable = [
      { displayStatus: 'FREE', startTime: '11:00' },
      { displayStatus: 'FREE', startTime: '14:00' },
    ]
    expect(countFutureFreeOverviewSlots(bookable, '2026-11-16', neverExternal, tehranMorning)).toBe(2)
  })
})