import { describe, expect, it } from 'vitest'
import {
  receiptAmenities,
  receiptPolicyLines,
  seasonCalendarMonths,
  seasonScheduleRows,
} from './seasonReceipt'

describe('seasonScheduleRows', () => {
  it('collapses a repeating weekday and keeps a different court on its own row', () => {
    const rows = seasonScheduleRows([
      { iso: '2026-09-26', startTime: '18:00', endTime: '19:00', courtName: 'زمین ۱' },
      { iso: '2026-10-03', startTime: '18:00', endTime: '19:00', courtName: 'زمین ۱' },
      { iso: '2026-09-26', startTime: '20:00', endTime: '21:00', courtName: 'زمین ۲' },
    ])
    expect(rows).toEqual([
      { weekday: 'شنبه‌ها', startTime: '18:00', endTime: '19:00', courtName: 'زمین ۱' },
      { weekday: 'شنبه‌ها', startTime: '20:00', endTime: '21:00', courtName: 'زمین ۲' },
    ])
  })
})

describe('seasonCalendarMonths', () => {
  it('includes the months between the first and last session', () => {
    const months = seasonCalendarMonths(['2026-09-26', '2026-11-07'])
    expect(months.length).toBeGreaterThan(1)
    expect(months[0]).toEqual({ year: 1405, month: 7 })
    expect(months[months.length - 1]?.year).toBe(1405)
    expect(months[months.length - 1]?.month).toBeGreaterThan(7)
  })
})

describe('receipt copy from club fields', () => {
  it('reads saved policy text and maps known amenities to Persian labels', () => {
    expect(receiptPolicyLines(JSON.stringify([
      { titleFa: 'حضور', bodyFa: '۱۵ دقیقه زودتر بیایید.' },
    ]))).toEqual([{ title: 'حضور', body: '۱۵ دقیقه زودتر بیایید.' }])
    expect(receiptAmenities(['parking', 'Kids area'])).toEqual(['پارکینگ', 'Kids area'])
  })
})
