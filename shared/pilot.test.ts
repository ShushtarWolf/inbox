import { describe, expect, it, afterEach } from 'vitest'
import { isPilotNoCoach } from './pilot'

describe('isPilotNoCoach', () => {
  const originalPublic = process.env.NUXT_PUBLIC_PILOT_NO_COACH
  const originalServer = process.env.PILOT_NO_COACH

  afterEach(() => {
    if (originalPublic === undefined) delete process.env.NUXT_PUBLIC_PILOT_NO_COACH
    else process.env.NUXT_PUBLIC_PILOT_NO_COACH = originalPublic
    if (originalServer === undefined) delete process.env.PILOT_NO_COACH
    else process.env.PILOT_NO_COACH = originalServer
  })

  it('is false when both flags unset', () => {
    delete process.env.NUXT_PUBLIC_PILOT_NO_COACH
    delete process.env.PILOT_NO_COACH
    expect(isPilotNoCoach()).toBe(false)
  })

  it('is true for server-only PILOT_NO_COACH', () => {
    delete process.env.NUXT_PUBLIC_PILOT_NO_COACH
    process.env.PILOT_NO_COACH = 'true'
    expect(isPilotNoCoach()).toBe(true)
  })

  it('is true for NUXT_PUBLIC_PILOT_NO_COACH', () => {
    delete process.env.PILOT_NO_COACH
    process.env.NUXT_PUBLIC_PILOT_NO_COACH = 'true'
    expect(isPilotNoCoach()).toBe(true)
  })
})
