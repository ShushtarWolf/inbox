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

  it('returns zarinpal in test mode by default', () => {
    process.env.PAYMENTS_MODE = 'test'
    delete process.env.PAYMENT_PROVIDER
    expect(resolvePaymentProvider()).toBe('zarinpal')
  })

  it('returns zarinpal in live mode by default', () => {
    process.env.PAYMENTS_MODE = 'live'
    delete process.env.PAYMENT_PROVIDER
    expect(resolvePaymentProvider()).toBe('zarinpal')
  })

  it('respects PAYMENT_PROVIDER=log in test mode', () => {
    process.env.PAYMENTS_MODE = 'test'
    process.env.PAYMENT_PROVIDER = 'log'
    expect(resolvePaymentProvider()).toBe('log')
  })

  it('respects PAYMENT_PROVIDER override in test mode', () => {
    process.env.PAYMENTS_MODE = 'test'
    process.env.PAYMENT_PROVIDER = 'zarinpal'
    expect(resolvePaymentProvider()).toBe('zarinpal')
  })

  it('honors explicit provider even when mode is pay_at_club', () => {
    process.env.PAYMENTS_MODE = 'pay_at_club'
    expect(resolvePaymentProvider('zarinpal')).toBe('zarinpal')
    expect(resolvePaymentProvider('log')).toBe('log')
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
