/**
 * Athlete-facing cancel result. Never claims a wallet credit that did not happen.
 * Withdrawal to a bank account is a separate action and is not started here.
 */
export type AthleteCancelNoticeInput = {
  moneyOutcome?: 'full_wallet_refund' | 'partial_wallet_refund' | 'zero_refund' | string | null
  walletCredited?: boolean
  refunded?: boolean
  gatewayRefunded?: boolean
  refundChannel?: 'wallet_closed_loop' | 'desk_cash' | 'gateway_reverse' | string | null
  reversePending?: boolean
  deskCashReturn?: 'owed' | 'returned' | string | null
}

export type AthleteCancelNoticeKey =
  | 'booking.refundNoneCancelled'
  | 'booking.refundToWallet'
  | 'booking.refundCashAtClub'
  | 'booking.refundReversePending'
  | 'booking.refundAlreadyOnCard'
  | 'booking.refundManualPending'
  | 'booking.refundAccountRequired'

export function athleteCancelNoticeKey(input: AthleteCancelNoticeInput): AthleteCancelNoticeKey | null {
  if (input.reversePending) return 'booking.refundReversePending'
  if (input.moneyOutcome === 'zero_refund') return 'booking.refundNoneCancelled'
  if (input.deskCashReturn === 'owed' || input.refundChannel === 'desk_cash') {
    return 'booking.refundCashAtClub'
  }
  if (input.walletCredited) return 'booking.refundToWallet'
  if (input.gatewayRefunded || input.refundChannel === 'gateway_reverse') {
    return 'booking.refundAlreadyOnCard'
  }
  if (input.refunded) return 'booking.refundManualPending'
  return null
}

/** Map a thrown cancel error onto copy. Unknown errors stay with the caller. */
export function athleteCancelErrorNoticeKey(message: string | null | undefined): AthleteCancelNoticeKey | null {
  if (!message) return null
  if (message.includes('SEP_REVERSE_PENDING')) return 'booking.refundReversePending'
  if (message.includes('REFUND_ACCOUNT_REQUIRED')) return 'booking.refundAccountRequired'
  return null
}
