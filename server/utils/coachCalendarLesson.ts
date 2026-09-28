/** Zero-padded HH:MM, or null when the string is not a clock time. */
export function padCoachTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** True when this hour sits inside one of the coach's windows for that weekday. End is exclusive. */
export function coachHourIsOpen(
  windows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  dayOfWeek: number,
  startTime: string,
): boolean {
  return windows.some((window) => {
    if (window.dayOfWeek !== dayOfWeek) return false
    const start = padCoachTime(window.startTime)
    const end = padCoachTime(window.endTime)
    if (!start || !end) return false
    return start <= startTime && end > startTime
  })
}
