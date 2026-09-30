import { parseSeriesPaymentMeta } from './athleteSeason.ts'
import { normalizeDiscountCode } from './discountCode.ts'

export type FinanceDiscount = {
  code: string | null
  percent: number | null
  amount: number
  subtotal: number | null
  complimentary: boolean
}

function parseMeta(json: string | null | undefined): Record<string, unknown> | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  }
  catch {
    return null
  }
}

function positiveInt(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  return rounded > 0 ? rounded : null
}

function codeOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return normalizeDiscountCode(value) || null
}

/** Discount fields worth copying onto a replacement gateway payment. */
export function discountMetadataSlice(json: string | null | undefined): Record<string, unknown> {
  const meta = parseMeta(json)
  if (!meta) return {}
  const out: Record<string, unknown> = {}
  const code = codeOf(meta.discountCode)
  if (code) out.discountCode = code
  const percent = positiveInt(meta.discountPercent)
  if (percent) out.discountPercent = Math.min(100, percent)
  const desk = positiveInt(meta.deskDiscountPercent)
  if (desk) out.deskDiscountPercent = Math.min(100, desk)
  const amount = positiveInt(meta.discountAmount)
  if (amount) out.discountAmount = amount
  const subtotal = positiveInt(meta.subtotalBeforeDiscount)
  if (subtotal) out.subtotalBeforeDiscount = subtotal
  if (meta.complimentary === true) out.complimentary = true
  return out
}

/**
 * Fields to copy when athlete IPG checkout deletes/recreates a PENDING payment.
 * Discount alone is not enough — multi-day / season groups need sibling links so
 * pay-sync can confirm every slot (see checkout.post replace path).
 */
export function checkoutPreservedMetadata(json: string | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = { ...discountMetadataSlice(json) }
  const series = parseSeriesPaymentMeta(json)
  if (series.seasonBookingId) out.seasonBookingId = series.seasonBookingId
  if (series.groupPrimaryBookingId) out.groupPrimaryBookingId = series.groupPrimaryBookingId
  if (series.groupSiblingBookingIds?.length) {
    out.groupSiblingBookingIds = series.groupSiblingBookingIds
  }
  if (series.coveredByBookingId) out.coveredByBookingId = series.coveredByBookingId
  if (typeof series.sessionPrice === 'number' && series.sessionPrice > 0) {
    out.sessionPrice = Math.round(series.sessionPrice)
  }
  if (typeof series.sessionRefundsTotal === 'number' && series.sessionRefundsTotal > 0) {
    out.sessionRefundsTotal = Math.round(series.sessionRefundsTotal)
  }
  return out
}

/** Gateway intent metadata, with discount fields kept from the payment being replaced. */
export function paymentIntentMetadata(
  base: Record<string, unknown>,
  preserved?: Record<string, unknown> | null,
): string {
  return JSON.stringify({ ...base, ...(preserved || {}) })
}

/** Payment metadata wins. A CREATED event fills a code the gateway wiped. */
export function resolveFinanceDiscount(opts: {
  paidAmount: number
  paymentMetadataJson?: string | null
  eventMetadataJson?: string | null
}): FinanceDiscount | null {
  const payment = discountMetadataSlice(opts.paymentMetadataJson)
  const event = discountMetadataSlice(opts.eventMetadataJson)
  const code = codeOf(payment.discountCode) || codeOf(event.discountCode)
  const complimentary = payment.complimentary === true || event.complimentary === true
  const amount = positiveInt(payment.discountAmount) || positiveInt(event.discountAmount) || 0
  let percent = positiveInt(payment.discountPercent)
    || positiveInt(event.discountPercent)
    || positiveInt(payment.deskDiscountPercent)
    || positiveInt(event.deskDiscountPercent)
  let subtotal = positiveInt(payment.subtotalBeforeDiscount) || positiveInt(event.subtotalBeforeDiscount)
  const paid = Math.max(0, Math.round(opts.paidAmount) || 0)
  if (!subtotal && amount > 0) subtotal = paid + amount
  if (!percent && subtotal && amount > 0) percent = Math.min(100, Math.round((amount / subtotal) * 100))
  if (complimentary && !percent) percent = 100
  if (!code && !complimentary && !amount && !percent) return null
  return {
    code,
    percent: percent ?? null,
    amount,
    subtotal: subtotal ?? null,
    complimentary,
  }
}
