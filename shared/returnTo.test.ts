import { describe, expect, it } from 'vitest'
import { sanitizeReturnTo, roleDashboardPath, resolvePostLoginPath } from './returnTo'

describe('sanitizeReturnTo', () => {
  it('accepts safe internal paths', () => {
    expect(sanitizeReturnTo('/athlete/bookings')).toBe('/athlete/bookings')
    expect(sanitizeReturnTo('/en/clubs')).toBe('/clubs')
  })

  it('rejects open redirects', () => {
    expect(sanitizeReturnTo('//evil.com')).toBeNull()
    expect(sanitizeReturnTo('https://evil.com')).toBeNull()
    expect(sanitizeReturnTo('http://evil.com/path')).toBeNull()
  })

  it('rejects non-string and empty values', () => {
    expect(sanitizeReturnTo(null)).toBeNull()
    expect(sanitizeReturnTo(undefined)).toBeNull()
    expect(sanitizeReturnTo('')).toBeNull()
    expect(sanitizeReturnTo(42)).toBeNull()
  })

  it('rejects login and register as return targets', () => {
    expect(sanitizeReturnTo('/login')).toBeNull()
    expect(sanitizeReturnTo('/register')).toBeNull()
    expect(sanitizeReturnTo('/en/login')).toBeNull()
  })

  it('normalizes locale prefix for en', () => {
    expect(sanitizeReturnTo('/athlete', 'en')).toBe('/en/athlete')
    expect(sanitizeReturnTo('/en/athlete', 'en')).toBe('/en/athlete')
  })
})

describe('roleDashboardPath', () => {
  it('returns role-specific dashboards', () => {
    expect(roleDashboardPath('CLUB_ADMIN')).toBe('/owner')
    expect(roleDashboardPath('COACH', 'en')).toBe('/en/coach')
    expect(roleDashboardPath('ATHLETE')).toBe('/athlete')
  })
})

describe('resolvePostLoginPath', () => {
  it('prefers sanitized returnTo over dashboard', () => {
    expect(resolvePostLoginPath('ATHLETE', 'fa', '/clubs')).toBe('/clubs')
  })

  it('falls back to dashboard when returnTo is invalid', () => {
    expect(resolvePostLoginPath('ATHLETE', 'fa', '//evil')).toBe('/athlete')
  })
})
