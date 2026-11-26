import { describe, expect, it } from 'vitest'
import {
  athleteCashOutFromTxs,
  athleteCashOutHoldFromTxs,
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

  it('counts fresh TOPUP_CREDIT immediately (hold is IPG cancel refunds only)', () => {
    const now = new Date('2026-01-02T12:00:00Z')
    expect(athleteCashOutFromTxs([
      { type: 'TOPUP_CREDIT', amount: 1_000_000, createdAt: '2026-01-02T00:00:00Z' },
      { type: 'REFUND_CREDIT', amount: 200_000, createdAt: '2026-01-01T00:00:00Z' },
    ], now, 24 * 60 * 60 * 1000)).toBe(1_200_000)
  })

  it('ignores the IPG booking pair and a card-return row', () => {
    expect(athleteCashOutFromTxs([
      { type: 'TOPUP_CREDIT', amount: 80_000, createdAt: '2026-01-01T00:00:00Z' },
      { type: 'IPG_BOOKING_CREDIT', amount: 2_500 },
      { type: 'IPG_BOOKING_DEBIT', amount: -2_500 },
      { type: 'IPG_RETURNED_TO_CARD', amount: -2_500 },
    ], new Date('2026-02-01T00:00:00Z'), 0)).toBe(80_000)
  })

  it('holds fresh REFUND_CREDIT too (card → booking → cancel → SHEBA)', () => {
    const now = new Date('2026-01-02T12:00:00Z')
    expect(athleteCashOutFromTxs([
      { type: 'REFUND_CREDIT', amount: 500_000, createdAt: '2026-01-02T11:30:00Z' },
      { type: 'REFUND_CREDIT', amount: 200_000, createdAt: '2026-01-01T00:00:00Z' },
    ], now, 24 * 60 * 60 * 1000)).toBe(200_000)
  })

  it('IB-57: wallet booking debit then athlete-cancel refund restores withdrawable during hold', () => {
    const now = new Date('2026-11-26T14:00:00Z')
    const hold = 24 * 60 * 60 * 1000
    const payWallet = 'pay-wallet-5k'
    expect(athleteCashOutFromTxs([
      { type: 'TOPUP_CREDIT', amount: 307_999, createdAt: '2026-01-01T00:00:00Z' },
      { type: 'PAYMENT_DEBIT', amount: -5_000, paymentId: payWallet, createdAt: '2026-11-26T13:00:00Z' },
      { type: 'REFUND_CREDIT', amount: 5_000, paymentId: payWallet, createdAt: '2026-11-26T13:05:00Z' },
      // Second cancel: IPG capture → wallet refund only (no PAYMENT_DEBIT); refund stays on hold.
      { type: 'REFUND_CREDIT', amount: 12_000, paymentId: 'pay-ipg-12k', createdAt: '2026-11-26T13:15:00Z' },
    ], now, hold)).toBe(307_999)
    // Wallet-leg fully restored; IPG refund still gated until hold ends.
    expect(athleteCashOutFromTxs([
      { type: 'TOPUP_CREDIT', amount: 307_999, createdAt: '2026-01-01T00:00:00Z' },
      { type: 'PAYMENT_DEBIT', amount: -5_000, paymentId: payWallet },
      { type: 'REFUND_CREDIT', amount: 5_000, paymentId: payWallet, createdAt: '2026-11-26T13:05:00Z' },
      { type: 'PAYMENT_DEBIT', amount: -12_000, paymentId: 'pay-wallet-12k' },
      { type: 'REFUND_CREDIT', amount: 12_000, paymentId: 'pay-wallet-12k', createdAt: '2026-11-26T13:15:00Z' },
    ], now, hold)).toBe(307_999)
  })

  it('owner-season-edit wallet refund counts when paired with PAYMENT_DEBIT', () => {
    const now = new Date('2026-06-01T12:00:00Z')
    expect(athleteCashOutFromTxs([
      { type: 'TOPUP_CREDIT', amount: 100_000, createdAt: '2026-01-01T00:00:00Z' },
      { type: 'PAYMENT_DEBIT', amount: -40_000, paymentId: 'pay-season' },
      { type: 'REFUND_CREDIT', amount: 40_000, paymentId: 'pay-season', createdAt: '2026-06-01T11:00:00Z' },
    ], now, 24 * 60 * 60 * 1000)).toBe(100_000)
  })

  it('IPG booking cancel refund stays on hold without PAYMENT_DEBIT', () => {
    const now = new Date('2026-06-01T12:00:00Z')
    const hold = 24 * 60 * 60 * 1000
    const refundAt = '2026-06-01T11:00:00Z'
    expect(athleteCashOutFromTxs([
      { type: 'TOPUP_CREDIT', amount: 50_000, createdAt: '2026-01-01T00:00:00Z' },
      { type: 'IPG_BOOKING_CREDIT', amount: 600_000 },
      { type: 'IPG_BOOKING_DEBIT', amount: -600_000 },
      { type: 'REFUND_CREDIT', amount: 600_000, paymentId: 'ipg-pay', createdAt: refundAt },
    ], now, hold)).toBe(50_000)
    const holdSummary = athleteCashOutHoldFromTxs([
      { type: 'REFUND_CREDIT', amount: 600_000, paymentId: 'ipg-pay', createdAt: refundAt },
    ], now, hold)
    expect(holdSummary).toEqual({
      heldAmount: 600_000,
      unlockAt: new Date(new Date(refundAt).getTime() + hold).toISOString(),
      items: [{
        amount: 600_000,
        unlockAt: new Date(new Date(refundAt).getTime() + hold).toISOString(),
      }],
    })
  })

  it('athleteCashOutHoldFromTxs aggregates IPG holds and earliest unlock', () => {
    const now = new Date('2026-06-01T12:00:00Z')
    const hold = 24 * 60 * 60 * 1000
    const payWallet = 'pay-w'
    const early = '2026-06-01T10:00:00Z'
    const late = '2026-06-01T11:30:00Z'
    const summary = athleteCashOutHoldFromTxs([
      { type: 'PAYMENT_DEBIT', amount: -5_000, paymentId: payWallet },
      { type: 'REFUND_CREDIT', amount: 5_000, paymentId: payWallet, createdAt: late },
      { type: 'REFUND_CREDIT', amount: 12_000, paymentId: 'ipg-a', createdAt: late },
      { type: 'REFUND_CREDIT', amount: 8_000, paymentId: 'ipg-b', createdAt: early },
    ], now, hold)
    expect(summary?.heldAmount).toBe(20_000)
    expect(summary?.unlockAt).toBe(new Date(new Date(early).getTime() + hold).toISOString())
    expect(summary?.items).toHaveLength(2)
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
