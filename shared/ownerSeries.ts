import { parseSeriesPaymentMeta } from './athleteSeason.ts'
import { isPaidPaymentStatus, isUnpaidPaymentStatus } from './bookingPayment.ts'

export type OwnerSeriesKey =
  | { kind: 'package'; id: string }
  | { kind: 'season'; id: string }

/** Class-package draft, else the season id stamped on create (event or payment metadata). */
export function ownerSeriesKey(booking: {
  packageDraftId?: string | null
  paymentMetadataJson?: string | null
  eventMetadataJson?: Array<string | null | undefined> | null
}): OwnerSeriesKey | null {
  const pkg = booking.packageDraftId?.trim()
  if (pkg) return { kind: 'package', id: pkg }
  const blobs = [...(booking.eventMetadataJson || []), booking.paymentMetadataJson]
  for (const raw of blobs) {
    const id = parseSeriesPaymentMeta(raw).seasonBookingId?.trim()
    if (id) return { kind: 'season', id }
  }
  return null
}

/** Fragment JSON.stringify writes for seasonBookingId — quoted so a shorter id cannot match. */
export function seasonBookingIdNeedle(seasonId: string) {
  return `"seasonBookingId":${JSON.stringify(seasonId)}`
}

/**
 * Covered siblings of a pay-link season store amount 0. Refunding those rows
 * hits a phantom charge; the primary payment holds the series total.
 */
export function seriesCancelPaymentId(payment: {
  id: string
  amount: number
  metadataJson?: string | null
} | null | undefined): string | null {
  if (!payment) return null
  const covered = Boolean(parseSeriesPaymentMeta(payment.metadataJson).coveredByBookingId)
  if (covered && payment.amount <= 0) return null
  return payment.id
}

/**
 * Whether a desk pay/unpay of the whole series flips this row. Unpay only reverses
 * desk cash — online and wallet payments must go through cancel to refund.
 */
export function isSeriesDeskPaymentTarget(row: {
  paymentStatus?: string | null
  payment?: { status: string; method: string } | null
}, next: 'PAID' | 'PAY_AT_CLUB'): boolean {
  const status = row.payment?.status || row.paymentStatus
  if (next === 'PAID') return isUnpaidPaymentStatus(status)
  return isPaidPaymentStatus(status) && row.payment?.method === 'CASH'
}

export type SeriesDeskPaymentCreate = {
  bookingId: string
  amount: number
  metadataJson: string
}

/**
 * Payment.create payloads when desk mark-series-paid mints missing rows.
 * Matches seasonReserve / court multi-slot: one charged primary (sum of session
 * prices), siblings amount 0 + coveredByBookingId, sessionPrice on every row.
 */
export function seriesDeskPaymentCreates(
  rows: Array<{ id: string; slotPrice: number }>,
  opts?: { seasonBookingId?: string },
): SeriesDeskPaymentCreate[] {
  if (!rows.length) return []
  const seasonBookingId = opts?.seasonBookingId?.trim() || undefined
  const prices = rows.map((row) => Math.max(0, Math.round(row.slotPrice || 0)))
  const primaryId = rows[0]!.id
  const siblingIds = rows.slice(1).map((row) => row.id)
  const total = prices.reduce((sum, n) => sum + n, 0)

  return rows.map((row, i) => {
    const sessionPrice = prices[i]!
    const isPrimary = i === 0
    const meta: Record<string, unknown> = { sessionPrice }
    if (seasonBookingId) meta.seasonBookingId = seasonBookingId
    if (rows.length > 1) {
      if (isPrimary) {
        meta.groupPrimaryBookingId = primaryId
        meta.groupSiblingBookingIds = siblingIds
      }
      else {
        meta.coveredByBookingId = primaryId
      }
    }
    return {
      bookingId: row.id,
      amount: isPrimary ? total : 0,
      metadataJson: JSON.stringify(meta),
    }
  })
}
