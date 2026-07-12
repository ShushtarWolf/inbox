import { describe, expect, it } from 'vitest'
import { postLoginRedirectPath } from './auth'

describe('postLoginRedirectPath', () => {
  it('uses sanitized returnTo for athlete', () => {
    expect(postLoginRedirectPath({ role: 'ATHLETE', locale: 'fa' }, 'fa', '/clubs')).toBe('/clubs')
  })

  it('rejects external returnTo', () => {
    expect(postLoginRedirectPath({ role: 'ATHLETE', locale: 'fa' }, 'fa', 'https://evil.com')).toBe('/athlete')
  })

  it('localizes dashboard for en locale', () => {
    expect(postLoginRedirectPath({ role: 'COACH', locale: 'en' }, 'en')).toBe('/en/coach')
    expect(postLoginRedirectPath({ role: 'CLUB_ADMIN', locale: 'fa' })).toBe('/owner')
  })
})
