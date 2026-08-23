import { describe, expect, it } from 'vitest'
import {
  calculateSessionTotal,
  equipmentLineTotal,
  equipmentPriceAtBooking,
  parseEquipmentSelections,
  sumEquipmentPrices,
} from './bookingTotal'

describe('equipmentPriceAtBooking', () => {
  it('charges zero for club-provided equipment', () => {
    expect(equipmentPriceAtBooking({ id: '1', price: 50000, category: 'CLUB' })).toBe(0)
  })

  it('charges listed price for rentable equipment', () => {
    expect(equipmentPriceAtBooking({ id: '2', price: 80000, category: 'RENTAL' })).toBe(80000)
  })

  it('charges listed price for sellable equipment', () => {
    expect(equipmentPriceAtBooking({ id: '3', price: 500000, category: 'SELL' })).toBe(500000)
  })
})

describe('sumEquipmentPrices', () => {
  it('sums equipment with club items free', () => {
    const total = sumEquipmentPrices([
      { id: '1', price: 50000, category: 'CLUB', quantity: 1 },
      { id: '2', price: 30000, category: 'RENTAL', quantity: 1 },
    ])
    expect(total).toBe(30000)
  })

  it('multiplies unit price by quantity', () => {
    expect(equipmentLineTotal({ id: '2', price: 50000, category: 'RENTAL', quantity: 3 })).toBe(150000)
    expect(sumEquipmentPrices([
      { id: '2', price: 50000, category: 'RENTAL', quantity: 3 },
    ])).toBe(150000)
  })
})

describe('parseEquipmentSelections', () => {
  it('defaults missing quantities to 1', () => {
    expect(parseEquipmentSelections(['a', 'b'])).toEqual([
      { id: 'a', quantity: 1 },
      { id: 'b', quantity: 1 },
    ])
  })

  it('applies quantity map and dedupes ids', () => {
    expect(parseEquipmentSelections(['a', 'a', 'b'], { a: 2, b: 4 })).toEqual([
      { id: 'a', quantity: 2 },
      { id: 'b', quantity: 4 },
    ])
  })
})

describe('calculateSessionTotal', () => {
  it('sums court, equipment, and coach prices', () => {
    expect(calculateSessionTotal({
      courtPrice: 400000,
      equipmentPrices: [0, 50000],
      coachPrice: 200000,
    })).toBe(650000)
  })

  it('defaults optional prices to zero', () => {
    expect(calculateSessionTotal({ courtPrice: 100000 })).toBe(100000)
  })
})
