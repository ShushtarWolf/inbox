import { describe, expect, it } from 'vitest'
import { postLoginRedirectPath } from './auth'

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
