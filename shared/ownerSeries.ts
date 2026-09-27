import { parseSeriesPaymentMeta } from './athleteSeason.ts'

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
