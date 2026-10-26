/** Preferred time-of-day from home search (`tod` query). Additive — omit = any hour. */

export type TimeOfDayPref = '' | 'afternoon' | 'evening'

/** Hour ranges (local clock, exclusive end). عصر ≈ ۱۲–۱۷، شب ≈ ۱۷–۲۴. */
export function todHourRange(tod: string): { start: number; end: number } | null {
  if (tod === 'afternoon') return { start: 12, end: 17 }
  if (tod === 'evening') return { start: 17, end: 24 }
  return null
}

/** `HH:MM` or `HH:MM:SS` from slot APIs. */
export function slotMatchesTod(timeHHMM: string, tod: string): boolean {
  const range = todHourRange(tod)
  if (!range) return true
  const h = Number(String(timeHHMM).slice(0, 2))
  if (!Number.isFinite(h)) return true
  return h >= range.start && h < range.end
}

export function normalizeTod(raw: unknown): TimeOfDayPref {
  if (raw === 'afternoon' || raw === 'evening') return raw
  return ''
}
