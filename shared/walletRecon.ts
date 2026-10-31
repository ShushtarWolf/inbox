/**
 * Pure balance reconciliation helpers.
 * Stored wallet counters must match Σ(transactions); drift means a money bug.
 */

export type WalletTxLike = {
  amount: number
  type: string
}

/** Net effect of a wallet tx on total balance (not available/locked split). */
export function walletTxBalanceDelta(tx: WalletTxLike): number {
  // WITHDRAW_HOLD / WITHDRAW_RELEASE / LOCK / UNLOCK move available↔locked; total unchanged.
  // WITHDRAW_PAID stores amount 0 and consumes via locked/balance decrement outside the signed amount.
  if (
    tx.type === 'WITHDRAW_HOLD'
    || tx.type === 'WITHDRAW_RELEASE'
    || tx.type === 'LOCK'
    || tx.type === 'UNLOCK'
    || tx.type === 'WITHDRAW_PAID'
  ) {
    return 0
  }
  return tx.amount
}

/**
 * Expected total balance from ledger rows.
 * Credits are positive amounts; debits (PAYMENT_DEBIT, clawbacks) are negative amounts.
 * Withdraw-paid is tracked separately (amount 0 rows) — pass `withdrawPaidConsumed` for those.
 */
export function expectedWalletBalanceFromTxs(
  txs: WalletTxLike[],
  withdrawPaidConsumed = 0,
): number {
  const signed = txs.reduce((sum, tx) => sum + walletTxBalanceDelta(tx), 0)
  return signed - Math.max(0, withdrawPaidConsumed)
}

export function walletBalanceDrift(opts: {
  storedBalance: number
  txs: WalletTxLike[]
  /** Absolute toman removed via WITHDRAW_PAID (consumeWalletLocked). */
  withdrawPaidConsumed?: number
}): number {
  const expected = expectedWalletBalanceFromTxs(opts.txs, opts.withdrawPaidConsumed ?? 0)
  return opts.storedBalance - expected
}
