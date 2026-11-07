import { parsePaymentMetadata } from './cancelRefund.ts'

/**
 * A bank ref is in play (verify started, capture bound, or reverse not finished).
 * Failing the row, expiring it, or superseding it would drop that ref or return
 * the wallet share while the card capture can still complete.
 */
export function shouldPreserveUnsettledCapture(payment: {
  gatewayRef?: string | null
  metadataJson?: string | null
}): boolean {
  if (payment.gatewayRef) return true
  const meta = parsePaymentMetadata(payment.metadataJson)
  if (meta.reversePending === true) return true
  if (meta.gatewayCaptured === true) return true
  const pendingRef = meta.verifyPendingRefNum
  return typeof pendingRef === 'string' && pendingRef.trim().length > 0
}

/** Card capture was reversed and the row may be replaced by a new checkout. */
export function isReversedCaptureReadyToReplace(metadataJson: string | null | undefined): boolean {
  const meta = parsePaymentMetadata(metadataJson)
  return meta.gatewayReversed === true && meta.reversePending !== true
}
