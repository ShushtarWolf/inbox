import { refundChannelFromPaymentMetadata, refundChannelI18nKey } from '#shared/refundChannelLabel.ts'

export type WalletRefundBooking = {
  date: string
  startTime: string
  courtName?: string | null
  clubName?: string | null
}

export type WalletTxLike = {
  type?: string
  paymentId?: string | null
  bookingId?: string | null
  [key: string]: unknown
}

/** Attach refund channel label + booking slot context to REFUND_CREDIT rows. */
export function enrichWalletRefundCreditTx<T extends WalletTxLike>(
  tx: T,
  refundMetaByPayment: Record<string, string | null | undefined>,
  refundBookingById: Record<string, WalletRefundBooking>,
): T & { refundChannelKey?: string; refundBooking?: WalletRefundBooking } {
  if (tx.type !== 'REFUND_CREDIT') return tx
  const refundBooking = tx.bookingId ? refundBookingById[tx.bookingId] : undefined
  if (!tx.paymentId && !refundBooking) return tx
  const channel = tx.paymentId
    ? refundChannelFromPaymentMetadata(refundMetaByPayment[tx.paymentId])
    : 'wallet_closed_loop'
  const refundChannelKey = refundChannelI18nKey(channel)
  const base = refundChannelKey ? { ...tx, refundChannelKey } : { ...tx }
  return refundBooking ? { ...base, refundBooking } : base
}