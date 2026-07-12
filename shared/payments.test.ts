import { describe, expect, it, beforeEach } from 'vitest'
import { getPaymentsMode, resolvePaymentProvider } from './payments'

describe('resolvePaymentProvider', () => {
  const env = { ...process.env }

  beforeEach(() => {
    process.env = { ...env }
  })

  it('returns pay_at_club in default mode', () => {
    delete process.env.PAYMENTS_MODE
    delete process.env.PAYMENT_PROVIDER
    expect(resolvePaymentProvider()).toBe('pay_at_club')
  })

  it('returns log in test mode', () => {
    process.env.PAYMENTS_MODE = 'test'
    expect(resolvePaymentProvider()).toBe('log')
  })

  it('returns zarinpal in live mode by default', () => {
    process.env.PAYMENTS_MODE = 'live'
    expect(resolvePaymentProvider()).toBe('zarinpal')
  })

  it('respects PAYMENT_PROVIDER override in test mode', () => {
    process.env.PAYMENTS_MODE = 'test'
    process.env.PAYMENT_PROVIDER = 'zarinpal'
    expect(resolvePaymentProvider()).toBe('zarinpal')
  })
})

describe('getPaymentsMode', () => {
  it('defaults to pay_at_club', () => {
    const prev = process.env.PAYMENTS_MODE
    delete process.env.PAYMENTS_MODE
    expect(getPaymentsMode()).toBe('pay_at_club')
    process.env.PAYMENTS_MODE = prev
  })
})
