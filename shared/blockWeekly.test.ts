import { describe, expect, it } from 'vitest'
import {
  classifyBlockCandidate,
  classifyUnblockCandidate,
  expandWeeklyAnchorOccurrences,
} from './blockWeekly.ts'

describe('classifyBlockCandidate', () => {
  it('allows FREE and club BLOCKED; rejects occupied', () => {
    expect(classifyBlockCandidate({ displayStatus: 'FREE' })).toBe('BLOCKABLE')
    expect(classifyBlockCandidate({ displayStatus: 'BLOCKED' })).toBe('BLOCKABLE')
    expect(classifyBlockCandidate({
      displayStatus: 'BLOCKED',
      bookingStatus: 'CONFIRMED',
      bookingSource: 'CLUB',
    })).toBe('BLOCKABLE')
    expect(classifyBlockCandidate({
      displayStatus: 'BLOCKED',
      bookingStatus: 'CONFIRMED',
      bookingSource: 'APP',
    })).toBe('OCCUPIED')
    expect(classifyBlockCandidate({ displayStatus: 'RESERVED' })).toBe('OCCUPIED')
  })
})

describe('classifyUnblockCandidate', () => {
  it('allows club BLOCKED only', () => {
    expect(classifyUnblockCandidate({ displayStatus: 'FREE' })).toBe('NOT_BLOCKED')
    expect(classifyUnblockCandidate({ displayStatus: 'BLOCKED' })).toBe('UNBLOCKABLE')
    expect(classifyUnblockCandidate({
      displayStatus: 'BLOCKED',
      bookingStatus: 'CONFIRMED',
      bookingSource: 'CLUB',
    })).toBe('UNBLOCKABLE')
    expect(classifyUnblockCandidate({
      displayStatus: 'BLOCKED',
      bookingStatus: 'CONFIRMED',
      bookingSource: 'APP',
    })).toBe('NOT_CLUB')
  })
})

describe('expandWeeklyAnchorOccurrences', () => {
  it('expands multiple anchors across weeks without duplicate keys', () => {
    const rows = expandWeeklyAnchorOccurrences([
      { courtId: 'c1', anchorDate: '2026-09-23', startTime: '10:00:00' },
      { courtId: 'c1', anchorDate: '2026-09-23', startTime: '11:00:00' },
    ], 2)
    expect(rows).toHaveLength(4)
    expect(rows.filter((r) => r.startTime === '10:00')).toHaveLength(2)
    expect(rows.filter((r) => r.startTime === '11:00')).toHaveLength(2)
  })
})
