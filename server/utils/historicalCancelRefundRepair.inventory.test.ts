import { describe, expect, it } from 'vitest'
import { resolveInventoryWalletDebitAbs } from './historicalCancelRefundRepair.ts'

describe('inventoryHistoricalCancelRefunds wallet debit map', () => {
  it('reads debit abs amounts, never payer user ids', () => {
    const debits = {
      abs: new Map([['pay-primary', 360_000], ['pay-sib', 0]]),
    }
    expect(resolveInventoryWalletDebitAbs({
      decidePaymentId: 'pay-primary',
      rowId: 'pay-sib',
      debits,
    })).toBe(360_000)
    expect(resolveInventoryWalletDebitAbs({
      decidePaymentId: 'pay-sib',
      rowId: 'pay-sib',
      debits,
    })).toBe(0)
  })
})