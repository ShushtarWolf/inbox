import { describe, expect, it } from 'vitest'
import {
  calculateSessionTotal,
  equipmentPriceAtBooking,
  sumEquipmentPrices,
} from './bookingTotal'

describe('equipmentPriceAtBooking', () => {
  it('charges zero for club-provided equipment', () => {
    expect(equipmentPriceAtBooking({ id: '1', price: 50000, category: 'CLUB' })).toBe(0)
  })

  it('charges listed price for rentable equipment', () => {
    expect(equipmentPriceAtBooking({ id: '2', price: 80000, category: 'RENTAL' })).toBe(80000)
  })
})

describe('sumEquipmentPrices', () => {
  it('sums equipment with club items free', () => {
    const total = sumEquipmentPrices([
      { id: '1', price: 50000, category: 'CLUB' },
      { id: '2', price: 30000, category: 'RENTAL' },
    ])
    expect(total).toBe(30000)
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
