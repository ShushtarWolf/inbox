import { addDaysToIsoDate } from './localDate.ts'

/** Max weeks for desk weekly block / similar steppers. */
export const WEEKLY_OCCURRENCE_MAX_WEEKS = 12

/** Clamp weeks to 1…WEEKLY_OCCURRENCE_MAX_WEEKS. */
export function clampWeeklyWeeks(weeks: number): number {
  const n = Math.trunc(Number(weeks))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, WEEKLY_OCCURRENCE_MAX_WEEKS)
}

/**
 * Same weekday/time across N weeks: anchor, +7d, +14d, …
 * weeks=1 → [anchorDate] only.
 */
export function weeklyOccurrenceDates(anchorDate: string, weeks: number): string[] {
  const n = clampWeeklyWeeks(weeks)
  const dates: string[] = []
  for (let i = 0; i < n; i += 1) {
    dates.push(addDaysToIsoDate(anchorDate, i * 7))
  }
  return dates
}
