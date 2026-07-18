import { afterEach, describe, expect, it } from 'vitest'
import { getSmsMode, isSmsEnabled, resolveSmsProvider, recipientStatusForSmsResult } from './sms'

const ENV_KEYS = ['SMS_PROVIDER', 'SMS_ENABLED', 'KAVENEGAR_API_KEY'] as const

function clearSmsEnv() {
  for (const key of ENV_KEYS) delete process.env[key]
}

describe('resolveSmsProvider', () => {
  afterEach(() => {
    clearSmsEnv()
  })

  it('defaults to log provider', () => {
    clearSmsEnv()
    expect(resolveSmsProvider()).toBe('log')
  })

  it('uses live when enabled with Kavenegar API key', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    expect(resolveSmsProvider()).toBe('live')
  })

  it('accepts SMS_PROVIDER=kavenegar as live', () => {
    process.env.SMS_PROVIDER = 'kavenegar'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    expect(resolveSmsProvider()).toBe('live')
  })

  it('fails closed to log when API key is missing', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.SMS_ENABLED = 'true'
    delete process.env.KAVENEGAR_API_KEY
    expect(resolveSmsProvider()).toBe('log')
  })

  it('fails closed to log when SMS_ENABLED is not true', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    delete process.env.SMS_ENABLED
    expect(resolveSmsProvider()).toBe('log')
  })
})

describe('getSmsMode', () => {
  afterEach(() => {
    clearSmsEnv()
  })

  it('returns log unless live configured', () => {
    clearSmsEnv()
    expect(getSmsMode()).toBe('log')
    process.env.SMS_PROVIDER = 'live'
    expect(getSmsMode()).toBe('live')
    process.env.SMS_PROVIDER = 'kavenegar'
    expect(getSmsMode()).toBe('live')
  })
})

describe('isSmsEnabled', () => {
  afterEach(() => {
    clearSmsEnv()
  })

  it('is enabled in log mode', () => {
    clearSmsEnv()
    expect(isSmsEnabled()).toBe(true)
  })
})

describe('recipientStatusForSmsResult', () => {
  it('maps sent/logged/queued honestly', () => {
    expect(recipientStatusForSmsResult({ sent: true, logged: true })).toBe('sent')
    expect(recipientStatusForSmsResult({ sent: false, logged: true })).toBe('logged')
    expect(recipientStatusForSmsResult({ sent: false, logged: false })).toBe('queued-for-gateway')
  })
})
