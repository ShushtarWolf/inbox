import { describe, expect, it } from 'vitest'
import {
  BOOKING_HORIZON_OPTIONS,
  clampBookingHorizonDays,
  isDateBeyondBookingHorizon,
  maxBookableIsoDate,
} from './bookingHorizon'

describe('clampBookingHorizonDays', () => {
  it('defaults and clamps', () => {
    expect(clampBookingHorizonDays(undefined)).toBe(14)
    expect(clampBookingHorizonDays(0)).toBe(1)
    expect(clampBookingHorizonDays(200)).toBe(90)
    expect(clampBookingHorizonDays(30)).toBe(30)
  })
})

describe('maxBookableIsoDate / isDateBeyondBookingHorizon', () => {
  it('treats horizon as inclusive calendar days from today', () => {
    expect(maxBookableIsoDate(1, '2026-10-29')).toBe('2026-10-29')
    expect(maxBookableIsoDate(14, '2026-10-29')).toBe('2026-11-11')
    expect(isDateBeyondBookingHorizon('2026-11-11', 14, '2026-10-29')).toBe(false)
    expect(isDateBeyondBookingHorizon('2026-11-12', 14, '2026-10-29')).toBe(true)
  })

  it('exposes owner setting chips', () => {
    expect(BOOKING_HORIZON_OPTIONS).toEqual([7, 14, 30, 60])
  })
})
