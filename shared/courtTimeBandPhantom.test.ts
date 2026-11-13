import { describe, expect, it } from 'vitest'
import {
  computeBookingPrice,
  computeListedSlotPrice,
  nextTimeBand,
  normalizeCourtPricingForSave,
  parseCourtPricingJson,
  samePricingJson,
  summarizeCourtPricing,
} from './courtPricing'
import { buildBulkCourtPatch } from './courtBulk'
import { buildHourlyOptions } from './courtFacilities'

// Live IUST «زمین ۳ غیر استاندارد» payload (public /api/clubs/iust-tennis, 2026-11-12).
const IUST_COURT3 = JSON.stringify({
  timeBands: [{ labelFa: '', labelEn: '', startTime: '20:00', endTime: '23:00', price: 480000 }],
  lastSecondDiscount: { enabled: true, hoursBefore: 2, percent: 15 },
})

describe('IUST court 3 price reproduction', () => {
  it('band 480,000 overrides the 5,000 base and last-minute 15% gives 408,000', () => {
    expect(computeListedSlotPrice(5000, '19:00', IUST_COURT3)).toBe(5000)
    const listed = computeListedSlotPrice(5000, '21:00', IUST_COURT3)
    expect(listed).toBe(480000)
    const now = new Date('2026-11-12T20:30:00+03:30')
    expect(computeBookingPrice(listed, IUST_COURT3, '2026-11-12', '21:00', now)).toBe(408000)
  })
})

describe('nextTimeBand (only used by the explicit add button)', () => {
  const starts = buildHourlyOptions(7, 23)
  const ends = buildHourlyOptions(7, 23, 60, true)

  it('first band defaults to opening hours + 2h at the base price, never 20–23', () => {
    expect(nextTimeBand([], starts, ends, 480000)).toEqual({
      labelFa: '', labelEn: '', startTime: '07:00', endTime: '09:00', price: 480000,
    })
  })

  it('next band continues from the previous band end', () => {
    const first = nextTimeBand([], starts, ends, 1)
    const second = nextTimeBand([first], starts, ends, 1)
    expect(second.startTime).toBe('09:00')
    expect(second.endTime).toBe('11:00')
  })
})

describe('normalizeCourtPricingForSave', () => {
  it('drops a band left at the base price (would silently keep the old price later)', () => {
    const json = JSON.stringify({ timeBands: [{ startTime: '20:00', endTime: '23:00', price: 480000 }] })
    expect(normalizeCourtPricingForSave(480000, json)).toBeNull()
  })

  it('keeps bands the owner priced differently, and keeps existing IUST band untouched', () => {
    expect(parseCourtPricingJson(normalizeCourtPricingForSave(5000, IUST_COURT3))).toEqual(parseCourtPricingJson(IUST_COURT3))
  })

  it('drops inverted / empty ranges', () => {
    const json = JSON.stringify({ timeBands: [{ startTime: '22:00', endTime: '20:00', price: 1 }] })
    expect(normalizeCourtPricingForSave(5000, json)).toBeNull()
  })

  it('never invents a band from empty input', () => {
    expect(normalizeCourtPricingForSave(600000, null)).toBeNull()
    expect(normalizeCourtPricingForSave(600000, '')).toBeNull()
    expect(normalizeCourtPricingForSave(600000, '{"timeBands":[]}')).toBeNull()
  })
})

describe('samePricingJson', () => {
  it('treats null, empty config and disabled discount as equal', () => {
    expect(samePricingJson(null, '{"timeBands":[],"lastSecondDiscount":{"enabled":false,"hoursBefore":2,"percent":15}}')).toBe(true)
  })
  it('detects a band change', () => {
    expect(samePricingJson(null, IUST_COURT3)).toBe(false)
  })
})

describe('summarizeCourtPricing (settings court list)', () => {
  it('exposes bands and last-minute discount so owners can see them', () => {
    expect(summarizeCourtPricing(IUST_COURT3)).toEqual({
      bands: [{ startTime: '20:00', endTime: '23:00', price: 480000 }],
      lastSecondDiscount: { hoursBefore: 2, percent: 15 },
    })
  })
  it('is empty for base-price-only courts', () => {
    expect(summarizeCourtPricing(null)).toEqual({ bands: [], lastSecondDiscount: null })
  })
})

describe('buildBulkCourtPatch («ویرایش همه»)', () => {
  const initial = { price: 600000, sportSlug: 'tennis', openHour: null, closeHour: null, audience: 'MIXED' }

  it('sends nothing when the owner changed nothing — no base price or bands copied from court 1', () => {
    expect(buildBulkCourtPatch({ initial, current: { ...initial }, applyPricingToAll: false, pricingJson: IUST_COURT3 })).toEqual({})
  })

  it('sends only the changed field', () => {
    expect(buildBulkCourtPatch({
      initial,
      current: { ...initial, audience: 'WOMEN' },
      applyPricingToAll: false,
      pricingJson: null,
    })).toEqual({ audience: 'WOMEN' })
  })

  it('sends pricingJson only on explicit opt-in', () => {
    expect(buildBulkCourtPatch({ initial, current: { ...initial }, applyPricingToAll: true, pricingJson: null }))
      .toEqual({ pricingJson: null })
  })

  it('sends both hours together when either changes', () => {
    expect(buildBulkCourtPatch({
      initial,
      current: { ...initial, openHour: 8, closeHour: 22 },
      applyPricingToAll: false,
      pricingJson: null,
    })).toEqual({ openHour: 8, closeHour: 22 })
  })
})
