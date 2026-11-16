/**
 * Pre-launch financial test matrix (grouped for audit traceability).
 * Heavy paths live in money.it.ts (Postgres); this file keeps fast unit coverage
 * for IPG vs CASH separation and callback hygiene.
 */
import { describe, expect, it } from 'vitest'
import { resolveRefundChannel } from '#shared/cancelRefund.ts'
import { decideHistoricalCancelRefund } from '#shared/historicalRefundRepair.ts'
import { classifyHistoricalRefundBucket } from '#shared/historicalRefundInventory.ts'
import { cancelWalletCreditAmount } from '#shared/owedCancelRefund.ts'
import { summarizeCashBook, summarizeOnlineOpen } from '#shared/dualRailBooks.ts'
import { isPaymentCallbackOk, readPaymentCallbackFields } from '#shared/paymentCallback.ts'
import { tomanToRials } from '#shared/payments.ts'
import { resolvePaymentClubId } from './staleBooking'

describe('IPG_PAYMENT_TESTS', () => {
  it('callback OK still requires server verify (State alone is not PAID)', () => {
    expect(isPaymentCallbackOk('OK')).toBe(true)
    expect(readPaymentCallbackFields({ ResNum: 'R1', State: 'OK' }).providerRef).toBe('R1')
  })

  it('SEP amount boundary uses integer toman × 10 rials', () => {
    expect(tomanToRials(1_000_000)).toBe(10_000_000)
  })

  it('NOK / cancel callbacks are never treated as success', () => {
    expect(isPaymentCallbackOk('NOK')).toBe(false)
    expect(isPaymentCallbackOk('CANCELED')).toBe(false)
  })
})

describe('CASH_ACCOUNTING_TESTS', () => {
  it('desk CASH cancel routes to desk_cash channel (no wallet credit path)', () => {
    expect(resolveRefundChannel('CASH')).toBe('desk_cash')
    expect(resolveRefundChannel('IPG')).toBe('wallet_closed_loop')
  })

  it('booking paymentMethod CASH fallback when Payment row drifted', () => {
    expect(resolveRefundChannel('NOT_PAID', 'CASH')).toBe('desk_cash')
  })

  it('owner club resolution works for detached desk payments', () => {
    expect(resolvePaymentClubId({
      booking: null,
      metadataJson: JSON.stringify({ detachedClubId: 'club-x' }),
    })).toBe('club-x')
  })
})

describe('FINANCIAL_CROSS_SYSTEM_TESTS', () => {
  it('cash book excludes IPG/wallet from till totals', () => {
    const book = summarizeCashBook([
      { amount: 100_000, method: 'CASH', status: 'PAID', metadataJson: null },
      { amount: 200_000, method: 'IPG', status: 'PAID', metadataJson: null },
      { amount: 50_000, method: 'PAID', status: 'PAID', metadataJson: null },
    ])
    expect(book.inTill).toBe(100_000)
  })

  it('online open book ignores desk CASH rows', () => {
    const online = summarizeOnlineOpen([
      { amount: 100_000, method: 'CASH', status: 'PAID', metadataJson: null },
      { amount: 300_000, method: 'IPG', status: 'PAID', metadataJson: null },
    ])
    expect(online.collectedOpen).toBe(300_000)
  })

  it('refunded desk cash owed does not inflate online float', () => {
    const online = summarizeOnlineOpen([
      {
        amount: 80_000,
        method: 'CASH',
        status: 'REFUNDED',
        metadataJson: JSON.stringify({ deskCashReturn: 'owed' }),
      },
    ])
    expect(online.collectedOpen).toBe(0)
  })
})

describe('MONEY_POLICY_PHASE1_TESTS', () => {
  it('owed helper and historical decide agree on standalone IPG cancel', () => {
    const owed = cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 100_000,
      refundBps: 10_000,
    }).amount
    const decision = decideHistoricalCancelRefund({
      method: 'IPG',
      paymentStatus: 'REFUNDED',
      bookingStatus: 'CANCELLED',
      amount: 100_000,
      userId: 'u1',
      refundCreditSum: 0,
      metadata: { refundChannel: 'wallet_closed_loop', refundCreditAmount: 100_000 },
    })
    expect(owed).toBe(100_000)
    expect(decision).toEqual({ action: 'credit', amount: 100_000, reason: 'wallet_path_shortfall' })
    expect(classifyHistoricalRefundBucket({
      decision,
      method: 'IPG',
      paymentAmount: 100_000,
      metadata: {},
      owedAmount: owed,
      creditedAmount: 0,
    })).toBe('credit')
  })

  it('series session cancel never invents full primary in owed helper', () => {
    const owed = cancelWalletCreditAmount({
      method: 'IPG',
      paymentAmount: 0,
      primaryAmount: 9_000,
      sessionPrice: 1_500,
      alreadyRefundedOnPrimary: 0,
      remainingSessionsIncludingCancelled: 6,
      treatAsSeries: true,
    }).amount
    expect(owed).toBe(1_500)
    const decision = decideHistoricalCancelRefund({
      method: 'IPG',
      paymentStatus: 'PAID',
      bookingStatus: 'CANCELLED',
      amount: 0,
      userId: 'u1',
      refundCreditSum: 0,
      primaryAmount: 9_000,
      sessionPrice: 1_500,
      treatAsSeries: true,
      metadata: {
        coveredByBookingId: 'b-primary',
        sessionPrice: 1_500,
        refundChannel: 'wallet_closed_loop',
      },
    })
    expect(decision).toEqual({ action: 'credit', amount: 1_500, reason: 'wallet_path_shortfall' })
    expect(classifyHistoricalRefundBucket({
      decision,
      method: 'IPG',
      paymentAmount: 0,
      bookingStatus: 'CANCELLED',
      metadata: { coveredByBookingId: 'b-primary' },
      owedAmount: owed,
      creditedAmount: 0,
      primaryPaymentStatus: 'PAID',
      isSeriesSiblingRow: true,
    })).toBe('series_gap')
  })
})
