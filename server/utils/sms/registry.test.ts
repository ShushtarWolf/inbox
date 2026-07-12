import { describe, expect, it, beforeEach } from 'vitest'
import { resolveSmsProvider } from '#shared/sms.ts'
import { getRegisteredSmsProvider } from './registry'
import { logSmsProvider } from './providers/log'

describe('sms registry', () => {
  beforeEach(() => {
    logSmsProvider()
  })

  it('registers log provider', () => {
    expect(getRegisteredSmsProvider('log')?.name).toBe('log')
  })

  it('resolves log by default', () => {
    delete process.env.SMS_PROVIDER
    expect(resolveSmsProvider()).toBe('log')
  })
})
