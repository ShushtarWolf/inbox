import { describe, expect, it } from 'vitest'
import {
  initialOnlineCourtHoldDisplay,
  isHoldExpiredPaymentFailure,
  isOnlinePaymentHoldCandidate,
  isOnlinePaymentHoldExpired,
  isReleasableOnlinePaymentHold,
  ONLINE_HOLD_EXPIRED_FAIL_REASON,
  ONLINE_PAYMENT_HOLD_MINUTES,
  ONLINE_PAYMENT_HOLD_MS,
  onlinePaymentHoldExpiresAt,
  readPaymentFailReason,
} from './onlinePaymentHold.ts'

describe('onlinePaymentHold', () => {
  it('uses a 15-minute window (prototype pay-fail hold)', () => {
    expect(ONLINE_PAYMENT_HOLD_MINUTES).toBe(15)
    expect(ONLINE_PAYMENT_HOLD_MS).toBe(15 * 60 * 1000)
  })

  it('computes expiry from createdAt', () => {
    const createdAt = new Date('2026-08-23T10:00:00.000Z')
    expect(onlinePaymentHoldExpiresAt(createdAt).toISOString()).toBe('2026-08-23T10:15:00.000Z')
  })

  it('is not expired before 15 minutes', () => {
    const createdAt = new Date('2026-08-23T10:00:00.000Z')
    const now = new Date('2026-08-23T10:14:59.000Z')
    expect(isOnlinePaymentHoldExpired(createdAt, now)).toBe(false)
  })

  it('is expired at exactly 15 minutes', () => {
    const createdAt = new Date('2026-08-23T10:00:00.000Z')
    const now = new Date('2026-08-23T10:15:00.000Z')
    expect(isOnlinePaymentHoldExpired(createdAt, now)).toBe(true)
  })

  it('labels hold/cron expiry as hold-expired, not bank decline', () => {
    expect(isHoldExpiredPaymentFailure({
      status: 'FAILED',
      failReason: ONLINE_HOLD_EXPIRED_FAIL_REASON,
    })).toBe(true)
    expect(isHoldExpiredPaymentFailure({
      status: 'FAILED',
      failReason: 'pending_online_expired',
    })).toBe(true)
    expect(isHoldExpiredPaymentFailure({
      status: 'FAILED',
      cancellationReason: 'NO_PAYMENT',
    })).toBe(true)
    expect(isHoldExpiredPaymentFailure({ status: 'FAILED' })).toBe(false)
    expect(isHoldExpiredPaymentFailure({ status: 'PAID', failReason: ONLINE_HOLD_EXPIRED_FAIL_REASON })).toBe(false)
  })

  it('reads failReason from payment metadata JSON', () => {
    expect(readPaymentFailReason(JSON.stringify({ failReason: ONLINE_HOLD_EXPIRED_FAIL_REASON })))
      .toBe(ONLINE_HOLD_EXPIRED_FAIL_REASON)
    expect(readPaymentFailReason('{"x":1}')).toBeNull()
    expect(readPaymentFailReason(null)).toBeNull()
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
    expect(isReleasableOnlinePaymentHold(base, new Date('2026-08-23T10:14:59.000Z'))).toBe(false)
    expect(isReleasableOnlinePaymentHold(base, new Date('2026-08-23T10:15:00.000Z'))).toBe(true)
  })
})
