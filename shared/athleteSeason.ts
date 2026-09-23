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

/** How much to refund for one cancelled session while siblings remain. */
export function sessionRefundAmount(opts: {
  sessionPrice?: number | null
  primaryAmount: number
  alreadyRefunded: number
}): number {
  const listed = typeof opts.sessionPrice === 'number' && opts.sessionPrice > 0
    ? opts.sessionPrice
    : 0
  const residual = Math.max(0, opts.primaryAmount - opts.alreadyRefunded)
  if (listed <= 0) return 0
  return Math.min(listed, residual)
}
