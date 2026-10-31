import { describe, expect, it } from 'vitest'
import { expectedWalletBalanceFromTxs, walletBalanceDrift, walletTxBalanceDelta } from './walletRecon.ts'

describe('walletRecon', () => {
  it('ignores lock/hold/unlock for total balance', () => {
    expect(walletTxBalanceDelta({ type: 'WITHDRAW_HOLD', amount: 100 })).toBe(0)
    expect(walletTxBalanceDelta({ type: 'UNLOCK', amount: 50 })).toBe(0)
    expect(walletTxBalanceDelta({ type: 'TOPUP_CREDIT', amount: 200 })).toBe(200)
    expect(walletTxBalanceDelta({ type: 'PAYMENT_DEBIT', amount: -80 })).toBe(-80)
  })

  it('detects drift when stored balance disagrees with ledger', () => {
    const txs = [
      { type: 'TOPUP_CREDIT', amount: 500_000 },
      { type: 'PAYMENT_DEBIT', amount: -200_000 },
      { type: 'REFUND_CREDIT', amount: 200_000 },
    ]
    expect(expectedWalletBalanceFromTxs(txs)).toBe(500_000)
    expect(walletBalanceDrift({ storedBalance: 500_000, txs })).toBe(0)
    expect(walletBalanceDrift({ storedBalance: 600_000, txs })).toBe(100_000)
  })

  it('subtracts withdraw-paid consumption', () => {
    const txs = [
      { type: 'SETTLEMENT_CREDIT', amount: 900_000 },
      { type: 'WITHDRAW_HOLD', amount: 900_000 },
      { type: 'WITHDRAW_PAID', amount: 0 },
    ]
    expect(expectedWalletBalanceFromTxs(txs, 900_000)).toBe(0)
    expect(walletBalanceDrift({ storedBalance: 0, txs, withdrawPaidConsumed: 900_000 })).toBe(0)
  })
})
