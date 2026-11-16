import { describe, expect, it } from 'vitest'
import {
  classifyHistoricalRefundBucket,
  isSeriesSiblingCancelRow,
  ipgNeedsOpsReview,
} from './historicalRefundInventory.ts'

describe('historicalRefundInventory buckets', () => {
  it('maps proven credit decisions to credit bucket', () => {
    expect(classifyHistoricalRefundBucket({
      decision: { action: 'credit', amount: 1_500, reason: 'wallet_path_shortfall' },
      method: 'IPG',
      paymentAmount: 9_000,
      metadata: { refundChannel: 'wallet_closed_loop' },
      owedAmount: 1_500,
      creditedAmount: 0,
    })).toBe('credit')
  })

  it('maps cash and already_credited to skip', () => {
    expect(classifyHistoricalRefundBucket({
      decision: { action: 'skip', reason: 'cash_club_responsibility' },
      method: 'CASH',
      paymentAmount: 50_000,
      metadata: {},
    })).toBe('skip')
    expect(classifyHistoricalRefundBucket({
      decision: { action: 'skip', reason: 'already_credited' },
      method: 'IPG',
      paymentAmount: 5_000,
      metadata: {},
    })).toBe('skip')
  })

  it('maps unresolved bank outcomes to review', () => {
    expect(classifyHistoricalRefundBucket({
      decision: { action: 'unresolved', reason: 'bank_outcome_unknown' },
      method: 'IPG',
      paymentAmount: 100_000,
      metadata: {},
    })).toBe('review')
  })

  it('flags IPG gateway-reverse metadata without wallet debit for review', () => {
    expect(ipgNeedsOpsReview({
      decision: { action: 'skip', reason: 'card_already_reversed' },
      method: 'IPG',
      paymentAmount: 80_000,
      metadata: { gatewayReversed: true },
      walletDebitAbs: 0,
    })).toBe(true)
    expect(classifyHistoricalRefundBucket({
      decision: { action: 'skip', reason: 'card_already_reversed' },
      method: 'IPG',
      paymentAmount: 80_000,
      metadata: { gatewayReversed: true },
      walletDebitAbs: 0,
    })).toBe('review')
  })

  it('detects series sibling cancel rows', () => {
    expect(isSeriesSiblingCancelRow({
      paymentAmount: 0,
      bookingStatus: 'CANCELLED',
      metadata: { coveredByBookingId: 'b-primary', sessionPrice: 1_500 },
    })).toBe(true)
  })

  it('puts sibling shortfall on primary into series_gap', () => {
    expect(classifyHistoricalRefundBucket({
      decision: { action: 'credit', amount: 1_500, reason: 'wallet_path_shortfall' },
      method: 'IPG',
      paymentAmount: 0,
      bookingStatus: 'CANCELLED',
      metadata: { coveredByBookingId: 'b-primary', sessionPrice: 1_500 },
      owedAmount: 1_500,
      creditedAmount: 0,
      primaryPaymentStatus: 'PAID',
      isSeriesSiblingRow: true,
    })).toBe('series_gap')
  })
})