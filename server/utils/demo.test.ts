import { afterEach, describe, expect, it } from 'vitest'
import { demoAuthAllowed, isDemoEmail, rejectDemoEmailInProduction } from './demo'

describe('isDemoEmail', () => {
  it('detects inbox.local demo addresses', () => {
    expect(isDemoEmail('athlete@inbox.local')).toBe(true)
    expect(isDemoEmail('owner@inbox.local')).toBe(true)
  })

  it('allows real user addresses', () => {
    expect(isDemoEmail('user@gmail.com')).toBe(false)
    expect(isDemoEmail('coach@club.com')).toBe(false)
  })
})

describe('rejectDemoEmailInProduction', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousAllow = process.env.ALLOW_DEMO_AUTH

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv
    if (previousAllow === undefined) delete process.env.ALLOW_DEMO_AUTH
    else process.env.ALLOW_DEMO_AUTH = previousAllow
  })

  it('blocks demo emails in production by default', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ALLOW_DEMO_AUTH
    expect(demoAuthAllowed()).toBe(false)
    expect(() => rejectDemoEmailInProduction('athlete@inbox.local')).toThrowError(/Demo accounts/)
  })

  it('allows demo emails in production when ALLOW_DEMO_AUTH=true', () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOW_DEMO_AUTH = 'true'
    expect(demoAuthAllowed()).toBe(true)
    expect(() => rejectDemoEmailInProduction('athlete@inbox.local')).not.toThrow()
  })
})
