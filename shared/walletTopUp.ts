/** Wallet top-up amounts (toman). Same online pipeline as court checkout. */
export const WALLET_TOPUP_PRESETS_IRR = [200_000, 500_000, 1_000_000, 2_000_000] as const

export const WALLET_TOPUP_MIN_IRR = 50_000
export const WALLET_TOPUP_MAX_IRR = 20_000_000

export function normalizeWalletTopUpAmount(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  const amount = Math.round(n)
  if (amount < WALLET_TOPUP_MIN_IRR || amount > WALLET_TOPUP_MAX_IRR) return null
  return amount
}

export function isWalletTopUpPayment(payment: { purpose?: string | null }): boolean {
  return payment.purpose === 'topup'
}

/** Pure gate for idempotent top-up credit (mirrors creditWalletForTopUpPayment). */
export function shouldCreditTopUp(opts: {
  previousStatus: string
  purpose?: string | null
  status?: string | null
  userId?: string | null
  alreadyCredited: boolean
}): boolean {
  if (opts.previousStatus === 'PAID') return false
  if (opts.purpose !== 'topup' || opts.status !== 'PAID') return false
  if (!opts.userId) return false
  if (opts.alreadyCredited) return false
  return true
}

/** MVP spend rule: wallet covers full booking amount or pay fully online — no split. */
export function canCoverBookingWithWallet(balance: number, amount: number): boolean {
  return amount > 0 && balance >= amount
}

/**
 * Bank-withdrawable amount: cash-backed settlement nets only, capped by balance.
 * Clawback amounts are negative; athlete top-up/refund/prize are excluded by not summing them.
 * Pass only cashout-eligible settlement credits (day after class); clawbacks always included.
 */
export function computeWithdrawableBalance(
  balance: number,
  settlementCreditSum: number,
  settlementClawbackSum: number,
) {
  if (!Number.isFinite(balance) || balance <= 0) return 0
  const settlementNet = (settlementCreditSum || 0) + (settlementClawbackSum || 0)
  return Math.max(0, Math.min(balance, settlementNet))
}
