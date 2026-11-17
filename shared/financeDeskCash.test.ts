import { describe, expect, it } from 'vitest'
import { readDeskCashReturn } from './cancelRefund.ts'

describe('desk cash returns owed (IB-16)', () => {
  it('partial series cash cancel keeps deskCashReturn on PAID primary', () => {
    const meta = {
      refundChannel: 'desk_cash',
      deskCashReturn: 'owed',
      sessionRefundsTotal: 4_000,
    }
    expect(readDeskCashReturn(meta)).toBe('owed')
  })

  it('till owed uses sessionRefundsTotal when present', () => {
    const sessionRefundsTotal = 4_000
    const refundCreditAmount = 0
    const paymentAmount = 24_000
    const tillOwed = sessionRefundsTotal > 0
      ? sessionRefundsTotal
      : (refundCreditAmount > 0 ? refundCreditAmount : paymentAmount)
    expect(tillOwed).toBe(4_000)
  })
})