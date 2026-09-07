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

/**
 * Parse AloVarzesh product HTML timetable into per-hour verdicts.
 *
 * Reserved (BUSY) only when:
 * - soft hold `reserve-over`, or
 * - `bg-disabled` AND reserved styling (`reserve-time` / `box-green-reserve-time`)
 *
 * Bare `bg-disabled` (past / unbookable / unclear) → UNKNOWN (never BUSY).
 * Bookable boxes (no disabled/hold) → FREE.
 */
export function parseAloVarzeshSlotStates(
  html: string,
  jalaliDate: string,
  opts: ParseAloVarzeshOccupiedOptions = {},
): AloVarzeshSlotState[] {
  const byTime = new Map<string, AloVarzeshSlotState>()
  const ignoreBefore = opts.ignoreBefore ? normalizeClockTime(opts.ignoreBefore) : null
  const parts = html.split(/(?=<div[^>]*class="day-box)/i)

  for (const part of parts.slice(1)) {
    const classMatch = part.match(/^<div[^>]*class="(day-box[^"]*)"/i)
    if (!classMatch) continue
    const cls = classMatch[1] ?? ''
    const isSoftHold = /reserve-over/i.test(cls)
    const isDisabled = /\bbg-disabled\b/i.test(cls)
    const isReservedStyle = /reserve-time|box-green-reserve-time/i.test(cls)

    const chunk = part.slice(0, 3000)
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

    if (!isSoftHold && ignoreBefore && isBeforeClock(time, ignoreBefore)) {
      // Past disabled UI — not a reservation signal.
      byTime.set(time, { time, verdict: 'UNKNOWN', reason: 'past_disabled' })
      continue
    }

    if (isSoftHold || (isDisabled && isReservedStyle)) {
      byTime.set(time, {
        time,
        verdict: 'BUSY',
        reason: isSoftHold ? 'reserve_over' : 'reserved_disabled',
      })
      continue
    }

    // Bare bg-disabled without reserved styling → UNKNOWN (availability-first).
    byTime.set(time, { time, verdict: 'UNKNOWN', reason: 'disabled_unspecified' })
  }

  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time))
}

/** @deprecated Prefer parseAloVarzeshSlotStates — only confirmed BUSY times. */
export function parseAloVarzeshOccupiedTimes(
  html: string,
  jalaliDate: string,
  opts: ParseAloVarzeshOccupiedOptions = {},
): string[] {
  return parseAloVarzeshSlotStates(html, jalaliDate, opts)
    .filter((row) => row.verdict === 'BUSY')
    .map((row) => row.time)
}
