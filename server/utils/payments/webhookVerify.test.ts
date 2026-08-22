import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { payAtClubProvider } from './providers/pay_at_club'
import { logPaymentProvider } from './providers/log'
import { sepProvider } from './providers/sep'

describe('payment provider verifyWebhook', () => {
  const env = { ...process.env }

  beforeEach(() => {
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = { ...env }
  })

  it('never accepts pay_at_club webhooks (desk mark-paid only)', () => {
    const provider = payAtClubProvider()
    expect(provider.verifyWebhook?.({})).toBe(false)
    expect(provider.verifyWebhook?.({ providerRef: 'x', status: 'paid' })).toBe(false)
  })

  it('never accepts SEP webhooks (browser callback + verifyTransaction only)', () => {
    const provider = sepProvider()
    expect(provider.verifyWebhook?.({})).toBe(false)
    expect(provider.verifyWebhook?.({ providerRef: 'x', status: 'paid' })).toBe(false)
  })

  it('allows log webhooks only outside live mode', () => {
    const provider = logPaymentProvider()
    process.env.PAYMENTS_MODE = 'test'
    expect(provider.verifyWebhook?.({})).toBe(true)
    process.env.PAYMENTS_MODE = 'pay_at_club'
    expect(provider.verifyWebhook?.({})).toBe(true)
    process.env.PAYMENTS_MODE = 'live'
    expect(provider.verifyWebhook?.({})).toBe(false)
  })
})
