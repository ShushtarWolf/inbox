import { describe, expect, it } from 'vitest'
import {
  assessAloPlayCompleteness,
  distinctClockTimes,
  freeClockSpanHours,
} from './completeness'
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

  it('returns PARTIAL when only one of several mapped products is rich', () => {
    const freeSlots = freeSet([
      [112282, '10:00'],
      [112282, '14:00'],
      [112282, '18:00'],
      [112282, '20:00'],
      // 56921 missing / thin — must not COMPLETE and paint its hours BUSY
    ])
    expect(
      assessAloPlayCompleteness({ freeSlots, mappedProductIds: [112282, 56921] }),
    ).toBe('PARTIAL')
  })

  it('returns PARTIAL when clocks are clustered (truncated stub span)', () => {
    const freeSlots = freeSet([
      [56921, '12:00'],
      [56921, '13:00'],
      [56921, '14:00'],
      [317335, '12:00'],
      [317335, '13:00'],
      [317335, '14:00'],
      [112282, '12:00'],
      [112282, '13:00'],
      [112282, '14:00'],
    ])
    expect(freeClockSpanHours(freeSlots)).toBe(2)
    expect(
      assessAloPlayCompleteness({
        freeSlots,
        mappedProductIds: [56921, 317335, 112282],
      }),
    ).toBe('PARTIAL')
  })

  it('returns COMPLETE when every mapped product is rich and span is wide', () => {
    const freeSlots = freeSet([
      [56921, '08:00'],
      [56921, '12:00'],
      [56921, '18:00'],
      [317335, '09:00'],
      [317335, '13:00'],
      [317335, '19:00'],
      [112282, '10:00'],
      [112282, '14:00'],
      [112282, '20:00'],
    ])
    expect(
      assessAloPlayCompleteness({
        freeSlots,
        mappedProductIds: [56921, 317335, 112282],
      }),
    ).toBe('COMPLETE')
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
