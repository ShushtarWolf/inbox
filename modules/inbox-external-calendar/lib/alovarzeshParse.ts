import { normalizeClockTime } from '../runtime/server/lib/time'

/**
 * Parse AloVarzesh product HTML timetable.
 * Legend: bg-disabled = reserved; reserve-over = soft hold; otherwise bookable.
 */
export function parseAloVarzeshOccupiedTimes(html: string, jalaliDate: string): string[] {
  const occupied = new Set<string>()
  const parts = html.split(/(?=<div[^>]*class="day-box)/i)

  for (const part of parts.slice(1)) {
    const classMatch = part.match(/^<div[^>]*class="(day-box[^"]*)"/i)
    if (!classMatch) continue
    const cls = classMatch[1] ?? ''
    const isOccupied = /\bbg-disabled\b/i.test(cls) || /reserve-over/i.test(cls)
    if (!isOccupied) continue

    const chunk = part.slice(0, 3000)
    const scheduleMatch = chunk.match(/product_schedule"\s+value="([^"]+)"/i)
      || chunk.match(/data-schedule="([^"]+)"/i)
    if (scheduleMatch?.[1]) {
      const raw = scheduleMatch[1].trim()
      const [datePart, timePart] = raw.split(/\s+/)
      if (datePart !== jalaliDate) continue
      const time = normalizeClockTime(timePart)
      if (time) occupied.add(time)
      continue
    }

    const timeMatch = chunk.match(/class="time-value[^"]*"[^>]*>\s*([^<]+)/i)
    const time = normalizeClockTime(timeMatch?.[1]?.trim())
    if (time) occupied.add(time)
  }

  return [...occupied].sort()
}
