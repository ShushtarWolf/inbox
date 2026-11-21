import { parseSeriesPaymentMeta, type SeriesPaymentMeta } from './athleteSeason.ts'

/** Anchor season primary from IB-47 (documented one-off). */
export const IB47_ANCHOR_PAYMENT_ID = 'cmwhw6oye00rsnr33m065fwhu'

/**
 * Series primary IPG still PAID with partial session refunds on metadata —
 * any remaining gap is settled only via IB-47 residual sweep, never IB-13 recon.
 */
export function isIb47ResidualCanonicalPrimary(input: {
  method: string
  status: string
  amount: number
  metadataJson?: string | null
}): boolean {
  if (input.method !== 'IPG') return false
  if (input.status !== 'PAID') return false
  if (input.amount <= 0) return false
  const meta = parseSeriesPaymentMeta(input.metadataJson)
  if (!meta.seasonBookingId) return false
  const sessionRefunds = Math.max(0, Math.floor(Number(meta.sessionRefundsTotal) || 0))
  return sessionRefunds > 0 && sessionRefunds < input.amount
}

export function proposedResidualOwed(input: {
  amount: number
  sessionRefundsTotal: number
  refundCreditSum: number
}): number {
  const credited = Math.max(0, Math.floor(input.refundCreditSum))
  return Math.max(0, Math.floor(input.amount) - credited)
}

/** Cap a proposed credit so total REFUND_CREDIT never exceeds amount paid. */
export function capCreditToPaymentHeadroom(
  paymentAmount: number,
  refundCreditSum: number,
  proposedCredit: number,
): number {
  const headroom = Math.max(0, Math.floor(paymentAmount) - Math.max(0, Math.floor(refundCreditSum)))
  return Math.max(0, Math.min(Math.floor(proposedCredit), headroom))
}

export function creditWouldBeSeriesResidual(input: {
  primaryAmount: number
  alreadyRefundedOnPrimary: number
  proposedCredit: number
}): boolean {
  if (input.proposedCredit <= 0) return false
  const residualOwed = Math.max(0, input.primaryAmount - input.alreadyRefundedOnPrimary)
  return input.proposedCredit >= residualOwed && residualOwed > 0
}

export function seriesMetaResidual(meta: SeriesPaymentMeta): number {
  return Math.max(0, Math.floor(Number(meta.sessionRefundsTotal) || 0))
}