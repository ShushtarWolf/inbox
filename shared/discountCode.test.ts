import { describe, expect, it } from 'vitest'
import {
  applyDiscountPercent,
  clampDiscountPercent,
  deriveDiscountCodeDisplayStatus,
  evaluateDiscountCodeWindow,
  normalizeDiscountCode,
} from './discountCode'

describe('normalizeDiscountCode', () => {
  it('uppercases and strips spaces', () => {
    expect(normalizeDiscountCode('  student 20 ')).toBe('STUDENT20')
  })
})

describe('applyDiscountPercent', () => {
  it('applies percent to subtotal', () => {
    expect(applyDiscountPercent(500000, 20)).toEqual({
      discountAmount: 100000,
      total: 400000,
    })
  })

  it('clamps percent and never exceeds subtotal', () => {
    expect(clampDiscountPercent(150)).toBe(100)
    expect(applyDiscountPercent(1000, 100)).toEqual({ discountAmount: 1000, total: 0 })
  })
})

describe('evaluateDiscountCodeWindow', () => {
  const now = new Date('2026-07-27T12:00:00.000Z')

  it('accepts active platform codes', () => {
    expect(evaluateDiscountCodeWindow({ active: true, now })).toEqual({ ok: true })
  })

  it('rejects wrong club', () => {
    expect(evaluateDiscountCodeWindow({
      active: true,
      clubId: 'club-a',
      bookingClubId: 'club-b',
      now,
    })).toEqual({ ok: false, reason: 'wrong_club' })
  })

  it('rejects exhausted codes', () => {
    expect(evaluateDiscountCodeWindow({
      active: true,
      maxRedemptions: 10,
      redemptionCount: 10,
      now,
    })).toEqual({ ok: false, reason: 'exhausted' })
  })

  it('rejects bound codes for wrong user', () => {
    expect(evaluateDiscountCodeWindow({
      active: true,
      boundUserId: 'user-a',
      redeemingUserId: 'user-b',
      bookingClubId: 'club-a',
      clubId: 'club-a',
      now,
    })).toEqual({ ok: false, reason: 'wrong_user' })
  })

  it('accepts code through end of expiry day (Tehran)', () => {
    expect(evaluateDiscountCodeWindow({
      active: true,
      endsAt: '2026-10-22',
      now: new Date('2026-10-22T20:00:00+03:30'),
    })).toEqual({ ok: true })
  })

  it('rejects after expiry day (Tehran)', () => {
    expect(evaluateDiscountCodeWindow({
      active: true,
      endsAt: '2026-10-22',
      now: new Date('2026-10-23T00:00:01+03:30'),
    })).toEqual({ ok: false, reason: 'expired' })
  })
})

describe('deriveDiscountCodeDisplayStatus', () => {
  it('shows expired while active flag stays on', () => {
    expect(deriveDiscountCodeDisplayStatus({
      active: true,
      endsAt: '2026-10-22',
      redemptionCount: 0,
      maxRedemptions: 5,
    }, new Date('2026-11-16T12:00:00+03:30'))).toBe('expired')
  })

  it('shows exhausted when cap reached', () => {
    expect(deriveDiscountCodeDisplayStatus({
      active: true,
      maxRedemptions: 5,
      redemptionCount: 5,
    })).toBe('exhausted')
  })
})
