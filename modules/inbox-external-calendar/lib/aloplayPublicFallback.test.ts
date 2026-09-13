import { afterEach, describe, expect, it, vi } from 'vitest'
import { needsAloPlaySession, resolveAloPlayCredentials } from './aloplaySession'

describe('AloPlay public today fallback policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('without credentials, today does not require session', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T12:00:00+03:30'))
    expect(resolveAloPlayCredentials({})).toBeNull()
    expect(needsAloPlaySession('2026-09-13', new Date('2026-09-13T12:00:00+03:30'), {})).toBe(false)
    vi.useRealTimers()
  })

  it('without credentials, future date requires session', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T12:00:00+03:30'))
    expect(needsAloPlaySession('2026-09-20', new Date('2026-09-13T12:00:00+03:30'), {})).toBe(true)
    vi.useRealTimers()
  })

  it('with credentials, session is always used', () => {
    expect(needsAloPlaySession(
      '2026-09-20',
      new Date('2026-09-13T12:00:00+03:30'),
      { ALOPLAY_MOBILE: '09121234567', ALOPLAY_PASSWORD: 'secret' },
    )).toBe(true)
  })
})
