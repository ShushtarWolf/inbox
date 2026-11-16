export type JalaliCalendarTodayOpts = {
  todayIso: string
  minDate?: string
  maxDate?: string
}

/** Footer «امروز» is disabled only when today falls outside min/max constraints. */
export function jalaliCalendarTodayDisabled(opts: JalaliCalendarTodayOpts): boolean {
  const today = opts.todayIso
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return false
  const min = opts.minDate?.trim()
  if (min && /^\d{4}-\d{2}-\d{2}$/.test(min) && today < min) return true
  const max = opts.maxDate?.trim()
  if (max && /^\d{4}-\d{2}-\d{2}$/.test(max) && today > max) return true
  return false
}