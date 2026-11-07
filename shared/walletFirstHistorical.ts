import { decideHistoricalCancelRefund, type HistoricalRefundDecision } from './historicalRefundRepair.ts'
import { ipgCapturedToman, resolveWalletFirstOwner } from './walletFirstIpg.ts'

export const WALLET_FIRST_INFLOW_NOTE = 'wallet-first:ipg-inflow'
export const WALLET_FIRST_BOOKING_DEBIT_NOTE = 'wallet-first:booking-debit'
export const WALLET_FIRST_CARD_RETURN_NOTE = 'wallet-first:card-return'

export type WalletTxSlice = {
  type: string
  amount: number
}

export type WalletFirstHistoricalInput = {
  paymentId: string
  method?: string | null
  provider?: string | null
  purpose?: string | null
  paymentStatus?: string | null
  bookingStatus?: string | null
  bookingPaymentMethod?: string | null
  amount: number
  paymentUserId?: string | null
  bookingUserId?: string | null
  metadata: Record<string, unknown>
  /** Existing wallet rows for this payment. Amounts keep their sign. */
  walletTxs: WalletTxSlice[]
  refundCreditSum: number
  alreadyRefundReconciled?: boolean
  /** Settlement ownerNet still not clawed. Reported only. Never taken from a club-wide sum. */
  unclawedOwnerNet?: number | null
}

export type ReconstructionPlan =
  | {
      action: 'pair'
      kind: 'booking_ledger' | 'card_returned'
      userId: string
      amount: number
      creditType: 'IPG_BOOKING_CREDIT'
      debitType: 'IPG_BOOKING_DEBIT' | 'IPG_RETURNED_TO_CARD'
      netWalletToman: 0
      netClubToman: 0
    }
  | {
      action: 'none'
      reason:
        | 'topup_preserved'
        | 'cash_not_ipg'
        | 'not_ipg'
        | 'not_captured'
        | 'zero_capture'
        | 'already_reconstructed'
        | 'no_account'
        | 'owner_mismatch'
        | 'existing_debit_without_inflow'
        | 'inflow_without_matching_outflow'
        | 'reversed_and_spendable_refund_both_present'
        | 'bank_outcome_unknown'
        | 'bank_outcome_pending'
    }

export type WalletFirstHistoricalPlan = {
  paymentId: string
  capturedToman: number
  reconstruction: ReconstructionPlan
  /** Balance-changing cancel credit. Reported separately. This planner does not apply it. */
  refundCorrection: HistoricalRefundDecision
  /** Club impact of the refund correction only. Reconstruction is always zero. */
  refundClubImpactToman: number
}

function absSum(txs: WalletTxSlice[], type: string): number {
  return txs
    .filter((tx) => tx.type === type)
    .reduce((sum, tx) => sum + Math.abs(Math.floor(Number(tx.amount) || 0)), 0)
}

function cardReversed(meta: Record<string, unknown>): boolean {
  return meta.gatewayReversed === true || meta.gatewayRefund === true
}

function bankPending(meta: Record<string, unknown>): boolean {
  return meta.reversePending === true && meta.gatewayReversed !== true && meta.gatewayRefund !== true
}

function isIpg(input: WalletFirstHistoricalInput): boolean {
  return input.method === 'IPG' || (input.provider === 'sep' && input.method !== 'CASH' && input.method !== 'PAID')
}

function capturedEnough(have: number, captured: number): boolean {
  return have >= captured && captured > 0
}

export function planWalletFirstHistorical(input: WalletFirstHistoricalInput): WalletFirstHistoricalPlan {
  const captured = ipgCapturedToman(input.amount, input.metadata)
  const owner = resolveWalletFirstOwner(input.paymentUserId, input.bookingUserId)
  const refundCorrection = decideHistoricalCancelRefund({
    method: input.method,
    bookingPaymentMethod: input.bookingPaymentMethod,
    paymentStatus: input.paymentStatus,
    bookingStatus: input.bookingStatus,
    amount: input.amount,
    userId: owner.ok ? owner.userId : null,
    metadata: input.metadata,
    refundCreditSum: input.refundCreditSum,
    alreadyReconciled: input.alreadyRefundReconciled,
  })
  const refundClubImpactToman = refundCorrection.action === 'credit'
    ? -Math.max(0, Math.floor(input.unclawedOwnerNet || 0))
    : 0

  const base = {
    paymentId: input.paymentId,
    capturedToman: captured,
    refundCorrection,
    refundClubImpactToman,
  }

  if (input.purpose === 'topup') {
    return { ...base, reconstruction: { action: 'none', reason: 'topup_preserved' } }
  }
  if (input.method === 'CASH' || input.bookingPaymentMethod === 'CASH') {
    return { ...base, reconstruction: { action: 'none', reason: 'cash_not_ipg' } }
  }
  if (!isIpg(input)) {
    return { ...base, reconstruction: { action: 'none', reason: 'not_ipg' } }
  }
  const capturedStatus = input.paymentStatus === 'PAID' || input.paymentStatus === 'REFUNDED'
  if (!capturedStatus) {
    return { ...base, reconstruction: { action: 'none', reason: 'not_captured' } }
  }
  if (captured <= 0) {
    return { ...base, reconstruction: { action: 'none', reason: 'zero_capture' } }
  }

  if (!owner.ok) {
    return { ...base, reconstruction: { action: 'none', reason: owner.reason } }
  }

  const inflow = absSum(input.walletTxs, 'IPG_BOOKING_CREDIT')
  const bookingDebit = absSum(input.walletTxs, 'IPG_BOOKING_DEBIT')
  const cardReturn = absSum(input.walletTxs, 'IPG_RETURNED_TO_CARD')
  const spendableRefund = Math.max(0, Math.floor(input.refundCreditSum) || 0)
  const reversed = cardReversed(input.metadata)
  const pending = bankPending(input.metadata)

  if (pending && !reversed) {
    return { ...base, reconstruction: { action: 'none', reason: 'bank_outcome_pending' } }
  }

  if (reversed && spendableRefund > 0) {
    return { ...base, reconstruction: { action: 'none', reason: 'reversed_and_spendable_refund_both_present' } }
  }

  if (reversed) {
    if (capturedEnough(inflow, captured) && capturedEnough(cardReturn, captured)) {
      return { ...base, reconstruction: { action: 'none', reason: 'already_reconstructed' } }
    }
    if (capturedEnough(bookingDebit, captured) && capturedEnough(inflow, captured)) {
      return { ...base, reconstruction: { action: 'none', reason: 'already_reconstructed' } }
    }
    if ((inflow > 0 && inflow < captured) || (cardReturn > 0 && cardReturn < captured) || (inflow > 0 && cardReturn === 0 && bookingDebit === 0)) {
      return { ...base, reconstruction: { action: 'none', reason: 'inflow_without_matching_outflow' } }
    }
    return {
      ...base,
      reconstruction: {
        action: 'pair',
        kind: 'card_returned',
        userId: owner.userId,
        amount: captured,
        creditType: 'IPG_BOOKING_CREDIT',
        debitType: 'IPG_RETURNED_TO_CARD',
        netWalletToman: 0,
        netClubToman: 0,
      },
    }
  }

  const active = input.bookingStatus !== 'CANCELLED' && input.paymentStatus === 'PAID'
  const cancelProven = input.bookingStatus === 'CANCELLED' || input.paymentStatus === 'REFUNDED'
  if (!active && !cancelProven) {
    return { ...base, reconstruction: { action: 'none', reason: 'not_captured' } }
  }
  if (cancelProven && refundCorrection.action === 'unresolved' && refundCorrection.reason === 'bank_outcome_unknown') {
    return { ...base, reconstruction: { action: 'none', reason: 'bank_outcome_unknown' } }
  }

  if (capturedEnough(inflow, captured) && capturedEnough(bookingDebit, captured)) {
    return { ...base, reconstruction: { action: 'none', reason: 'already_reconstructed' } }
  }
  if (bookingDebit === 0 && inflow === 0 && absSum(input.walletTxs, 'PAYMENT_DEBIT') >= captured) {
    return { ...base, reconstruction: { action: 'none', reason: 'existing_debit_without_inflow' } }
  }
  if (inflow > 0 && !capturedEnough(bookingDebit, captured)) {
    return { ...base, reconstruction: { action: 'none', reason: 'inflow_without_matching_outflow' } }
  }
  if (bookingDebit > 0 && !capturedEnough(inflow, captured)) {
    return { ...base, reconstruction: { action: 'none', reason: 'existing_debit_without_inflow' } }
  }

  return {
    ...base,
    reconstruction: {
      action: 'pair',
        kind: 'booking_ledger',
      userId: owner.userId,
      amount: captured,
      creditType: 'IPG_BOOKING_CREDIT',
      debitType: 'IPG_BOOKING_DEBIT',
      netWalletToman: 0,
      netClubToman: 0,
    },
  }
}
