/**
 * Wallet + IPG split checkout: debit available wallet for part of the price,
 * charge the remainder on the gateway. Metadata on the IPG payment links the rails.
 */

export type UseWalletMode = 'full' | 'partial' | false

export function normalizeUseWallet(raw: unknown): UseWalletMode {
  if (raw === 'partial') return 'partial'
  if (raw === 'full' || raw === true || raw === 'true' || raw === 1) return 'full'
  return false
}

/** True when balance can pay some but not all of the price (split eligible). */
export function canSplitPayWithWallet(balance: number, amount: number): boolean {
  const b = Math.floor(Number(balance) || 0)
  const a = Math.floor(Number(amount) || 0)
  return a > 0 && b > 0 && b < a
}

export function splitPayParts(balance: number, amount: number): {
  walletPart: number
  ipgPart: number
} {
  const a = Math.max(0, Math.floor(Number(amount) || 0))
  const b = Math.max(0, Math.floor(Number(balance) || 0))
  const walletPart = Math.min(b, a)
  return { walletPart, ipgPart: Math.max(0, a - walletPart) }
}

export function readSplitPayMeta(meta: Record<string, unknown>): {
  splitPay: boolean
  walletDebitAmount: number
  splitFullAmount: number
  walletDebitReleased?: boolean
} | null {
  if (meta.splitPay !== true) return null
  const walletDebitAmount = Math.max(0, Math.floor(Number(meta.walletDebitAmount) || 0))
  const splitFullAmount = Math.max(
    0,
    Math.floor(Number(meta.splitFullAmount) || 0)
      || (walletDebitAmount + Math.floor(Number(meta.ipgChargeAmount) || 0)),
  )
  return {
    splitPay: true,
    walletDebitAmount,
    splitFullAmount,
    ...(meta.walletDebitReleased === true ? { walletDebitReleased: true as const } : {}),
  }
}
