import { describe, expect, it } from 'vitest'
import { decideHistoricalCancelRefund, historicalRefundIdempotencyKey } from './historicalRefundRepair.ts'

const base = {
  method: 'IPG' as const,
  paymentStatus: 'REFUNDED',
  bookingStatus: 'CANCELLED',
  amount: 100_000,
  userId: 'user-1',
  refundCreditSum: 0,
  metadata: { refundChannel: 'wallet_closed_loop', refundCreditAmount: 100_000 },
}

describe('decideHistoricalCancelRefund', () => {
  it('credits a proven wallet-path shortfall once', () => {
    expect(decideHistoricalCancelRefund(base)).toEqual({
      action: 'credit',
      amount: 100_000,
      reason: 'wallet_path_shortfall',
    })
    expect(decideHistoricalCancelRefund({ ...base, refundCreditSum: 40_000 })).toEqual({
      action: 'credit',
      amount: 60_000,
      reason: 'wallet_path_shortfall',
    })
    expect(decideHistoricalCancelRefund({ ...base, refundCreditSum: 100_000 })).toEqual({
      action: 'skip',
      reason: 'already_credited',
    })
  })

  it('does not credit cash, card reversals, pending bank outcomes, or unknown IPG rows', () => {
    expect(decideHistoricalCancelRefund({ ...base, method: 'CASH' }).reason).toBe('cash_club_responsibility')
    expect(decideHistoricalCancelRefund({
      ...base,
      metadata: { gatewayReversed: true, refundChannel: 'gateway_reverse' },
    })).toEqual({ action: 'skip', reason: 'card_already_reversed' })
    expect(decideHistoricalCancelRefund({
      ...base,
      metadata: { reversePending: true, refNum: 'R' },
    })).toEqual({ action: 'unresolved', reason: 'bank_outcome_pending' })
    expect(decideHistoricalCancelRefund({
      ...base,
      metadata: {},
    })).toEqual({ action: 'unresolved', reason: 'bank_outcome_unknown' })
  })

  it('does not invent an account from a missing user id', () => {
    expect(decideHistoricalCancelRefund({ ...base, userId: null })).toEqual({
      action: 'unresolved',
      reason: 'no_verified_account',
    })
  })

  it('after a card reverse, credits only an unreleased split wallet rail', () => {
    expect(decideHistoricalCancelRefund({
      ...base,
      metadata: {
        gatewayReversed: true,
        splitPay: true,
        walletDebitAmount: 30_000,
        splitFullAmount: 100_000,
      },
    })).toEqual({
      action: 'credit',
      amount: 30_000,
      reason: 'split_wallet_rail_after_card_reverse',
    })
    expect(decideHistoricalCancelRefund({
      ...base,
      metadata: {
        gatewayReversed: true,
        splitPay: true,
        walletDebitAmount: 30_000,
        walletDebitReleased: true,
      },
    }).reason).toBe('card_already_reversed')
  })

  it('skips when the stable reconciliation key already exists', () => {
    expect(decideHistoricalCancelRefund({ ...base, alreadyReconciled: true }).reason).toBe('already_reconciled')
    expect(historicalRefundIdempotencyKey('pay-1')).toBe('recon:historical-cancel:pay-1')
  })

  it('credits a wallet-spend cancel that never wrote a refund credit', () => {
    expect(decideHistoricalCancelRefund({
      ...base,
      method: 'PAID',
      paymentStatus: 'PAID',
      metadata: {},
    })).toEqual({ action: 'credit', amount: 100_000, reason: 'wallet_spend_shortfall' })
  })
})
