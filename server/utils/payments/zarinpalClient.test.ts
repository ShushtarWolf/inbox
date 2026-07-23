import { describe, expect, it, vi } from 'vitest'
import {
  isZarinpalRequestSuccess,
  isZarinpalSimulatedAuthority,
  isZarinpalVerifySuccess,
  zarinpalApiBase,
  zarinpalRefundPayment,
  zarinpalRequestPayment,
  zarinpalStartPayUrl,
  zarinpalVerifyPayment,
} from './zarinpalClient'

describe('zarinpalClient', () => {
  it('maps sandbox vs live API hosts', () => {
    expect(zarinpalApiBase('sandbox')).toContain('sandbox.zarinpal.com')
    expect(zarinpalApiBase('live')).toContain('payment.zarinpal.com')
    expect(zarinpalStartPayUrl('A123', 'sandbox')).toBe('https://sandbox.zarinpal.com/pg/StartPay/A123')
    expect(zarinpalStartPayUrl('A123', 'live')).toBe('https://www.zarinpal.com/pg/StartPay/A123')
  })

  it('treats verify codes 100 and 101 as success (idempotent)', () => {
    expect(isZarinpalVerifySuccess(100)).toBe(true)
    expect(isZarinpalVerifySuccess(101)).toBe(true)
    expect(isZarinpalVerifySuccess( -22)).toBe(false)
    expect(isZarinpalRequestSuccess(100)).toBe(true)
    expect(isZarinpalRequestSuccess(101)).toBe(false)
  })

  it('detects simulated authorities without calling the network', () => {
    expect(isZarinpalSimulatedAuthority('SIMabc')).toBe(true)
    expect(isZarinpalSimulatedAuthority('zarinpal-test-deadbeef')).toBe(true)
    expect(isZarinpalSimulatedAuthority('A000000000000000000000000000000000000')).toBe(false)
  })

  it('requestPayment parses authority from envelope', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: { code: 100, authority: 'A00000000000000000000000000000123456', message: 'Success' },
      errors: [],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await zarinpalRequestPayment('sandbox', {
      merchantId: '00000000-0000-0000-0000-000000000000',
      amount: 100_000,
      callbackUrl: 'http://localhost:3000/payments/callback/zarinpal',
      description: 'test',
    }, fetchImpl)

    expect(result.authority).toBe('A00000000000000000000000000000123456')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('verifyPayment returns code for idempotent re-verify', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: { code: 101, ref_id: 12345, message: 'Verified' },
      errors: [],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await zarinpalVerifyPayment('sandbox', {
      merchantId: '00000000-0000-0000-0000-000000000000',
      amount: 100_000,
      authority: 'A00000000000000000000000000000123456',
    }, fetchImpl)

    expect(result.code).toBe(101)
    expect(isZarinpalVerifySuccess(result.code)).toBe(true)
  })

  it('refundPayment requires success code 100', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: { code: -1, message: 'denied' },
      errors: { message: 'denied' },
    }), { status: 200 })) as unknown as typeof fetch

    await expect(zarinpalRefundPayment('live', {
      merchantId: '00000000-0000-0000-0000-000000000000',
      authority: 'A00000000000000000000000000000123456',
      accessToken: 'token',
    }, fetchImpl)).rejects.toThrow(/refund failed/)
  })
})
