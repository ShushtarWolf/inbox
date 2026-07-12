import { describe, expect, it } from 'vitest'
import {
  applyPercentDiscount,
  computeBookingPrice,
  computeListedSlotPrice,
  hoursUntilSlot,
  isTimeInRange,
  parseCourtPricingJson,
  serializeCourtPricingJson,
} from './courtPricing'

describe('parseCourtPricingJson', () => {
  it('returns empty config for invalid input', () => {
    expect(parseCourtPricingJson(null)).toEqual({})
    expect(parseCourtPricingJson('not-json')).toEqual({})
  })

  it('parses time bands and discounts', () => {
    const config = parseCourtPricingJson(JSON.stringify({
      timeBands: [{ startTime: '08:00', endTime: '12:00', price: 500000 }],
      lastSecondDiscount: { enabled: true, hoursBefore: 3, percent: 20 },
      offPeakDiscount: { enabled: true, startTime: '08:00', endTime: '14:00', percent: 10 },
    }))
    expect(config.timeBands).toHaveLength(1)
    expect(config.lastSecondDiscount?.hoursBefore).toBe(3)
    expect(config.offPeakDiscount?.percent).toBe(10)
  })
})

describe('computeListedSlotPrice', () => {
  const pricingJson = JSON.stringify({
    timeBands: [
      { startTime: '08:00', endTime: '12:00', price: 500000 },
      { startTime: '17:00', endTime: '22:00', price: 800000 },
    ],
    offPeakDiscount: { enabled: true, startTime: '08:00', endTime: '14:00', percent: 10 },
  })

  it('uses base price outside bands', () => {
    expect(computeListedSlotPrice(600000, '14:00', pricingJson)).toBe(600000)
  })

  it('uses band price inside a time band', () => {
    const bandsOnly = JSON.stringify({
      timeBands: [
        { startTime: '08:00', endTime: '12:00', price: 500000 },
        { startTime: '17:00', endTime: '22:00', price: 800000 },
      ],
    })
    expect(computeListedSlotPrice(600000, '09:00', bandsOnly)).toBe(500000)
    expect(computeListedSlotPrice(600000, '18:00', bandsOnly)).toBe(800000)
  })

  it('applies off-peak discount after band price', () => {
    expect(computeListedSlotPrice(600000, '09:00', pricingJson)).toBe(450000)
  })
})

describe('computeBookingPrice', () => {
  const pricingJson = JSON.stringify({
    lastSecondDiscount: { enabled: true, hoursBefore: 2, percent: 25 },
  })

  it('applies last-second discount when within window', () => {
    const slotDate = '2026-07-12'
    const startTime = '20:00'
    const now = new Date('2026-07-12T19:00:00')
    expect(computeBookingPrice(400000, pricingJson, slotDate, startTime, now)).toBe(300000)
  })

  it('keeps listed price when outside window', () => {
    const slotDate = '2026-07-12'
    const startTime = '20:00'
    const now = new Date('2026-07-12T10:00:00')
    expect(computeBookingPrice(400000, pricingJson, slotDate, startTime, now)).toBe(400000)
  })
})

describe('helpers', () => {
  it('checks time ranges', () => {
    expect(isTimeInRange('09:30', '09:00', '10:00')).toBe(true)
    expect(isTimeInRange('10:00', '09:00', '10:00')).toBe(false)
  })

  it('applies percent discount', () => {
    expect(applyPercentDiscount(100000, 15)).toBe(85000)
  })

  it('serializes empty config to null', () => {
    expect(serializeCourtPricingJson({})).toBeNull()
  })

  it('computes hours until slot', () => {
    expect(hoursUntilSlot('2026-07-12', '18:00', new Date('2026-07-12T16:00:00'))).toBe(2)
  })
})
