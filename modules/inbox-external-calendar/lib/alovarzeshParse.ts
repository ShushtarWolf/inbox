import { normalizeClockTime } from '../runtime/server/lib/time'

export type ParseAloVarzeshOccupiedOptions = {
  /**
   * HH:mm in Asia/Tehran. Public product pages mark past hours `bg-disabled`
   * even when empty on the club panel — skip those so we do not paint mornings occupied.
   */
  ignoreBefore?: string | null
}

function isBeforeClock(time: string, ignoreBefore: string): boolean {
  return time < ignoreBefore
}

/**
 * Parse AloVarzesh product HTML timetable.
 * Legend: bg-disabled = not bookable (reserved OR past); reserve-over = soft hold.
 * When ignoreBefore is set, bg-disabled slots earlier than that clock are ignored.
 * reserve-over always counts.
 */
export function parseAloVarzeshOccupiedTimes(
  html: string,
  jalaliDate: string,
  opts: ParseAloVarzeshOccupiedOptions = {},
): string[] {
  const occupied = new Set<string>()
  const ignoreBefore = opts.ignoreBefore ? normalizeClockTime(opts.ignoreBefore) : null
  const parts = html.split(/(?=<div[^>]*class="day-box)/i)

  for (const part of parts.slice(1)) {
    const classMatch = part.match(/^<div[^>]*class="(day-box[^"]*)"/i)
    if (!classMatch) continue
    const cls = classMatch[1] ?? ''
    const isSoftHold = /reserve-over/i.test(cls)
    const isDisabled = /\bbg-disabled\b/i.test(cls)
    if (!isSoftHold && !isDisabled) continue

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

    if (!isSoftHold && ignoreBefore && isBeforeClock(time, ignoreBefore)) {
      continue
    }

    occupied.add(time)
  }

  return [...occupied].sort()
}
