import { COURT_FACILITY_OPTIONS } from './courtFacilities.ts'
import { isoToJalaali } from './jalali.ts'

const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const WEEK_ORDER = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const

const WEEKDAY_PLURAL: Record<(typeof WEEKDAY_KEYS)[number], string> = {
  Sat: 'شنبه‌ها',
  Sun: 'یکشنبه‌ها',
  Mon: 'دوشنبه‌ها',
  Tue: 'سه‌شنبه‌ها',
  Wed: 'چهارشنبه‌ها',
  Thu: 'پنجشنبه‌ها',
  Fri: 'جمعه‌ها',
}

export type SeasonReceiptSession = {
  iso: string
  startTime: string
  endTime: string
  courtName: string
}

export type SeasonScheduleRow = {
  weekday: string
  startTime: string
  endTime: string
  courtName: string
}

export type SeasonCalendarMonth = {
  year: number
  month: number
}

export type ReceiptPolicyLine = {
  title: string
  body: string
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Civil weekday of a YYYY-MM-DD date. Independent of the server timezone. */
export function isoWeekdayKey(iso: string) {
  const parts = iso.split('-').map(Number)
  const year = parts[0] ?? 0
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  return WEEKDAY_KEYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? 'Sun'
}

/** One row per weekday + time + court. Same slot repeating every week collapses. */
export function seasonScheduleRows(sessions: SeasonReceiptSession[]): SeasonScheduleRow[] {
  const rows = new Map<string, SeasonScheduleRow>()
  for (const session of sessions) {
    if (!isIsoDate(session.iso)) continue
    const key = `${isoWeekdayKey(session.iso)}|${session.startTime}|${session.endTime}|${session.courtName}`
    if (rows.has(key)) continue
    const weekdayKey = isoWeekdayKey(session.iso)
    rows.set(key, {
      weekday: WEEKDAY_PLURAL[weekdayKey],
      startTime: session.startTime,
      endTime: session.endTime,
      courtName: session.courtName,
    })
  }
  return [...rows.values()].sort((a, b) => {
    const aKey = WEEK_ORDER.findIndex((key) => WEEKDAY_PLURAL[key] === a.weekday)
    const bKey = WEEK_ORDER.findIndex((key) => WEEKDAY_PLURAL[key] === b.weekday)
    if (aKey !== bKey) return aKey - bKey
    return a.startTime.localeCompare(b.startTime) || a.courtName.localeCompare(b.courtName, 'fa')
  })
}

/** Jalali months from the first session through the last, including months with no session. */
export function seasonCalendarMonths(isos: string[]): SeasonCalendarMonth[] {
  const valid = isos.filter(isIsoDate).sort()
  const first = valid[0]
  const last = valid[valid.length - 1]
  if (!first || !last) return []
  const start = isoToJalaali(first)
  const end = isoToJalaali(last)
  const months: SeasonCalendarMonth[] = []
  let year = start.jy
  let month = start.jm
  while (year < end.jy || (year === end.jy && month <= end.jm)) {
    months.push({ year, month })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

export function receiptPolicyLines(raw: string | null | undefined): ReceiptPolicyLine[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const lines: ReceiptPolicyLine[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const title = String(row.titleFa || row.title || '').trim()
      const body = String(row.bodyFa || row.body || '').trim()
      if (!title && !body) continue
      lines.push({ title, body })
    }
    return lines
  }
  catch {
    return []
  }
}

export function receiptAmenities(values: string[]): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    if (!value) continue
    const known = COURT_FACILITY_OPTIONS.find((option) =>
      option.slug === value
      || option.nameFa === value
      || option.nameEn.toLowerCase() === value.toLowerCase(),
    )
    const label = known?.nameFa ?? value
    if (seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels
}
