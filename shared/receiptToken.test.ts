import { describe, expect, it } from 'vitest'
import { bookingTrackingCode, parseReceiptToken, receiptPath, signReceiptToken } from './receiptToken'

describe('receiptToken', () => {
  const secret = 'test-secret-at-least-32-characters!!'

  it('signs and parses a booking id', () => {
    const token = signReceiptToken('booking-1', secret)
    expect(parseReceiptToken(token, secret)).toBe('booking-1')
  })

  it('rejects a tampered token or wrong secret', () => {
    const token = signReceiptToken('booking-1', secret)
    expect(parseReceiptToken(token, 'other-secret-at-least-32-characters')).toBeNull()
    expect(parseReceiptToken(`${token}x`, secret)).toBeNull()
    expect(parseReceiptToken('', secret)).toBeNull()
  })

  it('builds a stable numeric tracking code and receipt path', () => {
    expect(bookingTrackingCode('booking-1')).toMatch(/^\d{7}$/)
    expect(bookingTrackingCode('booking-1')).toBe(bookingTrackingCode('booking-1'))
    expect(bookingTrackingCode('booking-2')).not.toBe(bookingTrackingCode('booking-1'))
    expect(receiptPath('abc')).toBe('/r/abc')
  })
})
