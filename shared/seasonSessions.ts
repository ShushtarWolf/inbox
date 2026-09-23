import {
  expandDayTimeRanges,
  timesInRange,
  type DayTimeRange,
  weekdayNameFromDate,
} from './recurringSessions.ts'

const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

export type SeasonSessionRule = {
  weekday: string
  startTime: string
  endTime: string
  courtId: string
}

export type SeasonSessionOccurrence = {
  date: string
  startTime: string
  courtId: string
}

function datesForWeekdaysInRange(startDate: string, finishDate: string, weekdays: string[]): string[] {
  const wanted = new Set(weekdays.map((d) => DAY_MAP[d]).filter((n) => n !== undefined))
  if (!wanted.size || !startDate || !finishDate || finishDate < startDate) return []
  const start = new Date(`${startDate}T12:00:00Z`)
  const end = new Date(`${finishDate}T12:00:00Z`)
  const dates: string[] = []
  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    if (wanted.has(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10))
  }
  return dates
}

/** Expand weekday rules across [startDate, finishDate] into concrete court/time rows. */
export function expandSeasonRules(opts: {
  startDate: string
  finishDate: string
  rules: SeasonSessionRule[]
}): SeasonSessionOccurrence[] {
  const { startDate, finishDate, rules } = opts
  if (!startDate || !finishDate || finishDate < startDate || !rules.length) return []

  const byWeekday = new Map<string, SeasonSessionRule[]>()
  for (const rule of rules) {
    const day = rule.weekday
    if (!day || !rule.courtId || !rule.startTime || !rule.endTime) continue
    const list = byWeekday.get(day) || []
    list.push(rule)
    byWeekday.set(day, list)
  }

  const weekdays = [...byWeekday.keys()]
  const dates = datesForWeekdaysInRange(startDate, finishDate, weekdays)
  const out: SeasonSessionOccurrence[] = []
  const seen = new Set<string>()

  for (const date of dates) {
    const weekday = weekdayNameFromDate(date)
    for (const rule of byWeekday.get(weekday) || []) {
      for (const startTime of timesInRange(rule.startTime, rule.endTime)) {
        const key = `${rule.courtId}|${date}|${startTime}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ date, startTime, courtId: rule.courtId })
      }
    }
  }

  out.sort((a, b) =>
    a.date.localeCompare(b.date)
    || a.startTime.localeCompare(b.startTime)
    || a.courtId.localeCompare(b.courtId))
  return out
}

/** Legacy desk shape → rules (courts × weekday time ranges). */
export function legacySeasonToRules(opts: {
  days: string[]
  dayTimes?: Record<string, DayTimeRange>
  times?: string[]
  courtIds: string[]
}): SeasonSessionRule[] {
  const { days, courtIds } = opts
  if (!days.length || !courtIds.length) return []

  let ranges: Record<string, DayTimeRange> = {}
  if (opts.dayTimes && Object.keys(opts.dayTimes).length) {
    ranges = opts.dayTimes
  }
  else if (opts.times?.length) {
    const first = opts.times[0]!
    const last = opts.times[opts.times.length - 1]!
    const endHour = Number.parseInt(last.slice(0, 2), 10) + 1
    const range = { start: first, end: `${String(endHour).padStart(2, '0')}:00` }
    ranges = Object.fromEntries(days.map((d) => [d, range]))
  }

  const rules: SeasonSessionRule[] = []
  for (const day of days) {
    const range = ranges[day]
    if (!range?.start || !range?.end) continue
    for (const courtId of courtIds) {
      rules.push({
        weekday: day,
        startTime: range.start,
        endTime: range.end,
        courtId,
      })
    }
  }
  return rules
}

export function rulesToTimesJson(rules: SeasonSessionRule[]): string {
  const map: Record<string, DayTimeRange> = {}
  for (const rule of rules) {
    const prev = map[rule.weekday]
    if (!prev) {
      map[rule.weekday] = { start: rule.startTime, end: rule.endTime }
      continue
    }
    if (rule.startTime < prev.start) prev.start = rule.startTime
    if (rule.endTime > prev.end) prev.end = rule.endTime
  }
  return JSON.stringify(map)
}

export function expandDayTimesForLegacy(
  dayTimes?: Record<string, DayTimeRange>,
  times?: string[],
  days?: string[],
): Record<string, string[]> {
  if (dayTimes && Object.keys(dayTimes).length) return expandDayTimeRanges(dayTimes)
  if (times?.length && days?.length) {
    return Object.fromEntries(days.map((d) => [d, times]))
  }
  return {}
}
