import { describe, expect, it } from 'vitest'
import { parseAloVarzeshOccupiedTimes } from './alovarzeshParse'

function dayBox(cls: string, jalaliDate: string, time: string): string {
  return `<div class="${cls}"><input name="product_schedule" value="${jalaliDate} ${time}" /><span class="time-value">${time}</span></div>`
}

describe('parseAloVarzeshOccupiedTimes', () => {
  const date = '1405-06-15'

  it('marks bg-disabled as occupied when ignoreBefore is unset', () => {
    const html = [
      dayBox('day-box flex-timetable row bg-disabled', date, '10:00'),
      dayBox('day-box flex-timetable row', date, '11:00'),
    ].join('')
    expect(parseAloVarzeshOccupiedTimes(html, date)).toEqual(['10:00'])
  })

  it('skips past bg-disabled hours when ignoreBefore is set', () => {
    const html = [
      dayBox('day-box flex-timetable row bg-disabled', date, '10:00'),
      dayBox('day-box flex-timetable row bg-disabled', date, '18:00'),
      dayBox('day-box flex-timetable row bg-disabled', date, '19:00'),
    ].join('')
    expect(parseAloVarzeshOccupiedTimes(html, date, { ignoreBefore: '18:00' })).toEqual([
      '18:00',
      '19:00',
    ])
  })

  it('keeps reserve-over even before ignoreBefore', () => {
    const html = dayBox('day-box flex-timetable row reserve-over', date, '09:00')
    expect(parseAloVarzeshOccupiedTimes(html, date, { ignoreBefore: '18:00' })).toEqual(['09:00'])
  })
})
