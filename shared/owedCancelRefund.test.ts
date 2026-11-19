import { describe, expect, it } from 'vitest'
import { cancelDeskCashReturnAmount, cancelWalletCreditAmount } from './owedCancelRefund.ts'

describe('cancelWalletCreditAmount', () => {
  it('desk cash → 0 wallet credit; desk return still reports share', () => {
    expect(cancelWalletCreditAmount({
      method: 'CASH',
      paymentAmount: 50_000,
    })).toEqual({ amount: 0, reason: 'desk_cash', series: false })
    expect(cancelDeskCashReturnAmount({
      method: 'CASH',
      paymentAmount: 50_000,
    })).toEqual({ amount: 50_000, reason: 'desk_cash', series: false })
    expect(cancelDeskCashReturnAmount({
      method: 'CASH',
      paymentAmount: 0,
      primaryAmount: 9_000,
      sessionPrice: 1_500,
      remainingSessionsIncludingCancelled: 6,
      treatAsSeries: true,
    }).amount).toBe(1_500)
  })

  it('discounted standalone refund uses payment.amount not list meta (IB-07)', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 9_000,
      refundBps: 10_000,
      metadata: { subtotalBeforeDiscount: 12_000 },
    }).amount).toBe(9_000)
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 9_000,
      refundBps: 5_000,
      metadata: { subtotalBeforeDiscount: 12_000 },
    }).amount).toBe(4_500)
  })

  it('standalone IPG → full amount at 100% bps', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 5_000,
      refundBps: 10_000,
    })).toEqual({ amount: 5_000, reason: 'standalone', series: false })
  })

  it('standalone respects partial refundBps', () => {
    expect(cancelWalletCreditAmount({
      method: 'PAID',
      paymentAmount: 10_000,
      refundBps: 5_000,
    }).amount).toBe(5_000)
  })

  it('explicit meta wins and is not double-scaled by bps', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 9_000,
      refundBps: 5_000,
      metadata: { refundCreditAmount: 1_500, seasonBookingId: 's1' },
    })).toEqual({ amount: 1_500, reason: 'explicit_meta', series: true })
  })

  it('repair path caps stale explicit refundCreditAmount to fair series share', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 0,
      primaryAmount: 9_000,
      sessionPrice: 5_000,
      remainingSessionsIncludingCancelled: 6,
      treatAsSeries: true,
      honorExplicitRefundMeta: false,
      metadata: {
        refundCreditAmount: 5_000,
        groupPrimaryBookingId: 'b1',
        groupSiblingBookingIds: ['b2', 'b3', 'b4', 'b5', 'b6'],
      },
    })).toEqual({ amount: 1_500, reason: 'series_session', series: true })
  })

  it('series one-of-N uses sessionPrice capped by residual', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 0,
      primaryAmount: 9_000,
      sessionPrice: 1_500,
      alreadyRefundedOnPrimary: 0,
      remainingSessionsIncludingCancelled: 6,
      treatAsSeries: true,
      refundBps: 10_000,
    })).toEqual({ amount: 1_500, reason: 'series_session', series: true })
  })

  it('series one-of-N caps list sessionPrice by fair share of paid residual (desk discount)', () => {
    // Behnaz-class: list 5000 × 6 but charged 9000 after desk discount → one session = 1500.
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 0,
      primaryAmount: 9_000,
      sessionPrice: 5_000,
      alreadyRefundedOnPrimary: 0,
      remainingSessionsIncludingCancelled: 6,
      treatAsSeries: true,
      refundBps: 10_000,
    })).toEqual({ amount: 1_500, reason: 'series_session', series: true })
  })

  it('series never exceeds residual after prior session refunds', () => {
    // residual 1000 across 2 remaining → fair share 500 each (last session path keeps leftover).
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 0,
      primaryAmount: 9_000,
      sessionPrice: 1_500,
      alreadyRefundedOnPrimary: 8_000,
      remainingSessionsIncludingCancelled: 2,
      treatAsSeries: true,
    }).amount).toBe(500)
  })

  it('series last session credits full residual even when sessionPrice is lower', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 0,
      primaryAmount: 9_000,
      sessionPrice: 1_500,
      alreadyRefundedOnPrimary: 7_000,
      remainingSessionsIncludingCancelled: 1,
      treatAsSeries: true,
    }).amount).toBe(2_000)
  })

  it('series without sessionPrice fair-splits residual', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 9_000,
      primaryAmount: 9_000,
      remainingSessionsIncludingCancelled: 6,
      metadata: { seasonBookingId: 's1' },
    }).amount).toBe(1_500)
  })

  it('detects series from metadata markers', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 0,
      primaryAmount: 9000,
      sessionPrice: 1500,
      metadata: { groupPrimaryBookingId: 'b1', groupSiblingBookingIds: ['b2'] },
    }).series).toBe(true)
  })
})
