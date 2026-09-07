import { describe, expect, it } from 'vitest'
import { parseAloVarzeshOccupiedTimes, parseAloVarzeshSlotStates } from './alovarzeshParse'

function dayBox(cls: string, jalaliDate: string, time: string): string {
  return `<div class="${cls}"><input name="product_schedule" value="${jalaliDate} ${time}" /><span class="time-value">${time}</span></div>`
}

describe('parseAloVarzeshSlotStates (availability-first)', () => {
  const date = '1405-06-15'

  it('treats bare bg-disabled as UNKNOWN (never BUSY)', () => {
    const html = [
      dayBox('day-box flex-timetable row bg-disabled', date, '10:00'),
      dayBox('day-box flex-timetable row', date, '11:00'),
    ].join('')
    const states = parseAloVarzeshSlotStates(html, date)
    expect(states.find((s) => s.time === '10:00')?.verdict).toBe('UNKNOWN')
    expect(states.find((s) => s.time === '11:00')?.verdict).toBe('FREE')
    expect(parseAloVarzeshOccupiedTimes(html, date)).toEqual([])
  })

  it('marks past bare bg-disabled as UNKNOWN when ignoreBefore is set', () => {
    const html = [
      dayBox('day-box flex-timetable row bg-disabled', date, '10:00'),
      dayBox('day-box flex-timetable row bg-disabled', date, '18:00'),
    ].join('')
    const states = parseAloVarzeshSlotStates(html, date, { ignoreBefore: '18:00' })
    expect(states.find((s) => s.time === '10:00')?.verdict).toBe('UNKNOWN')
    expect(states.find((s) => s.time === '10:00')?.reason).toBe('past_disabled')
    // Future bare disabled still UNKNOWN (not BUSY)
    expect(states.find((s) => s.time === '18:00')?.verdict).toBe('UNKNOWN')
    expect(parseAloVarzeshOccupiedTimes(html, date, { ignoreBefore: '18:00' })).toEqual([])
  })

  it('marks reserve-over as BUSY even before ignoreBefore', () => {
    const html = dayBox('day-box flex-timetable row reserve-over', date, '09:00')
    expect(parseAloVarzeshOccupiedTimes(html, date, { ignoreBefore: '18:00' })).toEqual(['09:00'])
    expect(parseAloVarzeshSlotStates(html, date, { ignoreBefore: '18:00' })[0]?.verdict).toBe('BUSY')
  })

  it('marks bg-disabled + reserved style as BUSY', () => {
    const html = dayBox('day-box flex-timetable row bg-disabled box-green-reserve-time', date, '16:00')
    expect(parseAloVarzeshOccupiedTimes(html, date)).toEqual(['16:00'])
  })

  it('marks bookable boxes as FREE', () => {
    const html = dayBox('day-box flex-timetable row', date, '12:00')
    expect(parseAloVarzeshSlotStates(html, date)[0]).toMatchObject({ verdict: 'FREE', reason: 'bookable' })
  })
})
