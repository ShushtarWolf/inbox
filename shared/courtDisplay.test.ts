import { describe, expect, it } from 'vitest'
import {
  courtDisplayNumber,
  courtOrdinalFromName,
  sortCourtsByOrdinal,
} from './courtDisplay.ts'

describe('courtOrdinalFromName', () => {
  it('reads Latin and Persian digits from زمین names', () => {
    expect(courtOrdinalFromName('زمین 1')).toBe(1)
    expect(courtOrdinalFromName('زمین ۳ غیر استاندارد')).toBe(3)
    expect(courtOrdinalFromName('Court 2', 'Court 2')).toBe(2)
  })

  it('returns null when no number exists', () => {
    expect(courtOrdinalFromName('سالن اصلی')).toBeNull()
  })
})

describe('sortCourtsByOrdinal', () => {
  it('orders by name ordinal so chip 1 is never a later court from DB order', () => {
    const courts = [
      { id: 'c3', nameFa: 'زمین 3 غیر استاندارد', price: 480000 },
      { id: 'c1', nameFa: 'زمین 1', price: 600000 },
      { id: 'c2', nameFa: 'زمین 2', price: 600000 },
    ]
    const sorted = sortCourtsByOrdinal(courts)
    expect(sorted.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(sorted.map((c, idx) => courtDisplayNumber(c, idx))).toEqual([1, 2, 3])
    expect(sorted[0]!.price).toBe(600000)
    expect(sorted[2]!.price).toBe(480000)
  })

  it('keeps selecting court A from charging court B price after mis-ordered API payload', () => {
    const apiOrder = [
      { id: 'cheap', nameFa: 'زمین 3 غیر استاندارد', price: 480000 },
      { id: 'std1', nameFa: 'زمین 1', price: 600000 },
    ]
    const courts = sortCourtsByOrdinal(apiOrder)
    const court1 = courts.find((c) => courtOrdinalFromName(c.nameFa) === 1)!
    const chipLabel = courtDisplayNumber(court1, courts.indexOf(court1))
    expect(chipLabel).toBe(1)
    expect(court1.price).toBe(600000)
    expect(court1.id).toBe('std1')
  })
})
