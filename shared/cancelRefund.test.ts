import { describe, expect, it } from 'vitest'
import {
  buildCancelRefundMetadata,
  buildDeskCashReturnedMetadata,
  buildManualBankRefundReturnedMetadata,
  isManualBankRefundOwed,
  readDeskCashReturn,
  readManualBankRefund,
  resolveRefundChannel,
} from './cancelRefund.ts'

describe('cancelRefund metadata', () => {
  it('maps CASH to desk_cash and IPG/wallet to closed-loop', () => {
    expect(resolveRefundChannel('CASH')).toBe('desk_cash')
    expect(resolveRefundChannel('IPG')).toBe('wallet_closed_loop')
    expect(resolveRefundChannel('PAID')).toBe('wallet_closed_loop')
  })

  it('uses booking paymentMethod when the payment row drifted from desk cash', () => {
    expect(resolveRefundChannel(null, 'CASH')).toBe('desk_cash')
    expect(resolveRefundChannel('NOT_PAID', 'CASH')).toBe('desk_cash')
    expect(resolveRefundChannel('IPG', 'CASH')).toBe('wallet_closed_loop')
  })

  it('marks desk cash refund as owed until owner acks', () => {
    const meta = buildCancelRefundMetadata({}, {
      channel: 'desk_cash',
      reason: 'owner-cancel',
      now: new Date('2026-10-31T12:00:00.000Z'),
    })
    expect(meta.refundChannel).toBe('desk_cash')
    expect(meta.deskCashReturn).toBe('owed')
    expect(meta.gatewayReversed).toBe(false)
    expect(readDeskCashReturn(meta)).toBe('owed')
  })

  it('closed-loop wallet refund never claims gateway reverse', () => {
    const meta = buildCancelRefundMetadata({ refNum: '99' }, {
      channel: 'wallet_closed_loop',
      reason: 'athlete-cancel',
    })
    expect(meta.refundChannel).toBe('wallet_closed_loop')
    expect(meta.gatewayReversed).toBe(false)
    expect(meta.deskCashReturn).toBeUndefined()
  })

  it('ack marks desk cash returned', () => {
    const meta = buildDeskCashReturnedMetadata(
      { deskCashReturn: 'owed', refundChannel: 'desk_cash' },
      { now: new Date('2026-10-31T13:00:00.000Z'), note: 'handed back at desk' },
    )
    expect(readDeskCashReturn(meta)).toBe('returned')
    expect(meta.deskCashReturnedAt).toBe('2026-10-31T13:00:00.000Z')
  })

  it('guest IPG manual refund is owed until admin acks', () => {
    const meta = buildCancelRefundMetadata({}, {
      channel: 'wallet_closed_loop',
      reason: 'owner-cancel',
      manualRefund: true,
    })
    expect(meta.manualRefundRequired).toBe(true)
    expect(readManualBankRefund(meta)).toBe('owed')
    expect(isManualBankRefundOwed(meta)).toBe(true)
    const done = buildManualBankRefundReturnedMetadata(meta, {
      now: new Date('2026-11-02T12:00:00.000Z'),
      note: 'wired',
      guestSheba: 'IR060170000000000000000001',
    })
    expect(readManualBankRefund(done)).toBe('returned')
    expect(isManualBankRefundOwed(done)).toBe(false)
  })
})
