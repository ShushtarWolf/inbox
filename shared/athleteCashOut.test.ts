import { describe, expect, it } from 'vitest'
import {
  athleteCashOutFromTxs,
  clampAthleteWithdrawAmount,
  ATHLETE_WITHDRAW_MIN_IRR,
  ATHLETE_WITHDRAW_MIN_TOMAN,
  ATHLETE_WITHDRAW_MAX_TOMAN,
} from './athleteCashOut.ts'

describe('athleteCashOutFromTxs', () => {
  it('nets top-up and refunds minus booking debits', () => {
    expect(athleteCashOutFromTxs([
      { type: 'TOPUP_CREDIT', amount: 1_000_000, createdAt: '2026-01-01T00:00:00Z' },
      { type: 'REFUND_CREDIT', amount: 400_000 },
      { type: 'PAYMENT_DEBIT', amount: -300_000 },
      { type: 'SETTLEMENT_CREDIT', amount: 999_999 },
    ], new Date('2026-01-03T00:00:00Z'), 24 * 60 * 60 * 1000)).toBe(1_100_000)
  })

  it('excludes fresh TOPUP_CREDIT during cool-down hold', () => {
    const now = new Date('2026-01-02T12:00:00Z')
    expect(athleteCashOutFromTxs([
      { type: 'TOPUP_CREDIT', amount: 1_000_000, createdAt: '2026-01-02T00:00:00Z' },
      { type: 'REFUND_CREDIT', amount: 200_000 },
    ], now, 24 * 60 * 60 * 1000)).toBe(200_000)
  })

  it('holds fresh REFUND_CREDIT too (card → booking → cancel → SHEBA)', () => {
    const now = new Date('2026-01-02T12:00:00Z')
    expect(athleteCashOutFromTxs([
      { type: 'REFUND_CREDIT', amount: 500_000, createdAt: '2026-01-02T11:30:00Z' },
      { type: 'REFUND_CREDIT', amount: 200_000, createdAt: '2026-01-01T00:00:00Z' },
    ], now, 24 * 60 * 60 * 1000)).toBe(200_000)
  })
})

describe('clampAthleteWithdrawAmount', () => {
  it('enforces min and caps', () => {
    expect(clampAthleteWithdrawAmount(ATHLETE_WITHDRAW_MIN_IRR, {
      available: 1_000_000,
      cashOutNet: 1_000_000,
      dailyRemaining: 1_000_000,
    }).ok).toBe(true)
    expect(clampAthleteWithdrawAmount(1_000, {
      available: 1_000_000,
      cashOutNet: 1_000_000,
      dailyRemaining: 1_000_000,
    })).toEqual({ ok: false, reason: 'below_min' })
  })

  it('defaults are toman-scale (not rials×10)', () => {
    expect(ATHLETE_WITHDRAW_MIN_TOMAN).toBe(50_000)
    expect(ATHLETE_WITHDRAW_MAX_TOMAN).toBe(50_000_000)
    expect(ATHLETE_WITHDRAW_MIN_IRR).toBe(ATHLETE_WITHDRAW_MIN_TOMAN)
  })
})
