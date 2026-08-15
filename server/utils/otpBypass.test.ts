import { afterEach, describe, expect, it } from 'vitest'
import { isOtpBypassAllowed, isOtpBypassPhone } from './otpBypass'

const ENV_KEYS = ['AUTH_OTP_BYPASS_PHONES', 'ALLOW_OTP_BYPASS', 'NODE_ENV'] as const
const saved: Record<string, string | undefined> = {}

function snapshotEnv() {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
}

describe('otpBypass production gate', () => {
  snapshotEnv()
  afterEach(() => {
    restoreEnv()
  })

  it('honors AUTH_OTP_BYPASS_PHONES outside production', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.ALLOW_OTP_BYPASS
    process.env.AUTH_OTP_BYPASS_PHONES = '09121234567'
    expect(isOtpBypassAllowed()).toBe(true)
    expect(isOtpBypassPhone('09121234567')).toBe(true)
  })

  it('ignores bypass in production unless ALLOW_OTP_BYPASS=true', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ALLOW_OTP_BYPASS
    process.env.AUTH_OTP_BYPASS_PHONES = '09121234567'
    expect(isOtpBypassAllowed()).toBe(false)
    expect(isOtpBypassPhone('09121234567')).toBe(false)
  })

  it('allows bypass in production only with ALLOW_OTP_BYPASS=true', () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOW_OTP_BYPASS = 'true'
    process.env.AUTH_OTP_BYPASS_PHONES = '09121234567'
    expect(isOtpBypassAllowed()).toBe(true)
    expect(isOtpBypassPhone('09121234567')).toBe(true)
  })

  it('refuses production bypass when ALLOW_OTP_BYPASS is not the string true', () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOW_OTP_BYPASS = 'false'
    process.env.AUTH_OTP_BYPASS_PHONES = '09121234567'
    expect(isOtpBypassAllowed()).toBe(false)
    expect(isOtpBypassPhone('09121234567')).toBe(false)
  })
})
