import { describe, expect, it } from 'vitest'
import {
  initialOnlineCourtHoldDisplay,
  isOnlinePaymentHoldCandidate,
  isOnlinePaymentHoldExpired,
  isReleasableOnlinePaymentHold,
  ONLINE_PAYMENT_HOLD_MINUTES,
  ONLINE_PAYMENT_HOLD_MS,
  onlinePaymentHoldExpiresAt,
} from './onlinePaymentHold.ts'

describe('onlinePaymentHold', () => {
  it('uses a 10-minute window', () => {
    expect(ONLINE_PAYMENT_HOLD_MINUTES).toBe(10)
    expect(ONLINE_PAYMENT_HOLD_MS).toBe(10 * 60 * 1000)
  })

  it('computes expiry from createdAt', () => {
    const createdAt = new Date('2026-08-23T10:00:00.000Z')
    expect(onlinePaymentHoldExpiresAt(createdAt).toISOString()).toBe('2026-08-23T10:10:00.000Z')
  })

  it('is not expired before 10 minutes', () => {
    const createdAt = new Date('2026-08-23T10:00:00.000Z')
    const now = new Date('2026-08-23T10:09:59.000Z')
    expect(isOnlinePaymentHoldExpired(createdAt, now)).toBe(false)
  })

  it('is expired at exactly 10 minutes', () => {
    const createdAt = new Date('2026-08-23T10:00:00.000Z')
    const now = new Date('2026-08-23T10:10:00.000Z')
    expect(isOnlinePaymentHoldExpired(createdAt, now)).toBe(true)
  })

  it('soft-holds only for online mode', () => {
    expect(initialOnlineCourtHoldDisplay(true)).toEqual({
      displayStatus: 'PENDING',
      bookingStatus: 'PENDING',
    })
    expect(initialOnlineCourtHoldDisplay(false)).toEqual({
      displayStatus: 'RESERVED',
      bookingStatus: 'CONFIRMED',
    })
  })

  it('candidates are platform unpaid online rows', () => {
    expect(isOnlinePaymentHoldCandidate({
      source: 'PLATFORM',
      status: 'PENDING',
      paymentStatus: 'PENDING_ONLINE',
    })).toBe(true)
    expect(isOnlinePaymentHoldCandidate({
      source: 'PLATFORM',
      status: 'CONFIRMED',
      paymentStatus: 'FAILED',
    })).toBe(true)
    expect(isOnlinePaymentHoldCandidate({
      source: 'CLUB',
      status: 'CONFIRMED',
      paymentStatus: 'PAY_AT_CLUB',
    })).toBe(false)
    expect(isOnlinePaymentHoldCandidate({
      source: 'PLATFORM',
      status: 'CONFIRMED',
      paymentStatus: 'PAY_AT_CLUB',
    })).toBe(false)
    expect(isOnlinePaymentHoldCandidate({
      source: 'PLATFORM',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
    })).toBe(false)
  })

  it('releasable only after deadline', () => {
    const createdAt = new Date('2026-08-23T10:00:00.000Z')
    const base = {
      source: 'PLATFORM' as const,
      status: 'PENDING' as const,
      paymentStatus: 'PENDING_ONLINE' as const,
      createdAt,
    }
    expect(isReleasableOnlinePaymentHold(base, new Date('2026-08-23T10:09:59.000Z'))).toBe(false)
    expect(isReleasableOnlinePaymentHold(base, new Date('2026-08-23T10:10:00.000Z'))).toBe(true)
  })
})
