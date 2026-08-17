import { describe, expect, it } from 'vitest'
import { sanitizeReturnTo, roleDashboardPath, resolvePostLoginPath, isAuthProtectedPath, buildReturnTo } from './returnTo'

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

  it('strips legacy en prefix for FA-only launch', () => {
    expect(sanitizeReturnTo('/athlete', 'en')).toBe('/athlete')
    expect(sanitizeReturnTo('/en/athlete', 'en')).toBe('/athlete')
    expect(sanitizeReturnTo('/en/athlete', 'fa')).toBe('/athlete')
  })
})

describe('roleDashboardPath', () => {
  it('returns role-specific dashboards without en prefix', () => {
    expect(roleDashboardPath('CLUB_ADMIN')).toBe('/owner')
    expect(roleDashboardPath('COACH', 'en')).toBe('/coach')
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

describe('isAuthProtectedPath', () => {
  it('marks dashboards protected and public catalog free', () => {
    expect(isAuthProtectedPath('/athlete')).toBe(true)
    expect(isAuthProtectedPath('/owner/calendar')).toBe(true)
    expect(isAuthProtectedPath('/clubs/padel-zone-tehran')).toBe(false)
    expect(isAuthProtectedPath('/')).toBe(false)
    expect(isAuthProtectedPath('/book/court/x')).toBe(false)
  })
})

describe('buildReturnTo', () => {
  it('keeps multi-court and multi-slot query for auth handoff', () => {
    expect(buildReturnTo('/clubs/iust-tennis', {
      date: '2026-08-17',
      court: 'c4,c6',
      slots: 's1,s2',
    })).toBe('/clubs/iust-tennis?date=2026-08-17&court=c4%2Cc6&slots=s1%2Cs2')
  })
})
