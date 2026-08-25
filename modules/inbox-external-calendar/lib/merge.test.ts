import { describe, expect, it } from 'vitest'
import { parseAloVarzeshOccupiedTimes } from './alovarzeshParse'
import { formatSourceBadge } from '../runtime/server/lib/badges'
import { isInboxOccupied, mergeOccupancy } from '../runtime/server/lib/merge'
import { computeSuspectedSlots } from '../runtime/server/lib/suspected'
import { sourceDetailsForCell } from '../runtime/server/lib/sourceDetails'
import { addMinutes } from '../runtime/server/lib/time'

describe('formatSourceBadge', () => {
  it('returns empty for no sources', () => {
    expect(formatSourceBadge([])).toBe('')
  })

  it('labels a single source in Persian', () => {
    expect(formatSourceBadge(['inbox'])).toBe('اینباکس')
    expect(formatSourceBadge(['aloplay'])).toBe('الوپلی')
  })

  it('joins overlap sources in stable order', () => {
    expect(formatSourceBadge(['aloplay', 'inbox'])).toBe('اینباکس + الوپلی')
    expect(formatSourceBadge(['courtic', 'alovarzesh', 'inbox'])).toBe('اینباکس + الوورزش + کورتیک')
  })
})

describe('mergeOccupancy', () => {
  it('merges inbox and external occupancy with overlap badge', () => {
    const merged = mergeOccupancy(
      [{
        courtId: 'c1',
        startTime: '10:00',
        endTime: '11:00',
        displayStatus: 'RESERVED',
      }],
      [{
        courtKey: 'c1',
        startTime: '10:00',
        endTime: '11:00',
        source: 'aloplay',
      }],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.sources).toEqual(['inbox', 'aloplay'])
    expect(merged[0]?.badge).toBe('اینباکس + الوپلی')
    expect(merged[0]?.occupied).toBe(true)
  })

  it('adds external-only occupied cells', () => {
    const merged = mergeOccupancy(
      [],
      [{
        courtKey: 'c2',
        startTime: '12:00',
        endTime: '13:00',
        source: 'aloplay',
      }],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.inboxStatus).toBe('FREE')
    expect(merged[0]?.badge).toBe('الوپلی')
  })
})

describe('isInboxOccupied', () => {
  it('treats busy desk statuses as occupied', () => {
    expect(isInboxOccupied('RESERVED')).toBe(true)
    expect(isInboxOccupied('PENDING')).toBe(true)
    expect(isInboxOccupied('BLOCKED')).toBe(true)
  })

  it('treats free/cancelled/closed as not occupied', () => {
    expect(isInboxOccupied('FREE')).toBe(false)
    expect(isInboxOccupied('CANCELLED')).toBe(false)
    expect(isInboxOccupied('CLOSED')).toBe(false)
  })
})

describe('computeSuspectedSlots', () => {
  it('flags inbox-free + external-occupied without platform fields', () => {
    const suspected = computeSuspectedSlots(
      [{ courtId: 'c1', startTime: '10:00', endTime: '11:00', displayStatus: 'FREE', id: 's1' }],
      [{ courtKey: 'c1', startTime: '10:00', endTime: '11:00', source: 'aloplay' }],
    )
    expect(suspected).toEqual([{
      slotId: 's1',
      startTime: '10:00',
      courtId: 'c1',
      suspected: true,
    }])
  })

  it('ignores inbox-busy slots', () => {
    const suspected = computeSuspectedSlots(
      [{ courtId: 'c1', startTime: '10:00', endTime: '11:00', displayStatus: 'RESERVED' }],
      [{ courtKey: 'c1', startTime: '10:00', endTime: '11:00', source: 'aloplay' }],
    )
    expect(suspected).toEqual([])
  })
})

describe('sourceDetailsForCell', () => {
  it('includes Persian site label and external club title for owner/admin', () => {
    const details = sourceDetailsForCell(
      {
        inboxSlug: 'iust-tennis',
        label: 'دانشگاه علم و صنعت',
        sources: { aloplay: { clubId: 10887, clubTitle: 'باشگاه نمونه AloPlay' } },
      },
      ['inbox', 'aloplay'],
    )
    expect(details).toEqual([
      { source: 'inbox', siteLabel: 'اینباکس', externalClubTitle: 'دانشگاه علم و صنعت' },
      { source: 'aloplay', siteLabel: 'الوپلی', externalClubTitle: 'باشگاه نمونه AloPlay' },
    ])
  })
})

describe('addMinutes', () => {
  it('adds session length on the same day', () => {
    expect(addMinutes('10:00', 60)).toBe('11:00')
    expect(addMinutes('07:30', 90)).toBe('09:00')
  })
})

describe('parseAloVarzeshOccupiedTimes', () => {
  it('flags bg-disabled rows for the requested Jalali day', () => {
    const html = `
      <div class="day-box flex-timetable row bg-disabled ">
        <span class="time-value">07:00</span>
        <input type="hidden" name="product_schedule" value="1405-06-03 07:00">
      </div>
      <div class="day-box flex-timetable row ">
        <span class="time-value">08:00</span>
        <input type="hidden" name="product_schedule" value="1405-06-03 08:00">
      </div>
      <div class="day-box flex-timetable row bg-disabled ">
        <span class="time-value">09:00</span>
        <input type="hidden" name="product_schedule" value="1405-06-04 09:00">
      </div>
      <div class="day-box flex-timetable row bg-disabled box-green-reserve-over">
        <span class="time-value">10:00</span>
        <input type="hidden" name="product_schedule" value="1405-06-03 10:00">
      </div>
    `
    expect(parseAloVarzeshOccupiedTimes(html, '1405-06-03')).toEqual(['07:00', '10:00'])
  })
})
