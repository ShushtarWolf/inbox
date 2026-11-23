import { describe, expect, it } from 'vitest'
import { allowSeedOnEmpty, isStagingLiaraEnvironment, stagingPhoneLoginEnabled } from './stagingBoot'

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

describe('isStagingLiaraEnvironment', () => {
  it('is true only with staging markers', () => {
    expect(isStagingLiaraEnvironment({ NODE_ENV: 'production' })).toBe(false)
    expect(isStagingLiaraEnvironment({ SENTRY_ENVIRONMENT: 'staging' })).toBe(true)
    expect(isStagingLiaraEnvironment({ LIARA_APP_NAME: 'inbox-staging' })).toBe(true)
    expect(isStagingLiaraEnvironment({ INBOX_ENV: 'staging' })).toBe(true)
  })
})

describe('stagingPhoneLoginEnabled', () => {
  it('matches staging Liara markers and is false on production inbox', () => {
    expect(stagingPhoneLoginEnabled({ NODE_ENV: 'production' })).toBe(false)
    expect(
      stagingPhoneLoginEnabled({ NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'production' }),
    ).toBe(false)
    expect(
      stagingPhoneLoginEnabled({ NODE_ENV: 'production', LIARA_APP_NAME: 'inbox-staging' }),
    ).toBe(true)
  })
})