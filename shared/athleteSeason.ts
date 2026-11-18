import { addDaysToIsoDate } from './localDate.ts'
import { expandSeasonRules, type SeasonSessionOccurrence, type SeasonSessionRule } from './seasonSessions.ts'

export type AthleteSeasonGateOptions = {
  env?: NodeJS.ProcessEnv
  /** Explicit override (e.g. Nuxt runtimeConfig.public.athleteSeasonEnabled). */
  enabled?: boolean
}

/** Max weekly occurrences an athlete may claim in one series. */
export const MAX_ATHLETE_SEASON_OCCURRENCES = 12

/** Default finish = start + 4 weeks when the UI does not set a date. */
export const DEFAULT_ATHLETE_SEASON_WEEKS = 4

/**
 * Athlete self-serve weekly season — independent of desk recurringReserve and packages.
 * Default OFF; opt in via ATHLETE_SEASON_ENABLED / NUXT_PUBLIC_ mirror.
 */
export function isAthleteSeasonEnabled(options?: AthleteSeasonGateOptions): boolean {
  if (typeof options?.enabled === 'boolean') return options.enabled
  const env = options?.env ?? (typeof process !== 'undefined' ? process.env : undefined)
  if (!env) return false
  return (
    env.ATHLETE_SEASON_ENABLED === 'true'
    || env.NUXT_PUBLIC_ATHLETE_SEASON_ENABLED === 'true'
  )
}

/** Finish date that yields at most `max` weekly hits for one weekday (inclusive start). */
export function defaultAthleteSeasonFinishDate(
  startDate: string,
  weeks = DEFAULT_ATHLETE_SEASON_WEEKS,
): string {
  const w = Math.max(1, Math.min(weeks, MAX_ATHLETE_SEASON_OCCURRENCES))
  // N weeks → N occurrences of the same weekday: last = start + 7*(N-1)
  return addDaysToIsoDate(startDate, 7 * (w - 1))
}

/** Expand one weekly rule and hard-cap occurrence count. */
export function expandAthleteWeeklySeason(opts: {
  startDate: string
  finishDate: string
  rule: SeasonSessionRule
  maxOccurrences?: number
}): SeasonSessionOccurrence[] {
  const max = opts.maxOccurrences ?? MAX_ATHLETE_SEASON_OCCURRENCES
  const sessions = expandSeasonRules({
    startDate: opts.startDate,
    finishDate: opts.finishDate,
    rules: [opts.rule],
  })
  return sessions.slice(0, max)
}

export type SeriesPaymentMeta = {
  seasonBookingId?: string
  groupPrimaryBookingId?: string
  groupSiblingBookingIds?: string[]
  coveredByBookingId?: string
  sessionPrice?: number
  sessionRefundsTotal?: number
  /** Sessions already refunded on this series payment (retry guard). */
  sessionRefundedBookingIds?: string[]
}

export function parseSeriesPaymentMeta(raw?: string | null): SeriesPaymentMeta {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as SeriesPaymentMeta
    return parsed && typeof parsed === 'object' ? parsed : {}
  }
  catch {
    return {}
  }
}

export function isSeriesPaymentGroup(meta: SeriesPaymentMeta): boolean {
  return Boolean(
    meta.seasonBookingId
    || meta.groupPrimaryBookingId
    || meta.coveredByBookingId
    || (meta.groupSiblingBookingIds && meta.groupSiblingBookingIds.length),
  )
}

/** True season / recurring series — not same-day multi-court payment groups. */
export function isSeasonPaymentSeries(meta: SeriesPaymentMeta): boolean {
  return Boolean(meta.seasonBookingId)
}

/**
 * Per-line receipt price for a booking in a (possibly grouped) payment.
 * Prefer stored sessionPrice. Grouped online checkouts put the sheet total on the
 * primary and 0 on siblings — never show those as the court line when sessionPrice
 * is missing; fall back to the slot listing instead.
 */
export function receiptLinePrice(opts: {
  meta: SeriesPaymentMeta
  paymentAmount?: number | null
  slotPrice: number
}): number {
  if (typeof opts.meta.sessionPrice === 'number' && Number.isFinite(opts.meta.sessionPrice)) {
    return Math.round(opts.meta.sessionPrice)
  }
  if (isSeriesPaymentGroup(opts.meta)) {
    return opts.slotPrice
  }
  if (typeof opts.paymentAmount === 'number' && Number.isFinite(opts.paymentAmount)) {
    return opts.paymentAmount
  }
  return opts.slotPrice
}

/**
 * Athlete list / history amount. Keep charged amount when > 0 (primary totals,
 * single bookings, pay-CTA). Sibling/covered rows store 0 — resolve via receipt line.
 */
export function athleteListPrice(opts: {
  meta: SeriesPaymentMeta
  paymentAmount?: number | null
  slotPrice: number
}): number {
  if (typeof opts.paymentAmount === 'number' && opts.paymentAmount > 0) {
    return opts.paymentAmount
  }
  return receiptLinePrice(opts)
}

/**
 * How much to refund for one cancelled session while siblings remain.
 * Prefer stored sessionPrice, but never above an equal share of residual when
 * remainingSessions is known (desk/list sessionPrice can exceed paid-per-session
 * after pack discounts — e.g. list 5000 × 6 vs paid 9000 → credit 1500, not 5000).
 * Missing sessionPrice → fair-split residual. Never silent 0 when money remains.
 */
export function sessionRefundAmount(opts: {
  sessionPrice?: number | null
  primaryAmount: number
  alreadyRefunded: number
  /** Active sessions still claiming money, including the cancelled one. */
  remainingSessions?: number
  /** Series/pack size — caps list price when remainingSessions is unknown (repair-safe). */
  totalSessionsInGroup?: number
}): number {
  const residual = Math.max(0, Math.floor(opts.primaryAmount) - Math.floor(opts.alreadyRefunded))
  if (residual <= 0) return 0

  const sessions = Math.max(1, Math.floor(Number(opts.remainingSessions) || 1))
  const fair = Math.floor(residual / sessions)
  const listed = typeof opts.sessionPrice === 'number' && opts.sessionPrice > 0
    ? Math.floor(opts.sessionPrice)
    : 0
  if (listed > 0) {
    // Cap by fair share when we know how many sessions still claim the residual.
    if (opts.remainingSessions != null && Number(opts.remainingSessions) > 0) {
      return Math.min(listed, fair, residual)
    }
    const groupTotal = Math.floor(Number(opts.totalSessionsInGroup) || 0)
    if (groupTotal > 0) {
      const perSessionCap = Math.floor(opts.primaryAmount / groupTotal)
      return Math.min(listed, residual, perSessionCap)
    }
    return Math.min(listed, residual)
  }

  // Missing sessionPrice: equal share of residual; last session path refunds leftover.
  return Math.min(fair, residual)
}
