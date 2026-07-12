import { describe, expect, it } from 'vitest'
import { getSmsMode, isSmsEnabled, resolveSmsProvider } from './sms'

describe('resolveSmsProvider', () => {
  it('defaults to log provider', () => {
    delete process.env.SMS_PROVIDER
    expect(resolveSmsProvider()).toBe('log')
  })
})

describe('getSmsMode', () => {
  it('returns log unless live configured', () => {
    delete process.env.SMS_PROVIDER
    expect(getSmsMode()).toBe('log')
    process.env.SMS_PROVIDER = 'live'
    expect(getSmsMode()).toBe('live')
    delete process.env.SMS_PROVIDER
  })
})

describe('isSmsEnabled', () => {
  it('is enabled in log mode', () => {
    delete process.env.SMS_ENABLED
    delete process.env.SMS_PROVIDER
    expect(isSmsEnabled()).toBe(true)
  })
})
