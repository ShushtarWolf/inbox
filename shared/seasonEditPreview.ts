import type { SeasonUnit, SeasonUnitRange } from './seasonEditDiff.ts'
import { normalizeUnitTime, seasonUnitKey } from './seasonEditDiff.ts'

export type EditDiffCounts = { added: number; removed: number; unchanged?: number }

/** Step 3 edit flow: bill only when new hours are added. */
export function seasonEditStep3NeedsPayment(
  isEditing: boolean,
  diff: EditDiffCounts | null | undefined,
): boolean {
  return Boolean(isEditing && diff && diff.added > 0)
}

/** Edit with no new hours — save without pay link / cash collection (e.g. shorten end only). */
export function seasonEditStep3SaveOnly(
  isEditing: boolean,
  diff: EditDiffCounts | null | undefined,
): boolean {
  if (!isEditing || !diff) return false
  if (diff.added > 0) return false
  return diff.removed > 0
}

/** Keys for occurrences that are newly added (not already on the season). */
export function seasonEditAddedKeySet(addedUnits: SeasonUnit[]): Set<string> {
  return new Set(addedUnits.map((u) => seasonUnitKey(u)))
}

/** Expand aggregated ranges from edit diff into per-hour units for calendar display. */
export function expandSeasonUnitRanges(ranges: SeasonUnitRange[], slotMinutes = 60): SeasonUnit[] {
  const toMin = (t: string) => {
    const [h, m] = normalizeUnitTime(t).split(':')
    return Number(h) * 60 + Number(m)
  }
  const fromMin = (n: number) => (n >= 24 * 60
    ? '24:00'
    : `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`)
  const out: SeasonUnit[] = []
  for (const range of ranges) {
    let t = toMin(range.startTime)
    const end = toMin(range.endTime)
    while (t < end) {
      out.push({
        date: range.date,
        courtId: range.courtId,
        startTime: fromMin(t),
      })
      t += slotMinutes
    }
  }
  return out.sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId))
}