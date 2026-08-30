import { describe, expect, it } from 'vitest'
import { permissionNeedsActiveClub, postLoginRedirectPath, toSessionUser } from './auth'

describe('postLoginRedirectPath', () => {
  it('uses sanitized returnTo for athlete', () => {
    expect(postLoginRedirectPath({ role: 'ATHLETE', locale: 'fa' }, 'fa', '/clubs')).toBe('/clubs')
  })

  it('rejects external returnTo', () => {
    expect(postLoginRedirectPath({ role: 'ATHLETE', locale: 'fa' }, 'fa', 'https://evil.com')).toBe('/athlete')
  })

  it('always uses FA-unprefixed dashboards (FA-only launch)', () => {
    expect(postLoginRedirectPath({ role: 'COACH', locale: 'en' }, 'en')).toBe('/coach')
    expect(postLoginRedirectPath({ role: 'CLUB_ADMIN', locale: 'fa' })).toBe('/owner')
  })
})

describe('permissionNeedsActiveClub', () => {
  it('allows settings (and unspecified) while club is inactive', () => {
    expect(permissionNeedsActiveClub()).toBe(false)
    expect(permissionNeedsActiveClub('settings')).toBe(false)
  })

  it('requires ACTIVE for desk and finance permissions', () => {
    expect(permissionNeedsActiveClub('calendar')).toBe(true)
    expect(permissionNeedsActiveClub('crm')).toBe(true)
    expect(permissionNeedsActiveClub('finance:view')).toBe(true)
  })
})

describe('toSessionUser', () => {
  it('includes avatarUrl so avatars survive a cold dashboard load', () => {
    expect(toSessionUser({
      id: 'u1',
      email: 'a@example.com',
      name: 'سیامک',
      role: 'ATHLETE',
      locale: 'fa',
      avatarUrl: 'https://cdn.example/a.webp',
    }).avatarUrl).toBe('https://cdn.example/a.webp')
    expect(toSessionUser({
      id: 'u1',
      email: 'a@example.com',
      name: 'سیامک',
      role: 'CLUB_ADMIN',
      secondaryRole: 'ATHLETE',
      tertiaryRole: 'COACH',
      locale: 'fa',
    }).tertiaryRole).toBe('COACH')
  })

  it('normalizes a missing avatar to null', () => {
    expect(toSessionUser({
      id: 'u1',
      email: 'a@example.com',
      name: 'سیامک',
      role: 'ATHLETE',
      locale: 'fa',
    }).avatarUrl).toBeNull()
  })
})
