import { describe, expect, it } from 'vitest'
import { athleteCancelErrorNoticeKey, athleteCancelNoticeKey } from './cancelNotice.ts'
import { ordinaryCancelRefundGuard } from './cancelRefund.ts'

describe('ordinaryCancelRefundGuard', () => {
  it('lets a normal online payment proceed to the wallet', () => {
    expect(ordinaryCancelRefundGuard({ confirmedAt: new Date().toISOString(), refNum: 'R' })).toEqual({ action: 'proceed' })
  })

  it('blocks a pending bank reverse from also crediting the wallet', () => {
    expect(ordinaryCancelRefundGuard({ reversePending: true })).toEqual({ action: 'reverse_pending' })
  })

  it('treats an already reversed card as not payable again', () => {
    expect(ordinaryCancelRefundGuard({ gatewayReversed: true })).toEqual({ action: 'already_reversed' })
    expect(ordinaryCancelRefundGuard({ gatewayRefund: true, reversePending: true })).toEqual({ action: 'already_reversed' })
  })
})

describe('athleteCancelNoticeKey', () => {
  it('credits the wallet and does not describe a card reverse', () => {
    expect(athleteCancelNoticeKey({
      moneyOutcome: 'full_wallet_refund',
      walletCredited: true,
      refunded: true,
      refundChannel: 'wallet_closed_loop',
    })).toBe('booking.refundToWallet')
  })

  it('does not claim a wallet credit for a partial that was not credited', () => {
    expect(athleteCancelNoticeKey({
      moneyOutcome: 'partial_wallet_refund',
      walletCredited: false,
      refunded: false,
    })).toBeNull()
  })

  it('sends cash back to the club, not the wallet', () => {
    expect(athleteCancelNoticeKey({
      refunded: true,
      walletCredited: false,
      refundChannel: 'desk_cash',
      deskCashReturn: 'owed',
    })).toBe('booking.refundCashAtClub')
  })

  it('does not claim a new refund when the card was already reversed', () => {
    expect(athleteCancelNoticeKey({
      refunded: true,
      walletCredited: false,
      gatewayRefunded: true,
      refundChannel: 'gateway_reverse',
    })).toBe('booking.refundAlreadyOnCard')
  })

  it('says the bank outcome is still unknown', () => {
    expect(athleteCancelNoticeKey({ reversePending: true, refunded: false })).toBe('booking.refundReversePending')
    expect(athleteCancelErrorNoticeKey('SEP_REVERSE_PENDING')).toBe('booking.refundReversePending')
    expect(athleteCancelErrorNoticeKey('REFUND_ACCOUNT_REQUIRED')).toBe('booking.refundAccountRequired')
  })

  it('does not call a guest manual refund a wallet credit', () => {
    expect(athleteCancelNoticeKey({
      refunded: true,
      walletCredited: false,
      refundChannel: 'wallet_closed_loop',
    })).toBe('booking.refundManualPending')
  })

  it('says nothing came back inside the cancellation window', () => {
    expect(athleteCancelNoticeKey({ moneyOutcome: 'zero_refund' })).toBe('booking.refundNoneCancelled')
  })
})
