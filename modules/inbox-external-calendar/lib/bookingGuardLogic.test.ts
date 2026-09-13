import { describe, expect, it } from 'vitest'
import {
  confirmedExternalBusyKeys,
  findExternallyBlockedSlots,
  slotOccupancyKey,
} from './bookingGuardLogic'

describe('bookingGuardLogic', () => {
  it('slotOccupancyKey normalizes start time to HH:mm', () => {
    expect(slotOccupancyKey('court-1', '18:00:00')).toBe('court-1:18:00')
  })

  it('confirmedExternalBusyKeys ignores non-EXTERNAL_BUSY states', () => {
    const keys = confirmedExternalBusyKeys([
      { courtKey: 'c1', startTime: '10:00', state: 'EXTERNAL_BUSY' },
      { courtKey: 'c1', startTime: '11:00', state: 'UNKNOWN' },
      { courtKey: 'c2', startTime: '12:00' },
    ])
    expect(keys).toEqual(new Set(['c1:10:00', 'c2:12:00']))
  })

  it('findExternallyBlockedSlots returns only matching EXTERNAL_BUSY slots', () => {
    const blocked = findExternallyBlockedSlots(
      [
        { courtId: 'c1', startTime: '10:00' },
        { courtId: 'c1', startTime: '11:00' },
        { courtId: 'c2', startTime: '10:00' },
      ],
      [
        { courtKey: 'c1', startTime: '10:00', state: 'EXTERNAL_BUSY' },
        { courtKey: 'c1', startTime: '11:00', state: 'UNKNOWN' },
      ],
    )
    expect(blocked).toEqual([{ courtId: 'c1', startTime: '10:00' }])
  })

  it('no occupied rows → nothing blocked (preserve booking when no external data)', () => {
    expect(findExternallyBlockedSlots(
      [{ courtId: 'c1', startTime: '18:00' }],
      [],
    )).toEqual([])
  })

  it('UNKNOWN-only occupied state does not block', () => {
    expect(findExternallyBlockedSlots(
      [{ courtId: 'c1', startTime: '18:00' }],
      [{ courtKey: 'c1', startTime: '18:00', state: 'UNKNOWN' }],
    )).toEqual([])
  })
})
