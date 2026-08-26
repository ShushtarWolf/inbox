import { describe, expect, it } from 'vitest'
import { occupiedProductIdsFromByTime, unionOccupiedProductIds } from './aloplayParse'

describe('occupiedProductIdsFromByTime', () => {
  it('marks only products with remainedCapacity===0', () => {
    const payload = {
      data: [
        { productId: 56921, remainedCapacity: 0 },
        { productId: 317335, remainedCapacity: 1 },
        { productId: 112282, remainedCapacity: 0 },
      ],
    }
    expect([...occupiedProductIdsFromByTime(payload)].sort((a, b) => a - b)).toEqual([56921, 112282])
  })

  it('returns empty when court is missing from the hour', () => {
    const payload = {
      data: [{ productId: 56921, remainedCapacity: 0 }],
    }
    expect(occupiedProductIdsFromByTime(payload).has(317335)).toBe(false)
    expect(occupiedProductIdsFromByTime(payload).has(112282)).toBe(false)
  })

  it('handles malformed payloads safely', () => {
    expect(occupiedProductIdsFromByTime(null).size).toBe(0)
    expect(occupiedProductIdsFromByTime({ data: 'nope' }).size).toBe(0)
  })
})

describe('unionOccupiedProductIds', () => {
  it('unions occupied products across genders', () => {
    const male = {
      data: [
        { productId: 56921, remainedCapacity: 0 },
        { productId: 112282, remainedCapacity: 0 },
      ],
    }
    const female = {
      data: [
        { productId: 56921, remainedCapacity: 0 },
        { productId: 317335, remainedCapacity: 0 },
      ],
    }
    expect([...unionOccupiedProductIds([male, female])].sort((a, b) => a - b)).toEqual([56921, 112282, 317335])
  })

  it('does not mark products absent from all gender responses', () => {
    const male = { data: [{ productId: 56921, remainedCapacity: 0 }] }
    const female = { data: [{ productId: 317335, remainedCapacity: 1 }] }
    const union = unionOccupiedProductIds([male, female])
    expect(union.has(56921)).toBe(true)
    expect(union.has(317335)).toBe(false)
    expect(union.has(112282)).toBe(false)
  })
})
