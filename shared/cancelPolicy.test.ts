import { describe, expect, it } from 'vitest'
import {
  canCancelReservation,
  refundAmountFromBps,
  resolveCancelMoneyDetail,
  resolveCancelMoneyOutcome,
} from './cancelPolicy'
import { addDaysToIsoDate, localDateString, localTimeString } from './localDate'

describe('resolveCancelMoneyOutcome', () => {
  const now = new Date('2026-06-01T08:00:00+03:30')
  const today = localDateString(now)
  const farDate = addDaysToIsoDate(today, 3)

  it('owner/coach always full wallet refund', () => {
    expect(resolveCancelMoneyOutcome({
      actor: 'owner',
      date: today,
      startTime: '09:00',
      windowHours: 12,
      now,
      insideWindowRefundBps: 0,
    })).toBe('full_wallet_refund')
  })

  it('athlete outside window always full refund', () => {
    expect(resolveCancelMoneyOutcome({
      actor: 'athlete',
      date: farDate,
      startTime: '10:00',
      windowHours: 12,
      now,
      insideWindowRefundBps: 0,
    })).toBe('full_wallet_refund')
  })

  it('athlete inside window respects club bps (default 100%)', () => {
    const soon = localTimeString(new Date(now.getTime() + 2 * 60 * 60 * 1000))
    expect(resolveCancelMoneyOutcome({
      actor: 'athlete',
      date: today,
      startTime: soon,
      windowHours: 12,
      now,
    })).toBe('full_wallet_refund')
    expect(resolveCancelMoneyDetail({
      actor: 'athlete',
      date: today,
      startTime: soon,
      windowHours: 12,
      now,
      insideWindowRefundBps: 0,
    })).toEqual({ outcome: 'zero_refund', refundBps: 0 })
    expect(resolveCancelMoneyDetail({
      actor: 'athlete',
      date: today,
      startTime: soon,
      windowHours: 12,
      now,
      insideWindowRefundBps: 5000,
    })).toEqual({ outcome: 'partial_wallet_refund', refundBps: 5000 })
  })

  it('refundAmountFromBps floors correctly', () => {
    expect(refundAmountFromBps(1_000_000, 5000)).toBe(500_000)
    expect(refundAmountFromBps(100, 3333)).toBe(33)
  })
})

describe('canCancelReservation', () => {
  const now = new Date('2026-06-01T08:00:00+03:30')
  const today = localDateString(now)

  it('blocks athlete after slot start', () => {
    expect(canCancelReservation({
      actor: 'athlete',
      date: today,
      startTime: '07:00',
      now,
    })).toBe(false)
  })

  it('allows athlete before slot start', () => {
    expect(canCancelReservation({
      actor: 'athlete',
      date: today,
      startTime: '20:00',
      now,
    })).toBe(true)
  })

  it('allows coach/owner even after start', () => {
    expect(canCancelReservation({
      actor: 'coach',
      date: today,
      startTime: '07:00',
      now,
    })).toBe(true)
  })
})
