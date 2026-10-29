import { addDaysToIsoDate, todayDateString } from './localDate.ts'

/** Inclusive calendar days athletes may open (today counts as day 1). */
export const DEFAULT_BOOKING_HORIZON_DAYS = 14
export const MIN_BOOKING_HORIZON_DAYS = 1
export const MAX_BOOKING_HORIZON_DAYS = 90
export const BOOKING_HORIZON_OPTIONS = [7, 14, 30, 60] as const

export function clampBookingHorizonDays(value: unknown, fallback = DEFAULT_BOOKING_HORIZON_DAYS) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_BOOKING_HORIZON_DAYS, Math.max(MIN_BOOKING_HORIZON_DAYS, Math.round(n)))
}

/** Last YYYY-MM-DD athletes may select for this horizon (inclusive). */
export function maxBookableIsoDate(horizonDays: number, today = todayDateString()) {
  const days = clampBookingHorizonDays(horizonDays)
  return addDaysToIsoDate(today, days - 1)
}

export function isDateBeyondBookingHorizon(
  date: string,
  horizonDays: number,
  today = todayDateString(),
) {
  return date > maxBookableIsoDate(horizonDays, today)
}
