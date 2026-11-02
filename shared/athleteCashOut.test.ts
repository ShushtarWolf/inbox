import { describe, expect, it } from 'vitest'
import { athleteCashOutFromTxs, clampAthleteWithdrawAmount, ATHLETE_WITHDRAW_MIN_IRR } from './athleteCashOut.ts'

describe('athleteCashOutFromTxs', () => {
  it('nets top-up and refunds minus booking debits', () => {
    expect(athleteCashOutFromTxs([
      { type: 'TOPUP_CREDIT', amount: 1_000_000 },
      { type: 'REFUND_CREDIT', amount: 400_000 },
      { type: 'PAYMENT_DEBIT', amount: -300_000 },
      { type: 'SETTLEMENT_CREDIT', amount: 999_999 },
    ])).toBe(1_100_000)
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
})
