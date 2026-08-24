import { describe, expect, it } from 'vitest'
import { computeCoachCourtCharge } from './coachCourt'

describe('computeCoachCourtCharge', () => {
  it('charges the full listed price when the club set no discount', () => {
    expect(computeCoachCourtCharge({ courtPrice: 600000, startTime: '10:00', discountPercent: 0 }))
      .toEqual({ listed: 600000, discountAmount: 0, charge: 600000 })
  })

  it('applies the club link discount', () => {
    expect(computeCoachCourtCharge({ courtPrice: 600000, startTime: '10:00', discountPercent: 30 }))
      .toEqual({ listed: 600000, discountAmount: 180000, charge: 420000 })
  })

  it('uses the peak time band rather than the base price', () => {
    const pricingJson = JSON.stringify({
      timeBands: [{ startTime: '18:00', endTime: '23:00', price: 900000 }],
    })
    const peak = computeCoachCourtCharge({ courtPrice: 600000, startTime: '19:00', pricingJson, discountPercent: 50 })
    expect(peak).toEqual({ listed: 900000, discountAmount: 450000, charge: 450000 })

    const offPeak = computeCoachCourtCharge({ courtPrice: 600000, startTime: '10:00', pricingJson, discountPercent: 50 })
    expect(offPeak.listed).toBe(600000)
  })

  it('never charges below zero and clamps absurd percents', () => {
    expect(computeCoachCourtCharge({ courtPrice: 500000, startTime: '10:00', discountPercent: 100 }).charge).toBe(0)
    expect(computeCoachCourtCharge({ courtPrice: 500000, startTime: '10:00', discountPercent: 999 }).charge).toBe(0)
    expect(computeCoachCourtCharge({ courtPrice: 500000, startTime: '10:00', discountPercent: -20 }).charge).toBe(500000)
  })
})
