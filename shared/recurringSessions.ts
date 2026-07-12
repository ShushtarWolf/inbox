const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

export function hourFromTime(time: string): number {
  return Number.parseInt(time.slice(0, 2), 10)
}

export function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

export function timesInRange(startTime: string, endTime: string): string[] {
  const startH = hourFromTime(startTime)
  const endH = hourFromTime(endTime)
  if (endH <= startH) return []
  const times: string[] = []
  for (let h = startH; h < endH; h += 1) {
    times.push(formatHour(h))
  }
  return times
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
