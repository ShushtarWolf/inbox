import { describe, expect, it } from 'vitest'
import { assessAloPlayCompleteness, distinctClockTimes } from './completeness'
import { freeSlotKey } from './aloplayParse'

function freeSet(entries: Array<[number, string]>): Set<string> {
  return new Set(entries.map(([id, t]) => freeSlotKey(id, t)))
}

describe('assessAloPlayCompleteness', () => {
  it('returns UNKNOWN for empty free set', () => {
    expect(assessAloPlayCompleteness({ freeSlots: new Set(), mappedProductIds: [1] })).toBe('UNKNOWN')
  })

  it('returns UNKNOWN when fewer than 3 distinct clock times', () => {
    const freeSlots = freeSet([[112282, '17:00'], [112282, '20:00'], [56921, '17:00']])
    expect(distinctClockTimes(freeSlots).size).toBe(2)
    expect(assessAloPlayCompleteness({ freeSlots, mappedProductIds: [112282, 56921] })).toBe('UNKNOWN')
  })

  it('returns UNKNOWN when no mapped product appears in free set', () => {
    const freeSlots = freeSet([
      [999, '10:00'],
      [999, '11:00'],
      [999, '12:00'],
    ])
    expect(assessAloPlayCompleteness({ freeSlots, mappedProductIds: [112282] })).toBe('UNKNOWN')
  })

  it('returns COMPLETE when rich free map overlaps mapped products', () => {
    const freeSlots = freeSet([
      [112282, '17:00'],
      [112282, '20:00'],
      [112282, '22:00'],
    ])
    expect(assessAloPlayCompleteness({ freeSlots, mappedProductIds: [112282] })).toBe('COMPLETE')
  })

  it('returns UNKNOWN on parseError', () => {
    const freeSlots = freeSet([
      [112282, '17:00'],
      [112282, '20:00'],
      [112282, '22:00'],
    ])
    expect(assessAloPlayCompleteness({
      freeSlots,
      mappedProductIds: [112282],
      parseError: 'boom',
    })).toBe('UNKNOWN')
  })
})
