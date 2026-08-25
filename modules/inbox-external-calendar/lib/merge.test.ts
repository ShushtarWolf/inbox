import { describe, expect, it } from 'vitest'
import { formatSourceBadge } from '../runtime/server/lib/badges'
import { isInboxOccupied, mergeOccupancy } from '../runtime/server/lib/merge'

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
