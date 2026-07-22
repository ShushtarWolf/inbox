import { describe, expect, it, beforeEach } from 'vitest'
import { resolveSmsProvider } from '#shared/sms.ts'
import { getRegisteredSmsProvider } from './registry'
import { logSmsProvider } from './providers/log'
import { kavenegarSmsProvider } from './providers/kavenegar'

describe('sms registry', () => {
  beforeEach(() => {
    logSmsProvider()
    kavenegarSmsProvider()
  })

  it('registers log and live providers', () => {
    expect(getRegisteredSmsProvider('log')?.name).toBe('log')
    expect(getRegisteredSmsProvider('live')?.name).toBe('live')
  })

  it('resolves log by default', () => {
    delete process.env.SMS_PROVIDER
    delete process.env.SMS_ENABLED
    delete process.env.KAVENEGAR_API_KEY
    expect(resolveSmsProvider()).toBe('log')
  })

  it('resolves live when fully configured', () => {
    process.env.SMS_PROVIDER = 'live'
    process.env.SMS_ENABLED = 'true'
    process.env.KAVENEGAR_API_KEY = 'test-key'
    process.env.KAVENEGAR_SENDER = '1000xxxx'
    expect(resolveSmsProvider()).toBe('live')
    delete process.env.SMS_PROVIDER
    delete process.env.SMS_ENABLED
    delete process.env.KAVENEGAR_API_KEY
    delete process.env.KAVENEGAR_SENDER
  })
})
