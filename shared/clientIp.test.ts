import { describe, expect, it } from 'vitest'
import { resolveClientIpForRateLimit } from './clientIp.ts'

describe('resolveClientIpForRateLimit', () => {
  it('prefers platform headers over spoofable XFF left hops', () => {
    expect(resolveClientIpForRateLimit({
      platformIp: '203.0.113.9',
      xForwardedFor: '1.2.3.4, 203.0.113.9',
      fallback: '10.0.0.1',
    })).toBe('203.0.113.9')
  })

  it('uses the rightmost XFF hop when platform headers are absent', () => {
    expect(resolveClientIpForRateLimit({
      xForwardedFor: '1.2.3.4, 10.0.0.5',
      fallback: '127.0.0.1',
    })).toBe('10.0.0.5')
  })

  it('falls back to socket IP', () => {
    expect(resolveClientIpForRateLimit({ fallback: '127.0.0.1' })).toBe('127.0.0.1')
  })
})
