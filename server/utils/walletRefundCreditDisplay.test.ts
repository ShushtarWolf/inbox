import { describe, expect, it } from 'vitest'
import { enrichWalletRefundCreditTx } from './walletRefundCreditDisplay.ts'

describe('enrichWalletRefundCreditTx', () => {
  it('attaches refundBooking and channel for REFUND_CREDIT', () => {
    const tx = {
      id: 'wt1',
      type: 'REFUND_CREDIT',
      paymentId: 'pay1',
      bookingId: 'b1',
      amount: 1500,
    }
    const enriched = enrichWalletRefundCreditTx(
      tx,
      { pay1: JSON.stringify({ refundChannel: 'wallet_closed_loop' }) },
      { b1: { date: '2026-11-10', startTime: '18:00', courtName: 'C1', clubName: 'Club' } },
    )
    expect(enriched.refundBooking).toEqual({
      date: '2026-11-10',
      startTime: '18:00',
      courtName: 'C1',
      clubName: 'Club',
    })
    expect(enriched.refundChannelKey).toBe('athlete.refundChannelWallet')
  })

  it('passes through non-refund rows', () => {
    const tx = { id: 'wt2', type: 'TOPUP_CREDIT', amount: 1000 }
    expect(enrichWalletRefundCreditTx(tx, {}, {})).toBe(tx)
  })
})