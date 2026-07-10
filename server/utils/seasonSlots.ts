const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

export function datesForWeekdays(
  anchorDate: string,
  weekdays: string[],
  weeks = 8,
): string[] {
  const wanted = new Set(weekdays.map((d) => DAY_MAP[d]).filter((n) => n !== undefined))
  if (!wanted.size) return []

  const start = new Date(`${anchorDate}T12:00:00Z`)
  const dates: string[] = []
  for (let offset = 0; offset < weeks * 7; offset++) {
    const day = new Date(start)
    day.setUTCDate(start.getUTCDate() + offset)
    if (wanted.has(day.getUTCDay())) {
      dates.push(day.toISOString().slice(0, 10))
    }
  }
  return dates
}

export function hourFromTime(time: string): number {
  return Number.parseInt(time.slice(0, 2), 10)
}
