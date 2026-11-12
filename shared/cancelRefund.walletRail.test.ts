import { describe, expect, it } from 'vitest'
import {
  netWalletRailAmount,
  ordinaryCancelRefundGuard,
  resolveRefundCreditUserId,
  walletCheckoutClaimMetadata,
} from './cancelRefund.ts'

describe('wallet-rail cancel refund helpers', () => {
  it('full wallet checkout ignores leftover gateway flags', () => {
    const stale = { gatewayReversed: true, gatewayRefund: true, reversePending: true }
    expect(ordinaryCancelRefundGuard(stale, { method: 'PAID' })).toEqual({ action: 'proceed' })
  })

  it('IPG rows still honor historical reverse and pending flags', () => {
    expect(ordinaryCancelRefundGuard({ gatewayReversed: true }, { method: 'IPG' })).toEqual({ action: 'already_reversed' })
    expect(ordinaryCancelRefundGuard({ reversePending: true }, { method: 'IPG' })).toEqual({ action: 'reverse_pending' })
    expect(ordinaryCancelRefundGuard({ reversePending: true })).toEqual({ action: 'reverse_pending' })
  })

  it('wallet claim strips stale gateway keys, keeps the rest, records the payer', () => {
    const now = new Date('2026-11-12T17:00:00.000Z')
    const out = walletCheckoutClaimMetadata(
      { receiptToken: 'tok', discountCode: 'X', gatewayReversed: true, reversePending: false, gatewayCaptured: true },
      { userId: 'u1', now },
    )
    expect(out.receiptToken).toBe('tok')
    expect(out.discountCode).toBe('X')
    expect(out.gatewayReversed).toBeUndefined()
    expect(out.reversePending).toBeUndefined()
    expect(out.gatewayCaptured).toBeUndefined()
    expect(out.walletCheckout).toBe(true)
    expect(out.walletUserId).toBe('u1')
    expect(out.walletPaidAt).toBe(now.toISOString())
    expect(out.walletCheckoutDroppedGatewayKeys).toEqual(['gatewayReversed', 'reversePending', 'gatewayCaptured'])
  })

  it('refund goes to the debited wallet first', () => {
    expect(resolveRefundCreditUserId({
      debitedWalletUserId: 'payer',
      explicitUserId: 'booking-now',
      paymentUserId: 'p',
      bookingUserId: 'b',
    })).toBe('payer')
    expect(resolveRefundCreditUserId({ explicitUserId: null, paymentUserId: null, bookingUserId: 'b' })).toBe('b')
    expect(resolveRefundCreditUserId({})).toBeNull()
  })

  it('nets only booking-rail wallet rows', () => {
    expect(netWalletRailAmount([
      { type: 'PAYMENT_DEBIT', amount: -5000 },
      { type: 'REFUND_CREDIT', amount: 5000 },
      { type: 'TOPUP_CREDIT', amount: 52000 },
    ])).toBe(0)
    expect(netWalletRailAmount([{ type: 'PAYMENT_DEBIT', amount: -5000 }])).toBe(-5000)
    expect(netWalletRailAmount([
      { type: 'IPG_BOOKING_CREDIT', amount: 5000 },
      { type: 'IPG_BOOKING_DEBIT', amount: -5000 },
      { type: 'REFUND_CREDIT', amount: 5000 },
    ])).toBe(5000)
  })
})
