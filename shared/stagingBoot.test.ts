import { describe, expect, it } from 'vitest'
import { allowSeedOnEmpty } from './stagingBoot'

describe('allowSeedOnEmpty', () => {
  it('allows staging Liara when SEED_ON_EMPTY', () => {
    expect(
      allowSeedOnEmpty({ SEED_ON_EMPTY: 'true', NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'staging' }),
    ).toBe(true)
    expect(
      allowSeedOnEmpty({ SEED_ON_EMPTY: 'true', NODE_ENV: 'production', LIARA_APP_NAME: 'inbox-staging' }),
    ).toBe(true)
  })

  it('blocks production inbox', () => {
    expect(
      allowSeedOnEmpty({ SEED_ON_EMPTY: 'true', NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'production' }),
    ).toBe(false)
    expect(allowSeedOnEmpty({ SEED_ON_EMPTY: 'true', NODE_ENV: 'production' })).toBe(false)
  })

  it('is off unless SEED_ON_EMPTY', () => {
    expect(allowSeedOnEmpty({ NODE_ENV: 'development' })).toBe(false)
  })
})