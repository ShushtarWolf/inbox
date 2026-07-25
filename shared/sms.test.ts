import { afterEach, describe, expect, it } from 'vitest'
import {
  getSmsMode,
  getSmsStatusSnapshot,
  isSmsEnabled,
  resolveSmsProvider,
  resolveSmsPhase,
  recipientStatusForSmsResult,
} from './sms'

const ENV_KEYS = [
  'SMS_PROVIDER',
  'SMS_ENABLED',
  'KAVENEGAR_API_KEY',
  'KAVENEGAR_TEMPLATE',
  'KAVENEGAR_SENDER',
  'AUTH_OTP_BYPASS_PHONES',
  'NODE_ENV',
] as const

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

  it('uses live when enabled with API key and sender', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    process.env.KAVENEGAR_SENDER = '1000xxxx'
    expect(resolveSmsProvider()).toBe('live')
  })

  it('accepts SMS_PROVIDER=kavenegar as live with template', () => {
    process.env.SMS_PROVIDER = 'kavenegar'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    process.env.KAVENEGAR_TEMPLATE = 'inbox-verify'
    expect(resolveSmsProvider()).toBe('live')
  })

  it('stays log in non-prod when live key is set but sender/template missing', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    process.env.NODE_ENV = 'development'
    expect(resolveSmsProvider()).toBe('log')
  })

  it('uses live in production even without sender/template (ops must set them)', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    process.env.NODE_ENV = 'production'
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
    process.env.KAVENEGAR_SENDER = '1000xxxx'
    delete process.env.SMS_ENABLED
    expect(resolveSmsProvider()).toBe('log')
  })
})

describe('resolveSmsPhase', () => {
  afterEach(() => {
    clearSmsEnv()
  })

  it('is SINGLE in default log mode', () => {
    clearSmsEnv()
    expect(resolveSmsPhase()).toBe('SINGLE')
  })

  it('is MULTI when live + key + template', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    process.env.KAVENEGAR_TEMPLATE = 'inbox-verify'
    expect(resolveSmsPhase()).toBe('MULTI')
  })

  it('is MULTI when live + key + sender', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    process.env.KAVENEGAR_SENDER = '1000xxxx'
    expect(resolveSmsPhase()).toBe('MULTI')
  })

  it('stays SINGLE in production live without template/sender', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    process.env.NODE_ENV = 'production'
    expect(resolveSmsProvider()).toBe('live')
    expect(resolveSmsPhase()).toBe('SINGLE')
  })
})

describe('getSmsStatusSnapshot', () => {
  afterEach(() => {
    clearSmsEnv()
  })

  it('reports SINGLE + nextActions in log mode without secrets', () => {
    clearSmsEnv()
    const snap = getSmsStatusSnapshot()
    expect(snap.smsPhase).toBe('SINGLE')
    expect(snap.multiReady).toBe(false)
    expect(snap.hasOtpBypassConfigured).toBe(false)
    expect(snap.nextActions.length).toBeGreaterThan(0)
    expect(snap.warnings.some((w) => w.includes('SINGLE'))).toBe(true)
    expect(JSON.stringify(snap)).not.toMatch(/test-key|0912/)
  })

  it('reports MULTI when fully ready', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    process.env.KAVENEGAR_TEMPLATE = 'inbox-verify'
    const snap = getSmsStatusSnapshot()
    expect(snap.smsPhase).toBe('MULTI')
    expect(snap.multiReady).toBe(true)
    expect(snap.multiReadyChecks).toEqual({
      liveProvider: true,
      smsEnabled: true,
      hasApiKey: true,
      hasTemplateOrSender: true,
    })
    expect(snap.note).toContain('MULTI')
  })

  it('flags OTP bypass without returning MSISDNs', () => {
    clearSmsEnv()
    process.env.AUTH_OTP_BYPASS_PHONES = '09121234567,09129876543'
    const snap = getSmsStatusSnapshot()
    expect(snap.hasOtpBypassConfigured).toBe(true)
    expect(JSON.stringify(snap)).not.toContain('0912')
    expect(snap.warnings.some((w) => w.includes('AUTH_OTP_BYPASS_PHONES'))).toBe(true)
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
