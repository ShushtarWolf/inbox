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
  const metaTotal = Math.max(0, Math.floor(input.sessionRefundsTotal))
  const credited = Math.max(0, Math.floor(input.refundCreditSum))
  const residualByMeta = Math.max(0, input.amount - metaTotal)
  const headroom = Math.max(0, input.amount - credited)
  return Math.min(residualByMeta, headroom)
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