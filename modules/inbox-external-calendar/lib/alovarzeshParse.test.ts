import { describe, expect, it } from 'vitest'
import { parseAloVarzeshOccupiedTimes, parseAloVarzeshSlotStates } from './alovarzeshParse'

/** Minimal production-style day-box (product 2796, 1405-06-22). */
function productionDayBox(opts: {
  time: string
  disabled?: boolean
  reserveOver?: boolean
  reserveTime?: boolean
  jalaliDate?: string
}): string {
  const date = opts.jalaliDate ?? '1405-06-22'
  const classes = [
    'day-box flex-timetable row',
    opts.disabled ? 'bg-disabled' : '',
    opts.reserveOver ? 'reserve-over' : '',
    opts.reserveTime ? 'box-green-reserve-time' : '',
  ].filter(Boolean).join(' ')
  const timeClass = opts.disabled ? 'text-white' : 'text-green'
  return `<div class="${classes}">
    <span class="time-value ${timeClass}">${opts.time}</span>
    <input type="hidden" name="product_schedule" value="${date} ${opts.time}">
  </div>`
}

describe('parseAloVarzeshSlotStates', () => {
  const todayJalali = '1405-06-22'

  it('A. normal available slot → FREE', () => {
    const html = productionDayBox({ time: '15:00' })
    expect(parseAloVarzeshSlotStates(html, todayJalali)[0]).toMatchObject({
      time: '15:00',
      verdict: 'FREE',
      reason: 'bookable',
    })
  })

  it('B. production-style future bg-disabled slot → BUSY', () => {
    // Extracted from alo-varzesh.com/products/2796?tt_start=2026-09-13 (16:00 unavailable).
    const html = `<div
            class="day-box flex-timetable  row  bg-disabled  "
            >
                        <span class="col-12 col-md-6 right-box">
              <span class="time-text">ساعت</span><br>
              <span class="time-value text-white">16:00</span>
            </span>
          </div>
          <div class="modal fade" id="modal-sorting19">
                  <input type="hidden" name="product_schedule" value="${todayJalali} 16:00">`
    const row = parseAloVarzeshSlotStates(html, todayJalali, { ignoreBefore: '14:00' }).find((s) => s.time === '16:00')
    expect(row).toMatchObject({ verdict: 'BUSY', reason: 'disabled_unavailable' })
    expect(parseAloVarzeshOccupiedTimes(html, todayJalali, { ignoreBefore: '14:00' })).toEqual(['16:00'])
  })

  it('C. past/ignored slot → UNKNOWN (ignoreBefore preserved)', () => {
    const html = productionDayBox({ time: '10:00', disabled: true })
    const row = parseAloVarzeshSlotStates(html, todayJalali, { ignoreBefore: '18:00' }).find((s) => s.time === '10:00')
    expect(row).toMatchObject({ verdict: 'UNKNOWN', reason: 'past_disabled' })
    expect(parseAloVarzeshOccupiedTimes(html, todayJalali, { ignoreBefore: '18:00' })).toEqual([])
  })

  it('D. explicit reserve-over / reserve-time → BUSY (unchanged)', () => {
    const html = [
      productionDayBox({ time: '09:00', reserveOver: true }),
      productionDayBox({ time: '19:00', disabled: true, reserveTime: true }),
    ].join('')
    expect(parseAloVarzeshOccupiedTimes(html, todayJalali, { ignoreBefore: '18:00' }).sort()).toEqual(['09:00', '19:00'])
    expect(parseAloVarzeshSlotStates(html, todayJalali, { ignoreBefore: '18:00' }).find((s) => s.time === '09:00')).toMatchObject({
      verdict: 'BUSY',
      reason: 'reserve_over',
    })
    expect(parseAloVarzeshSlotStates(html, todayJalali, { ignoreBefore: '18:00' }).find((s) => s.time === '19:00')).toMatchObject({
      verdict: 'BUSY',
      reason: 'reserved_disabled',
    })
  })

  it('E. malformed/unknown HTML → no spurious BUSY', () => {
    expect(parseAloVarzeshSlotStates('<p>no timetable</p>', todayJalali)).toEqual([])
    const noTime = '<div class="day-box flex-timetable row bg-disabled"><span>broken</span></div>'
    expect(parseAloVarzeshSlotStates(noTime, todayJalali)).toEqual([])
    expect(parseAloVarzeshOccupiedTimes(noTime, todayJalali)).toEqual([])
  })
})
