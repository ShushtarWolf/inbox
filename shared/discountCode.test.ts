import { describe, expect, it } from 'vitest'
import {
  applyDiscountPercent,
  clampDiscountPercent,
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
})
