import { describe, expect, it } from 'vitest'
import { cancelWalletCreditAmount } from './owedCancelRefund.ts'

describe('cancelWalletCreditAmount', () => {
  it('desk cash → 0', () => {
    expect(cancelWalletCreditAmount({
      method: 'CASH',
      paymentAmount: 50_000,
    })).toEqual({ amount: 0, reason: 'desk_cash', series: false })
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

  it('series never exceeds residual after prior session refunds', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 0,
      primaryAmount: 9_000,
      sessionPrice: 1_500,
      alreadyRefundedOnPrimary: 8_000,
      remainingSessionsIncludingCancelled: 2,
      treatAsSeries: true,
    }).amount).toBe(1_000)
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
