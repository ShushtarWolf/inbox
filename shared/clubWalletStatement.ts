/**
 * Owner-facing club online wallet statement (IPG + athlete wallet settlements).
 * Cash desk is a separate book — never mixed here.
 */

/** Types that belong on the Snapp-style گردش حساب. Internal lock/unlock mechanics stay hidden. */
export const CLUB_WALLET_STATEMENT_TYPES = [
  'BOOKING_CREDIT',
  'CLAWBACK',
  'WITHDRAW_HOLD',
  'WITHDRAW_RELEASE',
  'WITHDRAW_PAID',
  'ADJUSTMENT',
  'INTERNAL_TRANSFER_OUT',
  'INTERNAL_TRANSFER_IN',
] as const

export type ClubWalletStatementType = (typeof CLUB_WALLET_STATEMENT_TYPES)[number]

export function isClubWalletStatementType(type: string): type is ClubWalletStatementType {
  return (CLUB_WALLET_STATEMENT_TYPES as readonly string[]).includes(type)
}

/**
 * Signed amount for the statement row.
 * WITHDRAW_PAID rows store amount 0 while balance drops by the request amount — pass that in.
 * WITHDRAW_HOLD / RELEASE move available↔locked only — show signed amount for clarity but
 * they do not change wallet.balance (see balanceDelta).
 */
export function clubWalletStatementSignedAmount(row: {
  type: string
  amount: number
  withdrawAmount?: number | null
}): number {
  if (row.type === 'WITHDRAW_PAID') {
    const n = Number(row.withdrawAmount)
    return Number.isFinite(n) && n > 0 ? -Math.trunc(n) : 0
  }
  if (row.type === 'WITHDRAW_HOLD') {
    const n = Math.abs(Number(row.amount) || 0)
    return n ? -n : 0
  }
  if (row.type === 'WITHDRAW_RELEASE') {
    const n = Math.abs(Number(row.amount) || 0)
    return n
  }
  return Number(row.amount) || 0
}

/** How this row changed ClubWallet.balance (for running balanceAfter). */
export function clubWalletBalanceDelta(row: {
  type: string
  amount: number
  withdrawAmount?: number | null
}): number {
  if (row.type === 'WITHDRAW_HOLD' || row.type === 'WITHDRAW_RELEASE' || row.type === 'LOCK' || row.type === 'UNLOCK') {
    return 0
  }
  if (row.type === 'WITHDRAW_PAID') {
    const n = Number(row.withdrawAmount)
    return Number.isFinite(n) && n > 0 ? -Math.trunc(n) : 0
  }
  return Number(row.amount) || 0
}

/**
 * Walk newest→oldest and attach balanceAfter = wallet balance immediately after each row.
 * `cursorBalance` is the live ClubWallet.balance.
 */
export function attachClubWalletBalanceAfter<T extends {
  type: string
  amount: number
  withdrawAmount?: number | null
}>(rowsNewestFirst: T[], cursorBalance: number): Array<T & { balanceAfter: number }> {
  let cursor = Number(cursorBalance) || 0
  const out: Array<T & { balanceAfter: number }> = []
  for (const row of rowsNewestFirst) {
    out.push({ ...row, balanceAfter: cursor })
    cursor -= clubWalletBalanceDelta(row)
  }
  return out
}
