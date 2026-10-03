import { describe, expect, it } from 'vitest'
import { canCancelReservation, resolveCancelMoneyOutcome } from './cancelPolicy'
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
    })).toBe('full_wallet_refund')
    expect(resolveCancelMoneyOutcome({
      actor: 'coach',
      date: today,
      startTime: '09:00',
      windowHours: 12,
      now,
    })).toBe('full_wallet_refund')
  })

  it('athlete outside window gets full wallet refund', () => {
    expect(resolveCancelMoneyOutcome({
      actor: 'athlete',
      date: farDate,
      startTime: '10:00',
      windowHours: 12,
      now,
    })).toBe('full_wallet_refund')
  })

  it('athlete inside window gets zero refund', () => {
    const soon = localTimeString(new Date(now.getTime() + 2 * 60 * 60 * 1000))
    expect(resolveCancelMoneyOutcome({
      actor: 'athlete',
      date: today,
      startTime: soon,
      windowHours: 12,
      now,
    })).toBe('zero_refund')
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
