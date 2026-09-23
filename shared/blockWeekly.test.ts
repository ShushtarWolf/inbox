import { describe, expect, it } from 'vitest'
import { classifyBlockCandidate } from './blockWeekly.ts'

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
