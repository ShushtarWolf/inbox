/**
 * Phase-4 CI money matrix — owed / historical decide / gateway-guard must agree.
 * Keep this file green before merging money PRs. No DB.
 */
import { describe, expect, it } from 'vitest'
import { ordinaryCancelRefundGuard } from './cancelRefund.ts'
import { decideHistoricalCancelRefund } from './historicalRefundRepair.ts'
import { cancelWalletCreditAmount } from './owedCancelRefund.ts'

describe('money cancel matrix (phase 4)', () => {
  it('standalone IPG / PAID / partial bps', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 5_000,
      refundBps: 10_000,
    }).amount).toBe(5_000)
    expect(cancelWalletCreditAmount({
      method: 'PAID',
      paymentAmount: 10_000,
      refundBps: 5_000,
    }).amount).toBe(5_000)
  })

  it('series 1-of-N uses session share; last-of-N uses full residual', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 0,
      primaryAmount: 9_000,
      sessionPrice: 1_500,
      alreadyRefundedOnPrimary: 0,
      remainingSessionsIncludingCancelled: 6,
      treatAsSeries: true,
    }).amount).toBe(1_500)
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

  it('discounted primary still caps at residual (no second discount invent)', () => {
    expect(cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 0,
      primaryAmount: 7_500,
      sessionPrice: 1_500,
      alreadyRefundedOnPrimary: 6_000,
      remainingSessionsIncludingCancelled: 2,
      treatAsSeries: true,
    }).amount).toBe(1_500)
  })

  it('desk cash → 0; failed/zero charge → 0', () => {
    expect(cancelWalletCreditAmount({ method: 'CASH', paymentAmount: 50_000 }).amount).toBe(0)
    expect(cancelWalletCreditAmount({ method: 'IPG', paymentAmount: 0 }).amount).toBe(0)
  })

  it('PAID + stale gateway flags still proceed (live guard)', () => {
    expect(ordinaryCancelRefundGuard(
      { gatewayReversed: true, gatewayRefund: true, reversePending: true },
      { method: 'PAID' },
    )).toEqual({ action: 'proceed' })
    expect(ordinaryCancelRefundGuard(
      { gatewayReversed: true, walletCheckout: true },
      { method: 'IPG' },
    )).toEqual({ action: 'proceed' })
  })

  it('IPG + stale gateway without wallet debit stays review/skip historically', () => {
    expect(decideHistoricalCancelRefund({
      method: 'IPG',
      paymentStatus: 'REFUNDED',
      bookingStatus: 'CANCELLED',
      amount: 5_000,
      userId: 'u1',
      refundCreditSum: 0,
      metadata: { gatewayReversed: true },
    }).reason).toBe('card_already_reversed')
    expect(decideHistoricalCancelRefund({
      method: 'IPG',
      paymentStatus: 'REFUNDED',
      bookingStatus: 'CANCELLED',
      amount: 5_000,
      userId: 'u1',
      refundCreditSum: 0,
      metadata: {},
    }).reason).toBe('bank_outcome_unknown')
  })

  it('IPG with wallet debit credits despite reverse flags (historical = live policy)', () => {
    expect(decideHistoricalCancelRefund({
      method: 'IPG',
      paymentStatus: 'REFUNDED',
      bookingStatus: 'CANCELLED',
      amount: 5_000,
      userId: null,
      debitedWalletUserId: 'payer',
      walletDebitAbs: 5_000,
      refundCreditSum: 0,
      metadata: { gatewayReversed: true, gatewayRefund: true },
    })).toMatchObject({ action: 'credit', amount: 5_000 })
  })

  it('historical series decide uses session share not full primary', () => {
    expect(decideHistoricalCancelRefund({
      method: 'IPG',
      paymentStatus: 'REFUNDED',
      bookingStatus: 'CANCELLED',
      amount: 0,
      userId: 'u1',
      refundCreditSum: 0,
      primaryAmount: 9_000,
      sessionPrice: 1_500,
      alreadyRefundedOnPrimary: 0,
      remainingSessionsIncludingCancelled: 6,
      treatAsSeries: true,
      metadata: { refundChannel: 'wallet_closed_loop', seasonBookingId: 's1' },
    })).toMatchObject({ action: 'credit', amount: 1_500, reason: 'series_session_shortfall' })
  })
})
