import { describe, expect, it } from 'vitest'
import { parseAloVarzeshOccupiedTimes } from './alovarzeshParse'
import { mergeLiveWithStoredOccupancy } from './occupancySnapshots'
import { formatSourceBadge, formatExternalSourceLabels, formatSourceLabelList } from '../runtime/server/lib/badges'
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
    expect(formatSourceBadge(['aloplay', 'alovarzesh'])).toBe('الوپلی + الوورزش')
  })
})

describe('formatSourceLabelList', () => {
  it('returns ordered labels without join separator', () => {
    expect(formatSourceLabelList(['aloplay', 'alovarzesh'])).toEqual(['الوپلی', 'الوورزش'])
    expect(formatSourceLabelList(['courtic', 'alovarzesh', 'inbox'])).toEqual(['اینباکس', 'الوورزش', 'کورتیک'])
  })
})

describe('formatExternalSourceLabels', () => {
  it('excludes inbox for stacked external-only badges', () => {
    expect(formatExternalSourceLabels(['aloplay', 'inbox'])).toEqual(['الوپلی'])
    expect(formatExternalSourceLabels(['aloplay', 'alovarzesh'])).toEqual(['الوپلی', 'الوورزش'])
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

  it('coalesces inbox HH:mm:ss with external HH:mm on the same cell', () => {
    const merged = mergeOccupancy(
      [{
        courtId: 'c1',
        startTime: '08:00:00',
        endTime: '09:00:00',
        displayStatus: 'FREE',
      }],
      [{
        courtKey: 'c1',
        startTime: '08:00',
        endTime: '09:00',
        source: 'aloplay',
      }],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.sources).toEqual(['aloplay'])
    expect(merged[0]?.occupied).toBe(true)
    expect(merged[0]?.startTime).toBe('08:00')
  })

  it('merges AloPlay + AloVarzesh conflict on same court+startTime', () => {
    const merged = mergeOccupancy(
      [{
        courtId: 'c1',
        startTime: '10:00',
        endTime: '11:00',
        displayStatus: 'FREE',
      }],
      [
        {
          courtKey: 'c1',
          startTime: '10:00',
          endTime: '11:00',
          source: 'aloplay',
        },
        {
          courtKey: 'c1',
          startTime: '10:00',
          endTime: '11:00',
          source: 'alovarzesh',
        },
      ],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.sources).toEqual(['aloplay', 'alovarzesh'])
    expect(merged[0]?.badge).toBe('الوپلی + الوورزش')
    expect(merged[0]?.occupied).toBe(true)
  })

  it('shows AloPlay only when AloVarzesh is free', () => {
    const merged = mergeOccupancy(
      [{
        courtId: 'c1',
        startTime: '10:00',
        endTime: '11:00',
        displayStatus: 'FREE',
      }],
      [{
        courtKey: 'c1',
        startTime: '10:00',
        endTime: '11:00',
        source: 'aloplay',
      }],
    )

    expect(merged[0]?.sources).toEqual(['aloplay'])
    expect(merged[0]?.badge).toBe('الوپلی')
  })

  it('shows AloVarzesh only when AloPlay is free', () => {
    const merged = mergeOccupancy(
      [{
        courtId: 'c1',
        startTime: '10:00',
        endTime: '11:00',
        displayStatus: 'FREE',
      }],
      [{
        courtKey: 'c1',
        startTime: '10:00',
        endTime: '11:00',
        source: 'alovarzesh',
      }],
    )

    expect(merged[0]?.sources).toEqual(['alovarzesh'])
    expect(merged[0]?.badge).toBe('الوورزش')
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

  it('flags suspected from AloVarzesh when inbox is free', () => {
    const suspected = computeSuspectedSlots(
      [{ courtId: 'c1', startTime: '10:00', endTime: '11:00', displayStatus: 'FREE', id: 's1' }],
      [{ courtKey: 'c1', startTime: '10:00', endTime: '11:00', source: 'alovarzesh' }],
    )
    expect(suspected).toEqual([{
      slotId: 's1',
      startTime: '10:00',
      courtId: 'c1',
      suspected: true,
    }])
  })

  it('flags suspected when both AloPlay and AloVarzesh occupy inbox-free slot', () => {
    const suspected = computeSuspectedSlots(
      [{ courtId: 'c1', startTime: '10:00', endTime: '11:00', displayStatus: 'FREE', id: 's1' }],
      [
        { courtKey: 'c1', startTime: '10:00', endTime: '11:00', source: 'aloplay' },
        { courtKey: 'c1', startTime: '10:00', endTime: '11:00', source: 'alovarzesh' },
      ],
    )
    expect(suspected).toHaveLength(1)
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

describe('mergeLiveWithStoredOccupancy', () => {
  it('falls back to stored AloVarzesh when live fetch failed', () => {
    const merged = mergeLiveWithStoredOccupancy(
      [],
      [{
        courtKey: 'c1',
        startTime: '09:00',
        endTime: '10:00',
        source: 'alovarzesh',
      }],
      { alovarzesh: false },
    )
    expect(merged).toEqual([{
      courtKey: 'c1',
      startTime: '09:00',
      endTime: '10:00',
      source: 'alovarzesh',
    }])
  })

  it('uses live AloPlay and live AloVarzesh independently when both succeed', () => {
    const merged = mergeLiveWithStoredOccupancy(
      [{
        courtKey: 'c1',
        startTime: '10:00',
        endTime: '11:00',
        source: 'aloplay',
      }],
      [{
        courtKey: 'c1',
        startTime: '09:00',
        endTime: '10:00',
        source: 'alovarzesh',
      }],
      { aloplay: true, alovarzesh: false },
    )
    expect(merged).toHaveLength(2)
    expect(merged.map((slot) => `${slot.source}:${slot.startTime}`)).toEqual([
      'alovarzesh:09:00',
      'aloplay:10:00',
    ])
  })

  it('drops stored rows when live succeeded and returned fewer slots (occupancy shrinks)', () => {
    const merged = mergeLiveWithStoredOccupancy(
      [{
        courtKey: 'c1',
        startTime: '17:00',
        endTime: '18:00',
        source: 'aloplay',
      }],
      [
        {
          courtKey: 'c1',
          startTime: '07:00',
          endTime: '08:00',
          source: 'aloplay',
        },
        {
          courtKey: 'c1',
          startTime: '08:00',
          endTime: '09:00',
          source: 'aloplay',
        },
        {
          courtKey: 'c1',
          startTime: '17:00',
          endTime: '18:00',
          source: 'aloplay',
        },
      ],
      { aloplay: true },
    )
    expect(merged).toEqual([{
      courtKey: 'c1',
      startTime: '17:00',
      endTime: '18:00',
      source: 'aloplay',
    }])
  })

  it('returns empty live AloVarzesh when fetch succeeded and all slots are free', () => {
    const merged = mergeLiveWithStoredOccupancy(
      [],
      [{
        courtKey: 'c1',
        startTime: '16:00',
        endTime: '17:00',
        source: 'alovarzesh',
      }],
      { alovarzesh: true },
    )
    expect(merged).toEqual([])
  })
})
