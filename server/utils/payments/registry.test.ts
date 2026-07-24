import { describe, expect, it, beforeEach } from 'vitest'
import { resolvePaymentProvider } from '#shared/payments.ts'
import { getRegisteredPaymentProvider, listPaymentProviders } from './registry'
import { payAtClubProvider } from './providers/pay_at_club'
import { logPaymentProvider } from './providers/log'
import { sepProvider } from './providers/sep'

describe('payment registry', () => {
  beforeEach(() => {
    payAtClubProvider()
    logPaymentProvider()
    sepProvider()
  })

  it('registers built-in providers', () => {
    const names = listPaymentProviders()
    expect(names).toContain('pay_at_club')
    expect(names).toContain('log')
    expect(names).toContain('sep')
  })

  it('resolves pay_at_club in default mode', () => {
    delete process.env.PAYMENTS_MODE
    const name = resolvePaymentProvider()
    expect(getRegisteredPaymentProvider(name)?.name).toBe('pay_at_club')
  })
})
