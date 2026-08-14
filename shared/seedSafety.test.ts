import { describe, expect, it } from 'vitest'
import { shouldRefuseProductionDemoSeed } from './seedSafety'

describe('shouldRefuseProductionDemoSeed', () => {
  it('refuses FORCE_SEED_RESET + SEED_DEMO_DATA in production', () => {
    expect(
      shouldRefuseProductionDemoSeed({
        NODE_ENV: 'production',
        FORCE_SEED_RESET: 'true',
        SEED_DEMO_DATA: 'true',
      }),
    ).toBe(true)
  })

  it('refuses either flag alone in production', () => {
    expect(
      shouldRefuseProductionDemoSeed({
        NODE_ENV: 'production',
        FORCE_SEED_RESET: 'true',
      }),
    ).toBe(true)
    expect(
      shouldRefuseProductionDemoSeed({
        NODE_ENV: 'production',
        SEED_DEMO_DATA: 'true',
      }),
    ).toBe(true)
  })

  it('allows catalog-only seed in production', () => {
    expect(shouldRefuseProductionDemoSeed({ NODE_ENV: 'production' })).toBe(false)
  })

  it('allows demo seed locally', () => {
    expect(
      shouldRefuseProductionDemoSeed({
        NODE_ENV: 'development',
        FORCE_SEED_RESET: 'true',
        SEED_DEMO_DATA: 'true',
      }),
    ).toBe(false)
  })
})
