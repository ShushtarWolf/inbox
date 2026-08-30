import { describe, expect, it } from 'vitest'
import { computeCoachCourtCharge } from './coachCourt'

describe('computeCoachCourtCharge', () => {
  it('charges the full listed price', () => {
    expect(computeCoachCourtCharge({ courtPrice: 600000, startTime: '10:00' }))
      .toEqual({ listed: 600000, discountAmount: 0, charge: 600000 })
  })

  it('uses the peak time band rather than the base price', () => {
    const pricingJson = JSON.stringify({
      timeBands: [{ startTime: '18:00', endTime: '23:00', price: 900000 }],
    })
    const peak = computeCoachCourtCharge({ courtPrice: 600000, startTime: '19:00', pricingJson })
    expect(peak).toEqual({ listed: 900000, discountAmount: 0, charge: 900000 })

    const offPeak = computeCoachCourtCharge({ courtPrice: 600000, startTime: '10:00', pricingJson })
    expect(offPeak.listed).toBe(600000)
  })
})
