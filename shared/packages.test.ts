import { describe, expect, it } from 'vitest'
import {
  canCancelPackageBooking,
  isPackagesEnabled,
  PENDING_PACKAGE_BOOKING_EXPIRY_MINUTES,
} from './packages'

describe('isPackagesEnabled', () => {
  it('defaults off', () => {
    expect(isPackagesEnabled({ env: {} })).toBe(false)
  })

  it('enables via PACKAGES_ENABLED', () => {
    expect(isPackagesEnabled({ env: { PACKAGES_ENABLED: 'true' } })).toBe(true)
  })

  it('enables via NUXT_PUBLIC_PACKAGES_ENABLED', () => {
    expect(isPackagesEnabled({ env: { NUXT_PUBLIC_PACKAGES_ENABLED: 'true' } })).toBe(true)
  })

  it('respects explicit override', () => {
    expect(isPackagesEnabled({ enabled: true, env: {} })).toBe(true)
    expect(isPackagesEnabled({ enabled: false, env: { PACKAGES_ENABLED: 'true' } })).toBe(false)
  })
})

describe('canCancelPackageBooking', () => {
  it('allows when no start date', () => {
    expect(canCancelPackageBooking(null, null, 12)).toBe(true)
  })

  it('blocks when first session is inside the window', () => {
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const date = soon.toISOString().slice(0, 10)
    const time = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`
    expect(canCancelPackageBooking(date, time, 12)).toBe(false)
  })

  it('allows when first session is outside the window', () => {
    const later = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const date = later.toISOString().slice(0, 10)
    const time = `${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`
    expect(canCancelPackageBooking(date, time, 12)).toBe(true)
  })
})

describe('PENDING_PACKAGE_BOOKING_EXPIRY_MINUTES', () => {
  it('matches competitions-style 10 minute hold', () => {
    expect(PENDING_PACKAGE_BOOKING_EXPIRY_MINUTES).toBe(10)
  })
})
