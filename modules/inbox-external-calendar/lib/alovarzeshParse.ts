import { normalizeClockTime } from '../runtime/server/lib/time'
import type { SourceSlotVerdict } from './observation'

export type ParseAloVarzeshOccupiedOptions = {
  /**
   * HH:mm in Asia/Tehran. Public product pages mark past hours `bg-disabled`
   * even when empty on the club panel — skip those so we do not paint mornings occupied.
   */
  ignoreBefore?: string | null
}

export type AloVarzeshSlotState = {
  time: string
  verdict: SourceSlotVerdict
  reason: string
}

function isBeforeClock(time: string, ignoreBefore: string): boolean {
  return time < ignoreBefore
}

/** Match each timetable day-box opening tag (avoid zero-width split dropping the first box). */
const DAY_BOX_OPEN_RE = /<div\b[^>]*\bclass="([^"]*\bday-box\b[^"]*)"[^>]*>/gi

/**
 * Parse AloVarzesh product HTML timetable into per-hour verdicts.
 *
 * Reserved (BUSY) when:
 * - soft hold `reserve-over`, or
 * - `bg-disabled` + reserved styling (`reserve-time` / `box-green-reserve-time`), or
 * - future `bg-disabled` without bookable affordance (permanent / blocked slots often
 *   ship as bare `bg-disabled` with no `reserve-time` — verified live on IUST court 1)
 *
 * Past bare `bg-disabled` (ignoreBefore) → UNKNOWN (never BUSY).
 * Bookable boxes (no disabled/hold) → FREE.
 */
export function parseAloVarzeshSlotStates(
  html: string,
  jalaliDate: string,
  opts: ParseAloVarzeshOccupiedOptions = {},
): AloVarzeshSlotState[] {
  const byTime = new Map<string, AloVarzeshSlotState>()
  const ignoreBefore = opts.ignoreBefore ? normalizeClockTime(opts.ignoreBefore) : null

  const opens: Array<{ index: number; cls: string }> = []
  DAY_BOX_OPEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = DAY_BOX_OPEN_RE.exec(html)) !== null) {
    opens.push({ index: match.index, cls: match[1] ?? '' })
  }

  for (let i = 0; i < opens.length; i++) {
    const { index: start, cls } = opens[i]!
    const end = i + 1 < opens.length
      ? opens[i + 1]!.index
      : Math.min(html.length, start + 4000)
    const chunk = html.slice(start, end)

    const isSoftHold = /\breserve-over\b/i.test(cls)
    const isDisabled = /\bbg-disabled\b/i.test(cls)
    // Matches both `reserve-time` and `box-green-reserve-time`.
    const isReservedStyle = /\breserve-time\b/i.test(cls)

    const scheduleMatch = chunk.match(/product_schedule"\s+value="([^"]+)"/i)
      || chunk.match(/data-schedule="([^"]+)"/i)
    let time: string | null = null
    if (scheduleMatch?.[1]) {
      const raw = scheduleMatch[1].trim()
      const [datePart, timePart] = raw.split(/\s+/)
      if (datePart !== jalaliDate) continue
      time = normalizeClockTime(timePart)
    } else {
      const timeMatch = chunk.match(/class="time-value[^"]*"[^>]*>\s*([^<]+)/i)
      time = normalizeClockTime(timeMatch?.[1]?.trim())
    }
    if (!time) continue

    if (!isSoftHold && !isDisabled) {
      byTime.set(time, { time, verdict: 'FREE', reason: 'bookable' })
      continue
    }

    // Past public disabled hours are not evidence of a booking.
    if (!isSoftHold && ignoreBefore && isBeforeClock(time, ignoreBefore)) {
      byTime.set(time, { time, verdict: 'UNKNOWN', reason: 'past_disabled' })
      continue
    }

    if (isSoftHold) {
      byTime.set(time, { time, verdict: 'BUSY', reason: 'reserve_over' })
      continue
    }

    if (isDisabled && isReservedStyle) {
      byTime.set(time, { time, verdict: 'BUSY', reason: 'reserved_disabled' })
      continue
    }

    // Future bare bg-disabled: not clickable/bookable on public page (often "دائم").
    if (isDisabled) {
      byTime.set(time, { time, verdict: 'BUSY', reason: 'future_disabled' })
      continue
    }

    byTime.set(time, { time, verdict: 'UNKNOWN', reason: 'disabled_unspecified' })
  }

  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time))
}

/** Confirmed BUSY times only — FREE / UNKNOWN are excluded. */
export function parseAloVarzeshOccupiedTimes(
  html: string,
  jalaliDate: string,
  opts: ParseAloVarzeshOccupiedOptions = {},
): string[] {
  return parseAloVarzeshSlotStates(html, jalaliDate, opts)
    .filter((row) => row.verdict === 'BUSY')
    .map((row) => row.time)
}
