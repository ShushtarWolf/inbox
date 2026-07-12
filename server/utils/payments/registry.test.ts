import { describe, expect, it, beforeEach } from 'vitest'
import { resolvePaymentProvider } from '#shared/payments.ts'
import { getRegisteredPaymentProvider, listPaymentProviders, registerPaymentProvider } from './registry'
import { payAtClubProvider } from './providers/pay_at_club'
import { logPaymentProvider } from './providers/log'
import { zarinpalProvider } from './providers/zarinpal'

describe('payment registry', () => {
  beforeEach(() => {
    payAtClubProvider()
    logPaymentProvider()
    zarinpalProvider()
  })

  it('registers all stub providers', () => {
    const names = listPaymentProviders()
    expect(names).toContain('pay_at_club')
    expect(names).toContain('log')
    expect(names).toContain('zarinpal')
  })

  it('resolves pay_at_club in default mode', () => {
    delete process.env.PAYMENTS_MODE
    const name = resolvePaymentProvider()
    expect(getRegisteredPaymentProvider(name)?.name).toBe('pay_at_club')
  })
})
