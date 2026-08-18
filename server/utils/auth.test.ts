import { describe, expect, it } from 'vitest'
import { postLoginRedirectPath, toSessionUser } from './auth'

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
