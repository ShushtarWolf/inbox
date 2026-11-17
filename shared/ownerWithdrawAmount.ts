export type OwnerWithdrawAmountIssue = 'invalid' | 'over'

/**
 * Client-side owner withdraw amount validation (club payout tab).
 * Empty / unset input is not an error until the user enters a value.
 */
export function ownerWithdrawAmountIssue(
  amount: number | null | undefined,
  withdrawable: number,
): OwnerWithdrawAmountIssue | null {
  if (amount == null || amount === ('' as unknown)) return null
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return 'invalid'
  const cap = Number.isFinite(withdrawable) ? withdrawable : 0
  if (n > cap) return 'over'
  return null
}