/**
 * Single brain for "how many toman go to the athlete wallet on cancel".
 * Live cancel, retry, and historical repair must agree on this math.
 *
 * Desk cash → 0. Series → session share (capped by residual). Standalone → payment amount × bps.
 * Explicit refundCreditAmount / refundedAmount in metadata wins when present (already decided).
 */
import {
  isSeriesPaymentGroup,
  parseSeriesPaymentMeta,
  sessionRefundAmount,
  type SeriesPaymentMeta,
} from './athleteSeason.ts'
import { refundAmountFromBps } from './cancelPolicy.ts'
import { resolveRefundChannel, type RefundChannel } from './cancelRefund.ts'

export type CancelWalletCreditReason =
  | 'desk_cash'
  | 'zero'
  | 'explicit_meta'
  | 'standalone'
  | 'series_session'

export type CancelWalletCreditInput = {
  method: string | null | undefined
  bookingPaymentMethod?: string | null
  /** This payment row's amount (0 on series siblings). */
  paymentAmount: number
  /** Primary / charged series total when known. Defaults to paymentAmount. */
  primaryAmount?: number | null
  sessionPrice?: number | null
  /** Already credited for earlier session cancels on this primary. */
  alreadyRefundedOnPrimary?: number | null
  /** Active sessions still claiming money, including the one being cancelled. */
  remainingSessionsIncludingCancelled?: number | null
  /** Force series math even if metadata markers are incomplete. */
  treatAsSeries?: boolean
  refundBps?: number | null
  metadata?: Record<string, unknown> | string | null
}

export type CancelWalletCreditResult = {
  amount: number
  reason: CancelWalletCreditReason
  series: boolean
}

function asMeta(raw: CancelWalletCreditInput['metadata']): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    }
    catch {
      return {}
    }
  }
  return raw
}

function metaNumber(meta: Record<string, unknown>, key: string): number | null {
  const n = Number(meta[key])
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

/**
 * Gross toman to credit the athlete wallet for this cancel (after refundBps).
 * Never returns a negative. Series never returns more than residual on primary.
 */
export function cancelWalletCreditAmount(input: CancelWalletCreditInput): CancelWalletCreditResult {
  if (resolveRefundChannel(input.method, input.bookingPaymentMethod) === 'desk_cash') {
    return { amount: 0, reason: 'desk_cash', series: false }
  }

  const meta = asMeta(input.metadata)
  const seriesMeta = parseSeriesPaymentMeta(JSON.stringify(meta)) as SeriesPaymentMeta
  const series = input.treatAsSeries === true || isSeriesPaymentGroup(seriesMeta)
  const bps = input.refundBps != null
    ? Math.max(0, Math.min(10_000, Math.floor(Number(input.refundBps) || 0)))
    : (metaNumber(meta, 'refundBps') ?? 10_000)

  const explicit = metaNumber(meta, 'refundCreditAmount') ?? metaNumber(meta, 'refundedAmount')
  if (explicit != null) {
    // Explicit amounts are already the decided credit (often post-bps). Do not double-scale.
    return { amount: Math.max(0, explicit), reason: 'explicit_meta', series }
  }

  if (series) {
    const primary = Math.max(
      0,
      Math.floor(Number(input.primaryAmount ?? input.paymentAmount) || 0),
    )
    const already = Math.max(
      0,
      Math.floor(
        Number(
          input.alreadyRefundedOnPrimary
          ?? metaNumber(meta, 'sessionRefundsTotal')
          ?? 0,
        ) || 0,
      ),
    )
    // Last active session: credit the full residual (not sessionPrice), matching live
    // seriesCancelRefund residual path so leftover toman are not stranded.
    const remaining = input.remainingSessionsIncludingCancelled != null
      ? Math.max(1, Math.floor(Number(input.remainingSessionsIncludingCancelled) || 1))
      : null
    if (remaining === 1) {
      const residual = Math.max(0, primary - already)
      const amount = refundAmountFromBps(residual, bps)
      return { amount, reason: amount > 0 ? 'series_session' : 'zero', series: true }
    }
    const sessionPrice = input.sessionPrice != null
      ? Number(input.sessionPrice)
      : metaNumber(meta, 'sessionPrice')
    const raw = sessionRefundAmount({
      sessionPrice,
      primaryAmount: primary,
      alreadyRefunded: already,
      remainingSessions: remaining ?? undefined,
    })
    const amount = refundAmountFromBps(raw, bps)
    return { amount, reason: amount > 0 ? 'series_session' : 'zero', series: true }
  }

  const cap = Math.max(0, Math.floor(Number(input.paymentAmount) || 0))
  const amount = refundAmountFromBps(cap, bps)
  return { amount, reason: amount > 0 ? 'standalone' : 'zero', series: false }
}

export type OwedCancelRefundSeriesContext = {
  primaryAmount?: number | null
  sessionPrice?: number | null
  alreadyRefundedOnPrimary?: number | null
  remainingSessionsIncludingCancelled?: number | null
  treatAsSeries?: boolean
}

/** Plan name: one owed brain with refund channel for live / repair / force paths. */
export function owedCancelRefund(
  payment: {
    method: string | null | undefined
    amount: number
    metadata?: Record<string, unknown> | string | null
  },
  booking: { paymentMethod?: string | null } | null | undefined,
  seriesContext: OwedCancelRefundSeriesContext | null | undefined,
  refundBps?: number | null,
): { amount: number; channel: RefundChannel; reason: CancelWalletCreditReason } {
  const channel = resolveRefundChannel(payment.method, booking?.paymentMethod)
  const credit = cancelWalletCreditAmount({
    method: payment.method,
    bookingPaymentMethod: booking?.paymentMethod,
    paymentAmount: payment.amount,
    refundBps,
    metadata: payment.metadata,
    primaryAmount: seriesContext?.primaryAmount,
    sessionPrice: seriesContext?.sessionPrice,
    alreadyRefundedOnPrimary: seriesContext?.alreadyRefundedOnPrimary,
    remainingSessionsIncludingCancelled: seriesContext?.remainingSessionsIncludingCancelled,
    treatAsSeries: seriesContext?.treatAsSeries,
  })
  return { amount: credit.amount, channel, reason: credit.reason }
}
