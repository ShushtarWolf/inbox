/** Add minutes to an HH:MM clock string (no day wrap). */
export function addMinutes(startTime: string, durationMinutes: number): string {
  const match = startTime.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return startTime
  const total = Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10) + durationMinutes
  const hour = Math.floor(total / 60) % 24
  const minute = ((total % 60) + 60) % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function normalizeClockTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  return `${String(Number.parseInt(match[1], 10)).padStart(2, '0')}:${match[2]}`
}

export function buildSessionStarts(
  openHour: number,
  closeHour: number,
  durationMinutes: number,
): string[] {
  const times: string[] = []
  const openTotal = openHour * 60
  const closeTotal = closeHour * 60
  for (let minutes = openTotal; minutes + durationMinutes <= closeTotal; minutes += durationMinutes) {
    const hour = Math.floor(minutes / 60)
    const minute = minutes % 60
    times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
  }
  return times
}
