import { describe, expect, it } from 'vitest'
import { addOneHour, canManageReservation, diffHours, toDateTime } from './reservations'

describe('toDateTime', () => {
  it('parses date and time into a Date', () => {
    const dt = toDateTime('2026-07-11', '14:30')
    expect(dt.getFullYear()).toBe(2026)
    expect(dt.getMonth()).toBe(6)
    expect(dt.getDate()).toBe(11)
    expect(dt.getHours()).toBe(14)
    expect(dt.getMinutes()).toBe(30)
  })
})

describe('diffHours', () => {
  it('computes hour difference between dates', () => {
    const from = new Date('2026-07-11T10:00:00')
    const to = new Date('2026-07-11T14:30:00')
    expect(diffHours(from, to)).toBe(4.5)
  })
})

describe('addOneHour', () => {
  it('increments hour component', () => {
    expect(addOneHour('09:00')).toBe('10:00')
    expect(addOneHour('23:00')).toBe('24:00')
  })
})

describe('canManageReservation', () => {
  it('allows cancel when outside cancellation window', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const date = futureDate.toISOString().slice(0, 10)
    expect(canManageReservation(date, '20:00', 12)).toBe(true)
  })

  it('blocks cancel inside cancellation window', () => {
    const soon = new Date(Date.now() + 2 * 3600000)
    const date = soon.toISOString().slice(0, 10)
    const time = `${String(soon.getHours()).padStart(2, '0')}:00`
    expect(canManageReservation(date, time, 12)).toBe(false)
  })
})
