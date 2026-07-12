const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export type DayTimeRange = { start: string; end: string }

export function hourFromTime(time: string): number {
  return Number.parseInt(time.slice(0, 2), 10)
}

export function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

export function timesInRange(startTime: string, endTime: string, stepMinutes = 60): string[] {
  const startH = hourFromTime(startTime)
  const startM = Number.parseInt(startTime.slice(3, 5) || '0', 10)
  const endH = hourFromTime(endTime)
  const endM = Number.parseInt(endTime.slice(3, 5) || '0', 10)
  const startTotal = startH * 60 + startM
  const endTotal = endH * 60 + endM
  if (endTotal <= startTotal) return []
  const times: string[] = []
  for (let m = startTotal; m < endTotal; m += stepMinutes) {
    const h = Math.floor(m / 60)
    const min = m % 60
    times.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`)
  }
  return times
}

export function weekdayNameFromDate(isoDate: string): string {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay()
  return DAY_NAMES[day] || 'Sun'
}

export function expandDayTimeRanges(dayTimes: Record<string, DayTimeRange>, stepMinutes = 60): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [day, range] of Object.entries(dayTimes)) {
    const times = timesInRange(range.start, range.end, stepMinutes)
    if (times.length) result[day] = times
  }
  return result
}

export function countRecurringSessionDates(weekdays: string[], anchorDate: string, weeks = 8): number {
  const wanted = new Set(weekdays.map((day) => DAY_MAP[day]).filter((value) => value !== undefined))
  if (!wanted.size) return 0
  const start = new Date(`${anchorDate}T12:00:00Z`)
  let dateCount = 0
  for (let offset = 0; offset < weeks * 7; offset += 1) {
    const day = new Date(start)
    day.setUTCDate(start.getUTCDate() + offset)
    if (wanted.has(day.getUTCDay())) dateCount += 1
  }
  return dateCount
}

export function countRecurringSessionDatesInRange(weekdays: string[], startDate: string, finishDate: string): number {
  const wanted = new Set(weekdays.map((day) => DAY_MAP[day]).filter((value) => value !== undefined))
  if (!wanted.size || !startDate || !finishDate || finishDate < startDate) return 0
  const start = new Date(`${startDate}T12:00:00Z`)
  const end = new Date(`${finishDate}T12:00:00Z`)
  let dateCount = 0
  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    if (wanted.has(day.getUTCDay())) dateCount += 1
  }
  return dateCount
}

export function countRecurringSessions(
  weekdays: string[],
  startTime: string,
  endTime: string,
  anchorDate: string,
  weeks = 8,
): number {
  const times = timesInRange(startTime, endTime)
  if (!times.length) return 0
  return countRecurringSessionDates(weekdays, anchorDate, weeks) * times.length
}

export function countRecurringSessionsByDay(
  dayTimes: Record<string, DayTimeRange>,
  weekdays: string[],
  anchorDate: string,
  weeks = 8,
  stepMinutes = 60,
): number {
  const expanded = expandDayTimeRanges(dayTimes, stepMinutes)
  let total = 0
  for (const day of weekdays) {
    const times = expanded[day]
    if (!times?.length) continue
    total += countRecurringSessionDates([day], anchorDate, weeks) * times.length
  }
  return total
}

export function countRecurringSessionsByDayInRange(
  dayTimes: Record<string, DayTimeRange>,
  weekdays: string[],
  startDate: string,
  finishDate: string,
  stepMinutes = 60,
): number {
  const expanded = expandDayTimeRanges(dayTimes, stepMinutes)
  let total = 0
  for (const day of weekdays) {
    const times = expanded[day]
    if (!times?.length) continue
    total += countRecurringSessionDatesInRange([day], startDate, finishDate) * times.length
  }
  return total
}

export function hasValidDayTimes(dayTimes: Record<string, DayTimeRange>, days: string[]): boolean {
  return days.some((day) => {
    const range = dayTimes[day]
    if (!range) return false
    return timesInRange(range.start, range.end).length > 0
  })
}

export function parseSeasonTimesJson(
  timesJson: string | null | undefined,
  days: string[],
  fallback?: DayTimeRange,
): Record<string, DayTimeRange> {
  if (!timesJson) {
    return fallback ? Object.fromEntries(days.map((day) => [day, { ...fallback }])) : {}
  }
  try {
    const parsed = JSON.parse(timesJson)
    if (Array.isArray(parsed)) {
      if (!parsed.length || !fallback) return {}
      const start = parsed[0]
      const end = formatHour(hourFromTime(parsed[parsed.length - 1]) + 1)
      return Object.fromEntries(days.map((day) => [day, { start, end }]))
    }
    if (parsed && typeof parsed === 'object') {
      const result: Record<string, DayTimeRange> = {}
      for (const day of days) {
        const entry = parsed[day]
        if (entry && typeof entry === 'object' && entry.start && entry.end) {
          result[day] = { start: entry.start, end: entry.end }
        }
      }
      return result
    }
  } catch {
    return {}
  }
  return {}
}

export function serializeDayTimes(dayTimes: Record<string, DayTimeRange>): string {
  return JSON.stringify(dayTimes)
}

export function ensureDayTimesForDays(
  dayTimes: Record<string, DayTimeRange>,
  days: string[],
  fallback: DayTimeRange,
): Record<string, DayTimeRange> {
  const next = { ...dayTimes }
  for (const day of days) {
    if (!next[day]) next[day] = { ...fallback }
  }
  for (const key of Object.keys(next)) {
    if (!days.includes(key)) delete next[key]
  }
  return next
}
