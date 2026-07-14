import { describe, expect, it } from 'vitest'
import { isDemoEmail } from './demo'

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
