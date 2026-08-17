import { describe, expect, it, beforeEach } from 'vitest'
import { getPaymentsMode, getPaymentsStatusSnapshot, resolvePaymentProvider, rialsToToman, tomanToRials } from './payments'

describe('tomanToRials', () => {
  it('converts app toman to SEP rials (×10)', () => {
    expect(tomanToRials(600_000)).toBe(6_000_000)
    expect(tomanToRials(50_000)).toBe(500_000)
    expect(tomanToRials(200_000.4)).toBe(2_000_000)
  })
})

describe('rialsToToman', () => {
  it('converts SEP rials to app toman (÷10)', () => {
    expect(rialsToToman(6_000_000)).toBe(600_000)
    expect(rialsToToman(650_000)).toBe(65_000)
    expect(rialsToToman(50_000)).toBe(5_000)
  })
})

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

  it('returns sep in test mode by default', () => {
    process.env.PAYMENTS_MODE = 'test'
    delete process.env.PAYMENT_PROVIDER
    expect(resolvePaymentProvider()).toBe('sep')
  })

  it('returns sep in live mode by default', () => {
    process.env.PAYMENTS_MODE = 'live'
    delete process.env.PAYMENT_PROVIDER
    expect(resolvePaymentProvider()).toBe('sep')
  })

  it('respects PAYMENT_PROVIDER=log in test mode', () => {
    process.env.PAYMENTS_MODE = 'test'
    process.env.PAYMENT_PROVIDER = 'log'
    expect(resolvePaymentProvider()).toBe('log')
  })

  it('respects PAYMENT_PROVIDER override in test mode', () => {
    process.env.PAYMENTS_MODE = 'test'
    process.env.PAYMENT_PROVIDER = 'sep'
    expect(resolvePaymentProvider()).toBe('sep')
  })

  it('honors explicit provider even when mode is pay_at_club', () => {
    process.env.PAYMENTS_MODE = 'pay_at_club'
    expect(resolvePaymentProvider('sep')).toBe('sep')
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

describe('getPaymentsStatusSnapshot', () => {
  const env = { ...process.env }

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.PAYMENTS_MODE
    delete process.env.PAYMENT_PROVIDER
    delete process.env.SEP_TERMINAL_ID
  })

  it('reports pay_at_club desk fallback without leaking secrets', () => {
    const snap = getPaymentsStatusSnapshot()
    expect(snap.paymentsMode).toBe('pay_at_club')
    expect(snap.onlineCheckoutEnabled).toBe(false)
    expect(snap.hasSepTerminalId).toBe(false)
    expect(snap.warningCodes).toContain('pay_at_club_fallback')
    expect(snap).not.toHaveProperty('SEP_TERMINAL_ID')
    expect(snap).not.toHaveProperty('terminalId')
  })

  it('reports test gateway when test mode has no terminal', () => {
    process.env.PAYMENTS_MODE = 'test'
    const snap = getPaymentsStatusSnapshot()
    expect(snap.usesTestGateway).toBe(true)
    expect(snap.liveReady).toBe(false)
    expect(snap.nextActionCodes).toContain('verify_then_live')
  })

  it('flags live without terminal', () => {
    process.env.PAYMENTS_MODE = 'live'
    const snap = getPaymentsStatusSnapshot()
    expect(snap.liveReady).toBe(false)
    expect(snap.warningCodes).toContain('live_without_terminal')
  })

  it('marks liveReady when live + terminal', () => {
    process.env.PAYMENTS_MODE = 'live'
    process.env.SEP_TERMINAL_ID = '12345678'
    const snap = getPaymentsStatusSnapshot()
    expect(snap.hasSepTerminalId).toBe(true)
    expect(snap.liveReady).toBe(true)
    expect(JSON.stringify(snap)).not.toContain('12345678')
  })
})
