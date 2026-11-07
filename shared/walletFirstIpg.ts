import { readSplitPayMeta } from './splitPay.ts'

/**
 * Card toman that actually arrived on this IPG row.
 * After split promotion, Payment.amount is the full court price and the card
 * share is ipgChargeAmount. The wallet share already has its own PAYMENT_DEBIT.
 */
export function ipgCapturedToman(amount: number, metadata: Record<string, unknown>): number {
  const full = Math.max(0, Math.floor(Number(amount) || 0))
  const explicit = Math.floor(Number(metadata.ipgChargeAmount))
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(explicit, full || explicit)
  const split = readSplitPayMeta(metadata)
  if (!split) return full
  if (split.splitFullAmount > full) return full
  if (split.walletDebitAmount > 0 && split.splitFullAmount === full) {
    return Math.max(0, full - split.walletDebitAmount)
  }
  return full
}

export type WalletFirstOwner =
  | { ok: true; userId: string }
  | { ok: false; reason: 'no_account' | 'owner_mismatch' }

/** Payment user and booking user must be the same person when both are set. */
export function resolveWalletFirstOwner(
  paymentUserId: string | null | undefined,
  bookingUserId: string | null | undefined,
): WalletFirstOwner {
  const paymentUser = paymentUserId?.trim() || null
  const bookingUser = bookingUserId?.trim() || null
  if (paymentUser && bookingUser && paymentUser !== bookingUser) {
    return { ok: false, reason: 'owner_mismatch' }
  }
  const userId = paymentUser || bookingUser
  if (!userId) return { ok: false, reason: 'no_account' }
  return { ok: true, userId }
}

export type WalletFirstLivePlan =
  | { action: 'pair'; userId: string; amount: number }
  | { action: 'skip'; reason: 'topup' | 'cash' | 'not_ipg' | 'zero_capture' }
  | { action: 'unresolved'; reason: 'no_account' | 'owner_mismatch' }

export function planLiveWalletFirstIpg(input: {
  purpose?: string | null
  method?: string | null
  provider?: string | null
  amount: number
  metadata: Record<string, unknown>
  paymentUserId?: string | null
  bookingUserId?: string | null
}): WalletFirstLivePlan {
  if (input.purpose === 'topup') return { action: 'skip', reason: 'topup' }
  if (input.method === 'CASH') return { action: 'skip', reason: 'cash' }
  const ipg = input.method === 'IPG' || input.provider === 'sep'
  if (!ipg) return { action: 'skip', reason: 'not_ipg' }
  const amount = ipgCapturedToman(input.amount, input.metadata)
  if (amount <= 0) return { action: 'skip', reason: 'zero_capture' }
  const owner = resolveWalletFirstOwner(input.paymentUserId, input.bookingUserId)
  if (!owner.ok) return { action: 'unresolved', reason: owner.reason }
  return { action: 'pair', userId: owner.userId, amount }
}
